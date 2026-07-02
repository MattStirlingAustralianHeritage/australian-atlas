import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { computeRegionMetrics } from '@/lib/analytics/regionMetrics'
import { buildRegionalLetterEmail, buildRegionalLetterSummaryHtml } from '@/lib/email/regionalLetter'

/**
 * GET /api/cron/regional-letter
 *
 * "State of your region" — quarterly letter for every PAID operator (an
 * active or past_due `standard` claim in listing_claims). The Vercel cron
 * fires MONTHLY (1st, 23:00 UTC = 9am AEST on the 2nd); the route itself
 * self-skips unless the current AEST month opens a quarter (Jan/Apr/Jul/Oct)
 * or ?force=1 is passed. Skipped months still record an agent_runs row so
 * fleet-health's monthly cadence check stays satisfied.
 *
 * Per listing it resolves the venue's effective region via the FK relations
 * (region_override wins over region_computed — lib/regions getListingRegion),
 * then composes, per region (computed once and shared by every venue in it):
 *   - last-90d region rollups from the analytics_region_metrics RPC
 *     (migration 141) via computeRegionMetrics: region page views, clicks
 *     through to venues, active listings, new listings, top region searches
 *   - the venue's own 90d page views (pageviews, bot-filtered, slug
 *     boundary-matched — same shape as the operator digest) and search
 *     appearances (listing_search_appearances)
 *
 * Composition is entirely RULE-BASED — no Claude call. Every rendered fact is
 * a real DB number or a real visitor search query.
 *
 * Idempotency: reuses operator_digest_sends (migration 207, unique on
 * (listing_id, week_start)) with week_start = the first day of the current
 * quarter — bumped to the 2nd when the 1st falls on a Monday, so the key can
 * never collide with the weekly digest's Monday-only week_start keys. The
 * audit row is inserted BEFORE sending, so re-runs and races skip instead of
 * double-emailing an operator. metrics.kind = 'regional-letter' marks the
 * rows for audit queries.
 *
 * Query params:
 *   ?force=1           run even in a non-quarter month (same quarter key —
 *                      still idempotent against the quarter's real send)
 *   ?dryRun=1          compute + return JSON; nothing is recorded and the
 *                      only mail sent goes to Matt (one sample letter + the
 *                      summary)
 *   ?listingId=<uuid>  restrict to a single listing
 *
 * REPORTING ONLY — nothing here reads into or influences search/map/discover
 * ranking or any visitor-facing ordering.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const AGENT_NAME = 'regional-letter'
const MATT_EMAIL = 'matt@australianatlas.com.au'

const DAY_MS = 24 * 60 * 60 * 1000
const AEST_MS = 10 * 60 * 60 * 1000 // quarter/month boundary; DST-agnostic
const ROW_CAP = 10000

// Months (AEST) in which the letter actually goes out — the month right after
// a quarter closes.
const QUARTER_SEND_MONTHS = new Set([1, 4, 7, 10])

// Same slug discipline as /api/dashboard/stats and the operator digest — a
// conforming slug can't break the ilike pattern or the boundary regex below.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

export async function GET(request) {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === '1'
  const dryRun = searchParams.get('dryRun') === '1'
  const onlyListingId = searchParams.get('listingId')

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()

  const nowMs = Date.now()
  const { month, quarterKey, quarterLabel } = quarterInfo(nowMs)

  // ── Off-quarter month: record the heartbeat and exit ─────
  // The cron fires monthly so fleet-health can watch a monthly cadence; the
  // letter itself only goes out in the month a quarter opens.
  if (!QUARTER_SEND_MONTHS.has(month) && !force) {
    await completeRun(runId, {
      status: 'success',
      summary: { skipped: true, month, next_quarter_key: quarterKey },
    })
    return NextResponse.json({ skipped: true, month, detail: 'not a quarter month (pass ?force=1 to override)' })
  }

  const sinceMs = nowMs - 90 * DAY_MS
  const sinceIso = new Date(sinceMs).toISOString()
  const windowLabel = `${fmtAestDate(sinceMs)} – ${fmtAestDate(nowMs)}`

  const results = [] // { listingId, venueName, regionName, sentTo, status, detail, regionViews, ownViews }
  const errors = []

  // Region rollups are computed once per region and shared by every paid
  // venue in that region. Cached as promises so concurrent-looking loops
  // can't double-fire the RPC.
  const regionRollups = new Map()
  const regionRollup = (region) => {
    if (!regionRollups.has(region.id)) {
      regionRollups.set(region.id, computeRegionMetrics(sb, region, { since: sinceIso, limit: 5 }))
    }
    return regionRollups.get(region.id)
  }

  try {
    // ── 1. Every active PAID claim (active preferred over past_due) ──
    let claimsQuery = sb
      .from('listing_claims')
      .select('id, listing_id, claimant_email, tier, status')
      .eq('tier', 'standard')
      .in('status', ['active', 'past_due'])
      .order('status', { ascending: true }) // 'active' sorts before 'past_due'
    if (onlyListingId) claimsQuery = claimsQuery.eq('listing_id', onlyListingId)

    const { data: claims, error: claimsErr } = await claimsQuery
    if (claimsErr) throw claimsErr

    const claimByListing = new Map()
    for (const c of claims || []) {
      if (c.listing_id && !claimByListing.has(c.listing_id)) claimByListing.set(c.listing_id, c)
    }

    if (claimByListing.size === 0) {
      await completeRun(runId, {
        status: 'success',
        summary: { quarter: quarterLabel, quarter_key: quarterKey, paid_claims: 0, sent: 0, skipped: 0, failed: 0, dry_run: dryRun },
      })
      return NextResponse.json({ success: true, dryRun, quarterKey, quarterLabel, summary: { paid_claims: 0 }, results: [] })
    }

    const listingIds = [...claimByListing.keys()]

    // ── 2. Joined listings with FK region relations ──────────
    const { data: listings, error: listingsErr } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, ${LISTING_REGION_SELECT}`)
      .in('id', listingIds)
    if (listingsErr) throw listingsErr
    const listingById = new Map((listings || []).map(l => [l.id, l]))

    // ── 3. Idempotency — skip already-sent listing/quarter pairs ─
    // quarterKey is never a Monday (see quarterInfo), so every row carrying it
    // in operator_digest_sends was written by this letter, never the weekly
    // digest.
    const { data: sentRows, error: sentErr } = await sb
      .from('operator_digest_sends')
      .select('listing_id')
      .eq('week_start', quarterKey)
      .in('listing_id', listingIds)
    if (sentErr) throw sentErr
    const alreadySent = new Set((sentRows || []).map(r => r.listing_id))

    // ── 4. Per-listing letter ────────────────────────────────
    let dryRunSampleSent = false

    for (const listingId of listingIds) {
      const claim = claimByListing.get(listingId)
      const listing = listingById.get(listingId)

      if (!listing) {
        results.push({ listingId, venueName: '(listing missing)', regionName: null, sentTo: null, status: 'skipped', detail: 'claim has no matching listings row' })
        continue
      }
      if (alreadySent.has(listingId)) {
        results.push({ listingId, venueName: listing.name, regionName: null, sentTo: null, status: 'skipped', detail: 'already sent this quarter' })
        continue
      }
      if (!claim.claimant_email) {
        results.push({ listingId, venueName: listing.name, regionName: null, sentTo: null, status: 'skipped', detail: 'claim has no claimant_email' })
        continue
      }

      const region = getListingRegion(listing)
      if (!region?.id || !region?.slug || !region?.name) {
        results.push({ listingId, venueName: listing.name, regionName: null, sentTo: null, status: 'skipped', detail: 'no resolvable FK region for this listing' })
        continue
      }

      try {
        const [regionMetrics, ownMetrics] = await Promise.all([
          regionRollup(region),
          computeOwnMetrics(sb, listing, sinceIso),
        ])

        const email = buildRegionalLetterEmail({
          venueName: listing.name,
          regionName: region.name,
          regionState: region.state,
          quarterLabel,
          windowLabel,
          regionMetrics,
          ownMetrics,
        })

        const base = {
          listingId,
          venueName: listing.name,
          regionName: region.name,
          regionViews: regionMetrics.regionPageViews,
          ownViews: ownMetrics.views,
        }

        if (dryRun) {
          // Dry run: nothing recorded, operators get nothing. One sample
          // letter goes to Matt so the rendered email can be eyeballed.
          let sentTo = null
          if (!dryRunSampleSent) {
            const ok = await sendResendEmail({
              from: email.from,
              replyTo: email.replyTo,
              to: MATT_EMAIL,
              subject: `[DRY RUN] ${email.subject}`,
              html: email.html,
            })
            if (ok) {
              sentTo = MATT_EMAIL
              dryRunSampleSent = true
            }
          }
          results.push({ ...base, sentTo, status: sentTo ? 'sent' : 'previewed', detail: sentTo ? 'dry-run sample to Matt' : 'dry run — not sent' })
          continue
        }

        // Claim the (listing, quarter) slot BEFORE sending: a unique-violation
        // means another run got here first, so we skip rather than risk
        // double-emailing the operator. If the send below then fails, the
        // row stands (no retry-spam) and the failure is surfaced to Matt.
        const { error: insErr } = await sb.from('operator_digest_sends').insert({
          listing_id: listingId,
          claim_id: claim.id,
          week_start: quarterKey,
          sent_to: claim.claimant_email,
          metrics: {
            kind: 'regional-letter',
            quarter: quarterLabel,
            window_label: windowLabel,
            region: { id: region.id, slug: region.slug, name: region.name, state: region.state },
            region_page_views: regionMetrics.regionPageViews,
            region_clicks: regionMetrics.totalClicks,
            region_total_listings: regionMetrics.totalListings,
            region_new_listings: regionMetrics.newListings,
            top_searches: regionMetrics.topSearches,
            own_views: ownMetrics.views,
            own_search_appearances: ownMetrics.search_appearances,
          },
        })
        if (insErr) {
          if (insErr.code === '23505') {
            results.push({ ...base, sentTo: null, status: 'skipped', detail: 'already sent this quarter (concurrent run)' })
            continue
          }
          throw insErr
        }

        try {
          const ok = await sendResendEmail({
            from: email.from,
            replyTo: email.replyTo,
            to: claim.claimant_email,
            subject: email.subject,
            html: email.html,
          })
          results.push({
            ...base,
            sentTo: claim.claimant_email,
            status: ok ? 'sent' : 'failed',
            detail: ok ? null : 'RESEND_API_KEY not set — audit row recorded, email not sent',
          })
        } catch (sendErr) {
          errors.push(`${listing.name}: send failed: ${sendErr.message}`)
          results.push({ ...base, sentTo: claim.claimant_email, status: 'failed', detail: `audit row recorded; send failed: ${sendErr.message}` })
        }
      } catch (err) {
        console.error(`[regional-letter] ${listing.name} (${listingId}):`, err.message)
        errors.push(`${listing.name}: ${err.message}`)
        results.push({ listingId, venueName: listing.name, regionName: region.name, sentTo: null, status: 'failed', detail: err.message })
      }
    }

    // ── 5. Summary email to Matt — who got what ──────────────
    await sendAgentEmail({
      subject: `Regional Letter${dryRun ? ' (dry run)' : ''} — ${quarterLabel}: ${results.filter(r => r.status === 'sent').length} sent`,
      html: buildRegionalLetterSummaryHtml({
        quarterLabel,
        quarterKey,
        windowLabel,
        dryRun,
        results: results.map(r => ({
          venueName: r.venueName,
          regionName: r.regionName,
          sentTo: r.sentTo,
          status: r.status,
          regionViews: r.regionViews,
          ownViews: r.ownViews,
          detail: r.detail,
        })),
      }),
    })

    // ── 6. Complete run ──────────────────────────────────────
    const summary = {
      quarter: quarterLabel,
      quarter_key: quarterKey,
      paid_claims: claimByListing.size,
      regions: regionRollups.size,
      sent: results.filter(r => r.status === 'sent').length,
      previewed: results.filter(r => r.status === 'previewed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      dry_run: dryRun,
      errors: errors.length,
    }
    await completeRun(runId, {
      status: errors.length > 0 ? 'partial' : 'success',
      summary,
      error: errors.length > 0 ? errors.join('; ') : null,
    })

    return NextResponse.json({ success: true, dryRun, quarterKey, quarterLabel, summary, results })
  } catch (err) {
    console.error('[regional-letter] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: 'Regional letter failed', detail: err.message }, { status: 500 })
  }
}

// ─── The venue's own 90-day numbers ────────────────────────
// Same sources and filters as the operator digest / dashboard stats: human
// pageviews for the /place page (slug boundary-matched so /place/foo doesn't
// count /place/foo-bar) and listing_search_appearances head-count.
async function computeOwnMetrics(sb, listing, sinceIso) {
  const slugOk = !!(listing.slug && SAFE_SLUG.test(listing.slug))
  const exact = slugOk ? new RegExp(`/place/${listing.slug}(?:[/?#]|$)`, 'i') : null

  const [pvRes, saRes] = await Promise.all([
    slugOk
      ? sb.from('pageviews')
          .select('path')
          .ilike('path', `%/place/${listing.slug}%`)
          .not('is_bot', 'is', true)
          .gte('ts', sinceIso)
          .order('ts', { ascending: false })
          .limit(ROW_CAP)
      : Promise.resolve({ data: [], error: null }),
    sb.from('listing_search_appearances')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .gte('appeared_at', sinceIso),
  ])
  for (const r of [pvRes, saRes]) {
    if (r.error) throw r.error
  }

  let views = 0
  for (const row of pvRes.data || []) {
    if (exact && !exact.test(row.path || '')) continue
    views += 1
  }

  return { views, search_appearances: saRes.count || 0 }
}

// ─── Email transport ───────────────────────────────────────

// Send one letter via Resend. Graceful no-op (returns false) when
// RESEND_API_KEY is missing — same degradation as lib/agents/email.js.
// Throws on an actual send failure so the caller can record it.
async function sendResendEmail({ from, replyTo, to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[regional-letter] RESEND_API_KEY not set — skipping email to ${to}`)
    return false
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from, replyTo, to, subject, html })
  if (error) throw new Error(error.message || 'Resend send failed')
  return true
}

// ─── Date helpers ──────────────────────────────────────────

/**
 * Current AEST month plus the quarter identity for this run.
 *
 * quarterKey — the idempotency date written to operator_digest_sends
 * .week_start: the first day of the CURRENT quarter, bumped to the 2nd when
 * the 1st falls on a Monday. The weekly operator digest only ever writes
 * Monday dates (aestWeekStart), so a non-Monday key can never collide with a
 * digest row under the shared unique (listing_id, week_start) constraint.
 * A ?force=1 run mid-quarter resolves to the same key as the quarter's real
 * send, so it stays idempotent.
 *
 * quarterLabel — the quarter the trailing-90-day window actually reports on,
 * i.e. the one that just ENDED (a January send reports Q4 of the prior year).
 */
function quarterInfo(nowMs) {
  const d = new Date(nowMs + AEST_MS)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1 // 1 | 4 | 7 | 10

  const keyDate = new Date(Date.UTC(year, qStartMonth - 1, 1))
  if (keyDate.getUTCDay() === 1) keyDate.setUTCDate(2) // never a Monday
  const quarterKey = keyDate.toISOString().slice(0, 10)

  const endedQuarter = (((qStartMonth - 1) / 3 + 3) % 4) + 1 // 1→Q4, 4→Q1, 7→Q2, 10→Q3
  const endedYear = qStartMonth === 1 ? year - 1 : year
  const quarterLabel = `Q${endedQuarter} ${endedYear}`

  return { month, quarterKey, quarterLabel }
}

function fmtAestDate(ms) {
  return new Date(ms).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  })
}
