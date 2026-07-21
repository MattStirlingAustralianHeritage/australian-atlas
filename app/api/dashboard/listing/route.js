import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { updateListing } from '@/lib/admin/updateListing'
import { isApprovedImageSource } from '@/lib/image-utils'
import { readGalleryEntries, writeGalleryEntries, galleryModerationStatus, isListingPaid, MAX_GALLERY_PHOTOS } from '@/lib/listing-gallery'
import { normalizeHighlights } from '@/lib/operator-highlights/normalize'
import { normalizeSearchKeywords } from '@/lib/search-keywords/normalize'
import { normalizeTradeReadiness, normalizeTradeProfile } from '@/lib/trade-readiness/normalize'
import { parseVideoUrl } from '@/lib/video-embed'
import { upsertTradeProfile } from '@/lib/trade/profile'
import { regenerateListingEmbedding } from '@/lib/embeddings/regenerateOne'
import { moderateImageUrl } from '@/lib/moderation/imageModeration'

/**
 * PATCH /api/dashboard/listing — operator self-service edit of a claimed listing.
 *
 * Auth: Bearer atlas shared JWT. Caller must be admin, or the OWNER of the
 * listing — an active listing_claims row whose claimed_by is the authenticated
 * user. Vertical membership no longer grants edit rights (that let any vendor in
 * a vertical edit every claimed listing in it). Admins bypass the ownership check.
 *
 * Body: { listing_id, website?, phone?, hours?, hero_image_url?, gallery_image_urls?, video_url? }
 *
 * Tiering ("keeper of the facts"): a FREE claim verifies ownership and lets the
 * owner keep the facts current — ONLY website, phone and hours (the
 * FREE_TIER_FIELDS set). Any other field on a free claim → 403. A paid claim
 * (active or past_due standard — isListingPaid) unlocks everything. Admins
 * bypass the tier gate entirely.
 *
 * website / phone / hero_image_url flow through the canonical updateListing(),
 * which writes master AND pushes to the vertical source DB — so the next inbound
 * sync is a no-op diff and the edit survives. hours is written directly to
 * listings.hours (JSONB): the inbound field maps never set listings.hours, so a
 * master-only write is sync-safe by omission (same contract as description).
 *
 * gallery_image_urls is a PAID perk (active standard claim) and is stored as a
 * master-only storage manifest (see lib/listing-gallery) — not a listings
 * column — so it too survives sync and needs no DDL. Each URL must pass
 * isApprovedImageSource (our own Storage host), capping arbitrary external URLs.
 */

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/ // 24h HH:MM — matches OpeningHours/jsonLd expectations

// The facts a FREE claim may keep current. Everything else in the body is a
// Standard-plan feature (photos, gallery, highlights, search keywords).
const FREE_TIER_FIELDS = ['website', 'phone', 'hours']

/**
 * Normalise an incoming hours object into the shape the public renderer expects:
 *   { monday: { open: "HH:MM", close: "HH:MM" }, ... }  (closed days omitted)
 * Returns { ok: true, hours } (hours may be null = no hours) or { ok: false, error }.
 */
function normaliseHours(input) {
  if (input == null) return { ok: true, hours: null }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'hours must be an object keyed by weekday' }
  }
  const out = {}
  for (const day of DAY_KEYS) {
    const v = input[day]
    if (!v) continue // falsy / absent → closed
    if (typeof v !== 'object' || !v.open || !v.close) {
      return { ok: false, error: `Invalid hours for ${day}` }
    }
    if (!TIME_RE.test(v.open) || !TIME_RE.test(v.close)) {
      return { ok: false, error: `Times for ${day} must be HH:MM (24-hour)` }
    }
    out[day] = { open: v.open, close: v.close }
  }
  return { ok: true, hours: Object.keys(out).length ? out : null }
}

export async function PATCH(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const listingId = body.listing_id
  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing_id' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // ── Ownership: listing must exist and be claimed. Non-admins may edit ONLY a
  //    listing they own — an active listing_claims row whose claimed_by is the
  //    authenticated user (across whatever verticals they own). Vertical
  //    membership no longer grants edit rights. Admins bypass the check. ──
  const { data: owned, error: ownErr } = await sb
    .from('listings')
    .select('id, vertical, sub_type, sub_types, is_claimed, hero_image_url')
    .eq('id', listingId)
    .single()

  if (ownErr || !owned) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  // No is_claimed gate here: ownership is the listing_claims row checked
  // below. Gating on the derived display flag is the anti-pattern that locked
  // every operator out in the 2026-07-21 incident — see "Ownership State
  // Protection" in CLAUDE.md.
  if (user.role !== 'admin') {
    const { data: ownClaim } = await sb
      .from('listing_claims')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimed_by', user.id)
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
      .maybeSingle()
    if (!ownClaim) {
      return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
    }
  }

  // ── Tier gate: a free claim is "keeper of the facts". A free-tier claim
  //    verifies ownership and keeps the listing live in search and trails, and
  //    its owner may keep the FACTS current — opening hours, phone and website
  //    (FREE_TIER_FIELDS) — through the same canonical write paths the paid
  //    tier uses. Everything else (photos, gallery, highlights, search
  //    keywords) requires a *standard* claim — the same isListingPaid signal
  //    the gallery and Producer's Picks use. Admins bypass. This is the
  //    server-side backstop behind the dashboard's locked sections: without it
  //    a free operator could PATCH this route directly and bypass the paywall. ──
  const paid = user.role === 'admin' || await isListingPaid(sb, listingId)
  if (!paid) {
    const lockedFields = Object.keys(body).filter(k => k !== 'listing_id' && !FREE_TIER_FIELDS.includes(k))
    if (lockedFields.length > 0) {
      return NextResponse.json(
        {
          error: 'On a free claim you can keep the facts current — opening hours, phone and website. Photos, highlights and keywords are Standard-plan features. Upgrade to unlock the rest of your listing.',
          code: 'payment_required',
          upgrade: true,
          locked_fields: lockedFields,
        },
        { status: 403 }
      )
    }
  }

  // ── Base fields → canonical updateListing (master write + vertical sync-back) ──
  // hero_image_url is handled SEPARATELY below — a NEW operator upload is moderated
  // before it can become eligible for public display or be pushed to the vertical
  // source DB, so it must not ride this unconditional sync.
  const baseUpdates = {}
  if ('website' in body) baseUpdates.website = body.website
  if ('phone' in body) baseUpdates.phone = body.phone === '' ? null : body.phone

  let verticalSync = null
  if (Object.keys(baseUpdates).length > 0) {
    const result = await updateListing(listingId, baseUpdates, { action: 'operator-edit' })
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 400 })
    }
    verticalSync = result.verticalSync
  }

  // ── hero_image_url → AI-moderated write + gated sync ────────────────────────
  // Operators upload to our public Storage bucket via
  // /api/dashboard/listing/upload, then save the returned URL here. Every NEW
  // hero is triaged by the image-moderation model (lib/moderation) BEFORE it can
  // appear on the portal or be synced to the vertical site. Bias toward holding —
  // any uncertainty fails closed to 'held'. The verdict gates this write's sync;
  // the central sync gate (lib/sync/pushToVertical) is the belt-and-braces that
  // also keeps a blocked hero from leaking on a later unrelated edit.
  let imageModeration = null
  if ('hero_image_url' in body) {
    const currentHero = owned.hero_image_url || null
    const newHero = body.hero_image_url || null

    if (!newHero) {
      // Cleared — nothing to moderate. Remove it (sync the removal) + reset status.
      const heroRes = await updateListing(listingId, { hero_image_url: null }, { action: 'operator-edit' })
      if (!heroRes.success) {
        return NextResponse.json({ error: heroRes.error || 'Update failed' }, { status: 400 })
      }
      await sb.from('listings').update({
        image_moderation_status: 'pending',
        image_moderation_category: null,
        image_moderation_reason: null,
        image_moderation_confidence: null,
        image_moderation_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', listingId).then(({ error }) => {
        if (error && error.code !== '42703') console.warn('[dashboard] moderation reset failed:', error.message)
      })
      imageModeration = { status: 'pending' }
    } else if (newHero === currentHero) {
      // Unchanged — keep the existing verdict, re-affirm the value (sync is gated
      // centrally on the stored status, so a held image still won't propagate).
      const heroRes = await updateListing(listingId, { hero_image_url: newHero }, { action: 'operator-edit' })
      if (!heroRes.success) {
        return NextResponse.json({ error: heroRes.error || 'Update failed' }, { status: 400 })
      }
    } else {
      // NEW image → moderate before it can go public.
      const verdict = isApprovedImageSource(newHero)
        ? await moderateImageUrl(newHero)
        // Not one of our upload hosts — we won't fetch arbitrary URLs to verify.
        // Hold it (fail closed) rather than trust an unknown source.
        : { status: 'held', category: 'unverified_source', reason: 'Image is not from an approved upload source', confidence: null }

      const blocked = verdict.status === 'flagged' || verdict.status === 'held'
      // Write the new hero to master either way (so it is the listing's hero and
      // is reviewable in Candidate Review), but sync to the vertical ONLY when the
      // verdict is clean.
      const heroRes = await updateListing(
        listingId,
        { hero_image_url: newHero },
        { action: blocked ? 'operator-hero-held' : 'operator-edit', syncToVertical: !blocked }
      )
      if (!heroRes.success) {
        return NextResponse.json({ error: heroRes.error || 'Update failed' }, { status: 400 })
      }

      const { error: modErr } = await sb.from('listings').update({
        image_moderation_status: verdict.status,
        image_moderation_category: verdict.category || null,
        image_moderation_reason: verdict.reason || null,
        image_moderation_confidence: verdict.confidence ?? null,
        image_moderation_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', listingId)

      if (modErr) {
        // Forward-compat: columns absent until migration 164 is applied. We just
        // wrote an unverified hero we now can't gate — fail closed by reverting it
        // to the previous value (master only) rather than letting it through.
        if (modErr.code === '42703') {
          await updateListing(listingId, { hero_image_url: currentHero }, { action: 'operator-hero-revert', syncToVertical: false })
          return NextResponse.json({ error: 'Image moderation isn’t switched on yet — please try again shortly.' }, { status: 503 })
        }
        return NextResponse.json({ error: `Failed to record image moderation: ${modErr.message}` }, { status: 400 })
      }
      imageModeration = { status: verdict.status, category: verdict.category || null, reason: verdict.reason || null }
    }
  }

  // ── hours → master-only write (listings.hours is never set by inbound sync) ──
  if ('hours' in body) {
    const norm = normaliseHours(body.hours)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    const { error: hoursErr } = await sb
      .from('listings')
      .update({ hours: norm.hours, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (hoursErr) {
      return NextResponse.json({ error: `Failed to save hours: ${hoursErr.message}` }, { status: 400 })
    }
  }

  // ── gallery → AI-moderated, master-only storage manifest (PAID perk) ──
  // Every NEW gallery image is triaged before it is eligible for public display,
  // exactly like the hero (same model, same fail-closed decision). The manifest
  // carries per-image verdicts; readGallery() returns clean-only URLs so the
  // public lightbox auto-gates, and a roll-up marker on the listings row lets
  // Candidate Review find galleries needing review.
  let savedGallery
  let galleryModeration = null
  if ('gallery_image_urls' in body) {
    const raw = body.gallery_image_urls
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'gallery_image_urls must be an array' }, { status: 400 })
    }
    const urls = []
    for (const u of raw) {
      if (typeof u !== 'string' || !u) continue
      if (!isApprovedImageSource(u)) {
        return NextResponse.json({ error: 'Gallery photos must be uploaded through the editor' }, { status: 400 })
      }
      if (!urls.includes(u)) urls.push(u)
    }
    if (urls.length > MAX_GALLERY_PHOTOS) {
      return NextResponse.json({ error: `A gallery can hold at most ${MAX_GALLERY_PHOTOS} photos` }, { status: 400 })
    }
    // Adding photos requires a paid listing; admins may stage on any listing
    // (paid above is true for admins, so this is belt-and-braces with the tier gate).
    if (urls.length > 0 && !paid) {
      return NextResponse.json({ error: 'Photo galleries are a paid feature — upgrade this listing to add photos.' }, { status: 403 })
    }

    // Reuse an existing CLEAN verdict for an unchanged URL (no re-spend);
    // moderate everything else — new uploads, and re-checks of held/flagged ones.
    const prior = await readGalleryEntries(sb, listingId)
    const priorByUrl = new Map(prior.map(e => [e.url, e]))
    const entries = []
    for (const url of urls) {
      const known = priorByUrl.get(url)
      if (known && known.status === 'clean') {
        entries.push(known)
        continue
      }
      const verdict = await moderateImageUrl(url) // approved-source enforced above
      entries.push({
        url,
        status: verdict.status,
        category: verdict.category || null,
        reason: verdict.reason || null,
        confidence: verdict.confidence ?? null,
        checked_at: new Date().toISOString(),
      })
    }
    const saved = await writeGalleryEntries(sb, listingId, entries)

    // Queryable roll-up marker for Candidate Review (guarded — column lands with
    // migration 164; pre-migration the manifest still gates display correctly).
    await sb.from('listings')
      .update({ gallery_moderation_status: galleryModerationStatus(saved), updated_at: new Date().toISOString() })
      .eq('id', listingId)
      .then(({ error }) => { if (error && error.code !== '42703') console.warn('[dashboard] gallery moderation marker failed:', error.message) })

    // Return ALL urls (so the operator's editor keeps held/flagged ones to manage)
    // plus a per-url status list + counts for the save notice.
    savedGallery = saved.map(e => e.url)
    galleryModeration = {
      statuses: saved.map(e => ({ url: e.url, status: e.status, reason: e.reason })),
      flagged: saved.filter(e => e.status === 'flagged').length,
      held: saved.filter(e => e.status === 'held').length,
      hidden: saved.filter(e => e.status !== 'clean').length,
    }
  }

  // ── operator_highlights → master-only write (never synced; sync-safe by
  //    omission, same contract as hours). Normalised + voice-checked server-side
  //    against the field set for this listing's vertical/sub_type. ──
  let savedHighlights
  if ('operator_highlights' in body) {
    const subType = owned.sub_type
      || (Array.isArray(owned.sub_types) && owned.sub_types[0])
      || null
    const norm = normalizeHighlights(body.operator_highlights, owned.vertical, subType)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    // needs_embedding: highlights are part of the search document (lexical via
    // operator_highlights_search_text, semantic via buildListingText), so an
    // edit re-embeds on the next cron. Explicit here so the loop closes even
    // before the migration-159 drift trigger covers non-dashboard writes.
    const { error: hErr } = await sb
      .from('listings')
      .update({ operator_highlights: norm.value, needs_embedding: true, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (hErr) {
      // Forward-compat: column absent until migration 157 is applied.
      if (hErr.code === '42703') {
        return NextResponse.json({ error: 'Highlights aren’t switched on yet — please try again shortly.' }, { status: 503 })
      }
      return NextResponse.json({ error: `Failed to save highlights: ${hErr.message}` }, { status: 400 })
    }
    savedHighlights = norm.value
  }

  // ── search_keywords → master-only write (search-only: never rendered, never
  //    synced — the same sync-safe-by-omission contract as hours/highlights).
  //    The terms feed this listing's embedding (lib/embeddings/sourceText.js)
  //    and the lexical search document (migration 162). We regenerate ONLY this
  //    listing's vector inline so the change is searchable immediately, with no
  //    bulk job; needs_embedding=true is the safety net (the cron retries if
  //    Voyage is momentarily unavailable). ──
  let savedKeywords
  if ('search_keywords' in body) {
    const norm = normalizeSearchKeywords(body.search_keywords)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    const { error: kErr } = await sb
      .from('listings')
      .update({ search_keywords: norm.value, needs_embedding: true, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (kErr) {
      // Forward-compat: column absent until migration 161 is applied.
      if (kErr.code === '42703') {
        return NextResponse.json({ error: 'Search keywords aren’t switched on yet — please try again shortly.' }, { status: 503 })
      }
      return NextResponse.json({ error: `Failed to save keywords: ${kErr.message}` }, { status: 400 })
    }
    try {
      await regenerateListingEmbedding(sb, listingId)
    } catch (e) {
      // Inline re-embed is best-effort; needs_embedding=true above lets the cron
      // refresh the vector. The save itself still succeeds.
      console.warn(`[dashboard] inline re-embed deferred for ${listingId}: ${e.message}`)
    }
    savedKeywords = norm.value
  }

  // ── video_url → master-only write (paid perk, migration 225). One featured
  //    video from an allowlisted platform — YouTube, TikTok or Instagram. The
  //    tier gate above already 403s this field on a free claim; here the link
  //    is allowlist-validated and normalised to its canonical watch URL (null
  //    clears it). Never synced to a vertical (absent from lib/sync/fieldMaps)
  //    — the same sync-safe-by-omission contract as hours/highlights. ──
  let savedVideo
  if ('video_url' in body) {
    const raw = body.video_url
    let canonical = null
    if (raw != null && raw !== '') {
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'video_url must be a URL string' }, { status: 400 })
      }
      const parsedVideo = parseVideoUrl(raw)
      if (!parsedVideo) {
        return NextResponse.json(
          { error: 'That link doesn’t look like a YouTube, TikTok or Instagram video. Paste the video’s own page link — e.g. youtube.com/watch?v=…, tiktok.com/@you/video/… or instagram.com/reel/….' },
          { status: 400 }
        )
      }
      canonical = parsedVideo.watchUrl
    }
    const { error: vErr } = await sb
      .from('listings')
      .update({ video_url: canonical, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (vErr) {
      // Forward-compat: column absent until migration 225 is applied.
      if (vErr.code === '42703') {
        return NextResponse.json({ error: 'Video isn’t switched on yet — please try again shortly.' }, { status: 503 })
      }
      return NextResponse.json({ error: `Failed to save video: ${vErr.message}` }, { status: 400 })
    }
    savedVideo = canonical
  }

  // ── trade_readiness → master-only write (Atlas Trade operator profile).
  //    Never synced to a vertical (not in lib/sync/fieldMaps) and never search-
  //    indexed — operator metadata only, sync-safe by omission like hours /
  //    operator_highlights. trade_welcome gates inclusion via the
  //    trade_buildable_listings view (migration 170); the sub-values are written
  //    exactly as sent, so a master/group toggle-off in the UI preserves them. ──
  let savedTrade
  if ('trade_readiness' in body) {
    const norm = normalizeTradeReadiness(body.trade_readiness)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    const { error: tErr } = await sb
      .from('listings')
      .update({ ...norm.value, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (tErr) {
      // Forward-compat: columns land with migration 170.
      if (tErr.code === '42703') {
        return NextResponse.json({ error: 'Trade readiness isn’t switched on yet — please try again shortly.' }, { status: 503 })
      }
      return NextResponse.json({ error: `Failed to save trade readiness: ${tErr.message}` }, { status: 400 })
    }
    savedTrade = norm.value
  }

  // ── trade_profile → listing_trade_profiles upsert (migration 204).
  //    The fact-sheet depth: notice period, coach access, languages, dietary,
  //    capacity, seasonality, insurance, famils + the TRADE-ONLY contact
  //    channel. Separate table (service-role-only RLS) so the contact channel
  //    never rides along on anon listings reads. ──
  let savedProfile
  if ('trade_profile' in body) {
    const norm = normalizeTradeProfile(body.trade_profile)
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 })
    }
    const result = await upsertTradeProfile(sb, listingId, norm.value)
    if (!result.ok) {
      // Forward-compat: the table lands with migration 204.
      if (/listing_trade_profiles/.test(result.error || '') || /42P01/.test(result.error || '')) {
        return NextResponse.json({ error: 'The trade profile isn’t switched on yet — please try again shortly.' }, { status: 503 })
      }
      return NextResponse.json({ error: `Failed to save trade profile: ${result.error}` }, { status: 400 })
    }
    savedProfile = norm.value
  }

  const { data: fresh } = await sb
    .from('listings')
    .select('id, name, slug, vertical, website, phone, hours, hero_image_url, description, is_claimed, status, search_keywords, trade_welcome, trade_bespoke, trade_group, trade_group_size_max, trade_contact_before_booking, trade_rates_available')
    .eq('id', listingId)
    .single()

  if (fresh && savedVideo !== undefined) fresh.video_url = savedVideo
  if (fresh && savedGallery !== undefined) fresh.gallery_image_urls = savedGallery
  if (fresh && savedHighlights !== undefined) fresh.operator_highlights = savedHighlights
  if (fresh && savedKeywords !== undefined) fresh.search_keywords = savedKeywords
  if (fresh && savedTrade !== undefined) Object.assign(fresh, savedTrade)
  if (fresh && savedProfile !== undefined) fresh.trade_profile = savedProfile

  return NextResponse.json({ success: true, listing: fresh, verticalSync, imageModeration, galleryModeration })
}
