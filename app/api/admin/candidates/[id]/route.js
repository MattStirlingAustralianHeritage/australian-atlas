import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { regenerateListingEmbedding } from '@/lib/embeddings/regenerateOne'
import { pushToVerticalWithRetry, updateInVertical, getVerticalListingUrl, VERTICAL_DISPLAY_NAMES, VERTICAL_CATEGORIES, recordSyncAndRevalidate } from '@/lib/sync/pushToVertical'
import { resolveRegionName } from '@/lib/regions'
import { extractStateFromPlaceName, deriveStateFromCoords, VALID_STATES } from '@/lib/geo/stateDerivation'
import { fetchSiteText } from '@/lib/scrape/fetchSiteText'
import { reserveAnthropicBudget, reconcileAnthropicBudget } from '@/lib/ai/guardedAnthropic'
import { estimateTokens } from '@/lib/budget/governor'
// Hero image scraping removed — all new listings use the default fallback hero.
// Venue owners upload their own hero image when they claim the listing.

// Allow headroom for the direct fetch + reader-proxy fallback + Claude call.
export const maxDuration = 60

/** Normalise a URL to include https:// prefix */
function normaliseUrl(url) {
  if (!url) return null
  let u = url.trim()
  u = u.replace(/^https?\/\//, 'https://')
  u = u.replace(/^https?:\/(?=[^/])/, 'https://')
  if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`
  }
  if (u.startsWith('http://')) {
    u = u.replace(/^http:\/\//, 'https://')
  }
  return u
}

const VERTICAL_LABELS = {
  sba: 'artisan food & drink producer', collection: 'museum, gallery, or collection',
  craft: 'maker or artisan studio', fine_grounds: 'specialty coffee roaster or cafe',
  rest: 'boutique accommodation', field: 'outdoor or nature destination',
  corner: 'independent retail shop', found: 'vintage, antique, or secondhand shop',
  table: 'independent restaurant, cafe, or food producer',
}

// VERTICAL_CATEGORIES imported from pushToVertical.js (single source of truth)

// ─── Website Enrichment ────────────────────────────────────

/** Fetch a URL and return stripped plain text + og:image.
 *  Delegates to the shared fetcher (browser headers → Jina reader fallback) so
 *  Cloudflare/WAF-protected operator sites that 403 our datacenter fetch still
 *  enrich. Returns { text, ogImage } — text is the page content (max 8000 chars).
 */
async function fetchWebsiteContent(url) {
  const { text, ogImage, status, via } = await fetchSiteText(url, { maxChars: 8000 })
  if (!text) {
    console.log(`[fetchWebsite] No content for ${url} (HTTP ${status || 'error'})`)
  } else if (via === 'reader') {
    console.log(`[fetchWebsite] Fetched ${url} via reader proxy (direct fetch blocked)`)
  }
  return { text, ogImage }
}

/** Ask Claude to extract structured venue data from website text */
async function enrichFromWebsite(candidate, websiteText) {
  const type = VERTICAL_LABELS[candidate.vertical] || 'venue'
  const categories = VERTICAL_CATEGORIES[candidate.vertical] || []

  const prompt = `Extract structured venue data from this website for "${candidate.name}", a ${type}${candidate.region ? ` in ${candidate.region}` : ''}.

Website content:
${websiteText}

Return a JSON object. Use null for any field you cannot confidently determine. Do NOT guess or invent information.

{
  "description": "2-3 sentence editorial description. Warm, concise, like a curated travel guide. Do not include the venue name.",
  "address": "Full street address",
  "suburb": "Suburb or town",
  "state": "Australian state abbreviation (NSW, VIC, QLD, SA, WA, TAS, ACT, NT)",
  "postcode": "4-digit postcode",
  "phone": "Phone number",
  "email": "Contact email",
  "opening_hours": {
    "monday": "e.g. 9:00 AM – 5:00 PM, or Closed, or null if unknown",
    "tuesday": "...", "wednesday": "...", "thursday": "...",
    "friday": "...", "saturday": "...", "sunday": "..."
  },
  "instagram_handle": "Instagram handle without @, or null",
  "category": "One of: ${categories.join(', ')}"
}

Return ONLY valid JSON, no markdown fences, no other text.`

  try {
    const _resv = await reserveAnthropicBudget({ model: 'claude-haiku-4-5', inputTokens: estimateTokens(prompt), maxOutputTokens: 1000 })
    if (!_resv.ok) {
      console.warn('[enrichFromWebsite] anthropic monthly budget reached — skipping')
      return null
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[enrichFromWebsite] Claude API ${res.status}: ${errBody.slice(0, 300)}`)
      return null
    }
    const result = await res.json()
    await reconcileAnthropicBudget(_resv, result.usage)
    const text = result.content?.[0]?.text?.trim()
    if (!text) {
      console.error('[enrichFromWebsite] Claude returned empty content')
      return null
    }
    // Strip markdown fences — handle ``` anywhere in the response, not just at boundaries
    let jsonStr = text
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim()
    } else {
      jsonStr = jsonStr.replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim()
    }
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error(`[enrichFromWebsite] Error for "${candidate.name}":`, err.message || err)
    return null
  }
}

/** Geocode an address via Mapbox.
 *  @param {string} address - Street address
 *  @param {string} [state] - State code (e.g. 'SA')
 *  @param {string} [suburb] - City/suburb to improve accuracy
 *  @returns {{ lat: number, lng: number, place_name: string } | null}
 */
async function geocodeAddress(address, state, suburb) {
  if (!address) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null
  try {
    const parts = [address, suburb, state, 'Australia'].filter(Boolean)
    const query = parts.join(', ')
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    return { lat: feature.center[1], lng: feature.center[0], place_name: feature.place_name || null }
  } catch {
    return null
  }
}

// ─── Description Generation (fallback when no website) ─────

async function generateDescription(candidate, attempt = 1) {
  const type = VERTICAL_LABELS[candidate.vertical] || 'venue'
  const prompt = `Write a 2–3 sentence editorial description for "${candidate.name}", a ${type} in ${candidate.region || 'Australia'}. ${candidate.notes ? `Context: ${candidate.notes}` : ''}

Tone: warm, concise, editorial — like a curated travel guide. Focus on what makes the place distinctive. Do not invent specific details you don't know. Do not include the venue name in the description. Return only the description text, nothing else.`

  try {
    const _resv = await reserveAnthropicBudget({ model: 'claude-haiku-4-5', inputTokens: estimateTokens(prompt), maxOutputTokens: 300 })
    if (!_resv.ok) {
      console.warn('[generateDescription] anthropic monthly budget reached — skipping')
      return null
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[generateDescription] Claude API ${res.status} (attempt ${attempt}): ${errBody.slice(0, 300)}`)
      // Retry once on transient failures (429, 500, 502, 503, 529)
      if (attempt === 1 && [429, 500, 502, 503, 529].includes(res.status)) {
        await new Promise(r => setTimeout(r, 2000))
        return generateDescription(candidate, 2)
      }
      return null
    }
    const result = await res.json()
    await reconcileAnthropicBudget(_resv, result.usage)
    const text = result.content?.[0]?.text?.trim()
    if (!text) {
      console.error('[generateDescription] Claude returned empty content')
    }
    return text || null
  } catch (err) {
    console.error(`[generateDescription] Error for "${candidate.name}" (attempt ${attempt}):`, err.message || err)
    if (attempt === 1) {
      await new Promise(r => setTimeout(r, 2000))
      return generateDescription(candidate, 2)
    }
    return null
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── PATCH — update candidate fields (inline editing) ──────

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing candidate ID' }, { status: 400 })
  }

  try {
    const body = await request.json()

    const allowed = ['name', 'vertical', 'verticals', 'region', 'website_url', 'description', 'notes', 'confidence', 'pipeline_stage', 'priority', 'sub_type', 'state']
    const updates = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    let { data, error } = await sb
      .from('listing_candidates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    // Forward-compat: `verticals` (migration 142) may be absent. Drop it and
    // retry so other inline edits still persist pre-migration.
    if (error && (error.code === '42703' || /column .*verticals.* does not exist/i.test(error.message || '')) && 'verticals' in updates) {
      console.warn('[admin/candidates/PATCH] verticals column absent (migration 142 pending) — saving without it')
      delete updates.verticals
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ candidate: null, warning: 'verticals column not yet migrated' })
      }
      ;({ data, error } = await sb
        .from('listing_candidates')
        .update(updates)
        .eq('id', id)
        .select()
        .single())
    }

    // Unique index idx_candidates_name_vertical (lower(trim(name)), vertical):
    // moving this candidate into a vertical that already has a same-named
    // candidate trips a 23505. Surface a clear, actionable conflict instead of
    // an opaque 500 (which the UI swallowed silently — looked like "nothing
    // happened").
    if (error && error.code === '23505') {
      const targetVertical = 'vertical' in updates ? updates.vertical : null
      const verticalName = (targetVertical && VERTICAL_DISPLAY_NAMES[targetVertical]) || targetVertical || 'that vertical'
      // Best-effort name lookup for a friendlier message (error path only).
      let name = 'this candidate'
      try {
        const { data: row } = await sb.from('listing_candidates').select('name').eq('id', id).maybeSingle()
        if (row?.name) name = `"${row.name}"`
      } catch { /* keep generic name */ }
      return NextResponse.json({
        error: `Can't move ${name} to ${verticalName} — a candidate with the same name already exists in that queue. Reject or rename the duplicate first.`,
        code: 'duplicate_candidate',
      }, { status: 409 })
    }

    if (error) throw error

    return NextResponse.json({ candidate: data })
  } catch (err) {
    console.error('[admin/candidates/PATCH] Error:', err.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// ─── POST — approve or reject a candidate ──────────────────

export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing candidate ID' }, { status: 400 })
  }

  try {
    const { action, subcategory, subcategory_secondary, address_on_request, visitable, presence_type, presence_types, service_area, offers_classes, reviewerOverrides, wayClassification } = await request.json()
    // Mobile venues (food trucks, coffee carts, pop-ups) have no fixed street
    // address — they're discoverable & featured via their region, but their
    // exact location is never pinned. They stay visitable (you can find & visit
    // them) so they surface in search and region pages like a permanent venue.
    const isMobile = presence_type === 'mobile'
    // A maker whose primary presence is online-only or markets-only has no fixed
    // public venue — its geocode is a bare locality centroid, so it must never
    // get a precise map dot. When the reviewer didn't explicitly set
    // visitability, default such makers to non-visitable (permanent venues,
    // by-appointment makers and seasonal venues stay visitable).
    const NON_VISITABLE_PRESENCE = ['online', 'markets']
    const resolvedVisitable = visitable ?? (NON_VISITABLE_PRESENCE.includes(presence_type) ? false : true)
    // Non-visitable listings may carry several presence modes at once (markets +
    // online + by appointment …). presence_type stays the scalar primary that
    // all downstream consumers read; presence_types (portal listings only) keeps
    // the full set. Whitelist elements to the same values the CHECK allows.
    const VALID_PRESENCE_SUBTYPES = ['by_appointment', 'markets', 'online', 'seasonal']
    const presenceTypesArr = (visitable === false && Array.isArray(presence_types))
      ? presence_types.filter((v, i, a) => VALID_PRESENCE_SUBTYPES.includes(v) && a.indexOf(v) === i)
      : []

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action — must be approve or reject' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ── API key check (loud early warning) ───────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[admin/candidates/POST] ANTHROPIC_API_KEY is not set — enrichment and description generation will fail')
    }

    // ── Reject ────────────────────────────────────────────
    if (action === 'reject') {
      const { error } = await sb
        .from('listing_candidates')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error
      return NextResponse.json({ success: true, action: 'rejected' })
    }

    // ── Approve ───────────────────────────────────────────
    if (action === 'approve') {
      // 1. Fetch the candidate — use select('*') to avoid column-not-found
      //    errors when migrations haven't been run on production yet
      const { data: candidate, error: fetchError } = await sb
        .from('listing_candidates')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        console.error(`[admin/candidates/POST] Fetch error for id=${id}:`, fetchError.message)
        return NextResponse.json({ error: `Failed to fetch candidate: ${fetchError.message}` }, { status: 500 })
      }
      if (!candidate) {
        return NextResponse.json({ error: `Candidate not found (id: ${id})` }, { status: 404 })
      }

      const vertical = candidate.vertical || 'sba'
      const slug = slugify(candidate.name)

      // ── Quality gate: no website = no listing ──────────
      // Hard editorial standard across the network.
      // Exception: Field Atlas (natural places may not have websites).
      const WEBSITE_EXEMPT_VERTICALS = ['field']
      if (!candidate.website_url?.trim() && !WEBSITE_EXEMPT_VERTICALS.includes(vertical)) {
        // Auto-reject — no website, no listing
        await sb.from('listing_candidates').update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          notes: (candidate.notes ? candidate.notes + '\n' : '') + '[Auto-rejected: no website URL]',
        }).eq('id', id)

        return NextResponse.json({
          success: true,
          action: 'rejected',
          reason: 'No website URL — hard editorial gate. All listings (except Field Atlas) require a verified website.',
        })
      }

      // 2. Enrich from website if available
      let enriched = {}
      let ogImage = null
      const websiteUrl = normaliseUrl(candidate.website_url)
      if (websiteUrl) {
        console.log(`[approve] Fetching website: ${websiteUrl}`)
        const { text: websiteText, ogImage: extractedOg } = await fetchWebsiteContent(websiteUrl)
        ogImage = extractedOg
        if (ogImage) console.log(`[approve] Found og:image: ${ogImage}`)
        if (websiteText) {
          console.log(`[approve] Extracting details with Claude (${websiteText.length} chars)...`)
          enriched = (await enrichFromWebsite(candidate, websiteText)) || {}
          console.log(`[approve] Enriched fields: ${Object.keys(enriched).filter(k => enriched[k] != null).join(', ')}`)
        } else {
          console.log(`[approve] Could not fetch website content from ${websiteUrl}`)
        }
      } else if (candidate.website_url) {
        console.log(`[approve] Could not normalise website URL: "${candidate.website_url}"`)
      }

      // 3. Geocode — try enriched address first, then fall back to name + region
      let coords = null
      if (enriched.address) {
        coords = await geocodeAddress(enriched.address, enriched.state, enriched.suburb)
        if (coords) {
          console.log(`[approve] Geocoded from address: ${coords.lat}, ${coords.lng} (${coords.place_name})`)
        }
      }
      // Fallback: geocode from business name + region (less precise but usually gets the right town)
      if (!coords && candidate.region) {
        coords = await geocodeAddress(`${candidate.name}, ${candidate.region}`, enriched.state || null)
        if (coords) {
          console.log(`[approve] Geocoded from name+region fallback: ${coords.lat}, ${coords.lng} (${coords.place_name})`)
        }
      }
      // Last resort: geocode from just the region name
      if (!coords && candidate.region) {
        coords = await geocodeAddress(candidate.region, enriched.state || null)
        if (coords) {
          console.log(`[approve] Geocoded from region fallback: ${coords.lat}, ${coords.lng} (${coords.place_name})`)
        }
      }

      // 4. Merge data with correct priority
      // Reviewer edits always win — never overwrite with enriched data.
      // Priority: reviewerOverrides > candidate DB values > enriched/AI data > generated
      const ro = reviewerOverrides || {}

      let description = ro.description || candidate.description || enriched.description || null
      let descriptionSource = ro.description ? 'reviewer' : candidate.description ? 'candidate' : enriched.description ? 'website_enrichment' : null
      if (!description) {
        console.log(`[approve] No description from reviewer/candidate/enrichment — generating via Claude...`)
        description = await generateDescription(candidate)
        descriptionSource = description ? 'ai_generated' : null
      }
      if (!description) {
        console.error(`[approve] WARNING: All description sources failed for "${candidate.name}" — listing will have no description`)
      } else {
        console.log(`[approve] Description source: ${descriptionSource} (${description.length} chars)`)
      }

      // 5. Build the full data object — reviewer > candidate > enriched
      const effectiveCategory = subcategory || enriched.category || null

      // Reviewer-supplied form fields take priority. The candidate row holds
      // whatever the geocode-on-blur endpoint auto-saved (address, lat, lng,
      // state); enriched data is the next fallback when the reviewer left a
      // field blank.
      const formAddress = (ro.address || '').trim() || candidate.address || null
      const formSuburb = (ro.suburb || '').trim() || enriched.suburb || null
      let formLat = ro.lat ?? candidate.lat ?? coords?.lat ?? null
      let formLng = ro.lng ?? candidate.lng ?? coords?.lng ?? null

      // State resolution. A candidate's stored `state` is unreliable: market
      // seeders inherit the MARKET's state onto interstate makers (a Sydney
      // jeweller sold at Handmade Market Canberra was stamped ACT), and
      // discovery rows can carry a stale state. The maker's REGION is the
      // researched source of truth for WHERE they are, so a resolved region
      // outranks the stamped candidate/enriched state. Order:
      //   reviewer > region (chosen override, else the state token in region
      //   text) > candidate.state > enriched.state > geocoded pin > box test
      let formState = null
      let stateSource = 'null'
      const roState = (ro.state || '').trim()

      // Region-derived state: the reviewer's chosen region (authoritative in the
      // regions table), else the state trailing the candidate's region text
      // ("Sydney, NSW" → NSW). Null when the region carries no parseable state.
      let regionState = null
      if (ro.region_override_id) {
        const { data: regionStateRow } = await sb
          .from('regions')
          .select('state')
          .eq('id', ro.region_override_id)
          .maybeSingle()
        regionState = regionStateRow?.state || null
      }
      if (!regionState && candidate.region) {
        regionState = extractStateFromPlaceName(candidate.region)
      }

      if (roState) { formState = roState; stateSource = 'reviewer' }
      else if (regionState) { formState = regionState; stateSource = 'region' }
      else if (candidate.state) { formState = candidate.state; stateSource = 'candidate' }
      else if (enriched.state) { formState = enriched.state; stateSource = 'enriched' }
      else {
        const fromPlaceName = extractStateFromPlaceName(coords?.place_name)
        if (fromPlaceName) { formState = fromPlaceName; stateSource = 'place_name' }
        else {
          const fromCoords = deriveStateFromCoords(formLat, formLng)
          if (fromCoords) { formState = fromCoords; stateSource = 'coords' }
        }
      }

      // Pin/state consistency. A market-seeded maker can carry a pin at the
      // MARKET's city (e.g. a Ballarat VIC maker dropped at Handmade Market
      // Canberra) even when the state is right. When the candidate's own pin
      // sits in a different state than the resolved state, and a fresh region
      // geocode positively agrees with that state, the pin follows the region
      // instead of the market. Only fires when the region geocode lands in the
      // resolved state, so a correct near-border pin is never moved; skipped
      // when the reviewer placed the pin themselves.
      if (ro.lat == null && ro.lng == null && formLat != null && formLng != null &&
          VALID_STATES.includes(formState) && coords) {
        const pinState = deriveStateFromCoords(formLat, formLng)
        if (pinState && pinState !== formState &&
            deriveStateFromCoords(coords.lat, coords.lng) === formState) {
          console.warn(`[approve] pin/state mismatch for "${candidate.name}": pin in ${pinState} but state resolved to ${formState} (${stateSource}) — moving pin to region geocode ${coords.lat},${coords.lng}`)
          formLat = coords.lat
          formLng = coords.lng
        }
      }

      // Mobile venues have no fixed pin or street address: discovery is carried
      // by the region (resolved above into formState / region_override_id), so
      // we suppress exact coordinates here to avoid a misleading map pin and a
      // "Get Directions" link to a spot the truck isn't at.
      if (isMobile) {
        formLat = null
        formLng = null
      }

      const effectiveVisitable = resolvedVisitable
      console.log(`[approve] state resolved`, {
        candidate_id: candidate.id,
        name: candidate.name,
        resolved_state: formState,
        source: stateSource,
        has_coords: !!(formLat && formLng),
        visitable: effectiveVisitable,
      })

      if (effectiveVisitable && !VALID_STATES.includes(formState)) {
        return NextResponse.json({
          error: `Cannot approve visitable listing without a valid Australian state. Resolved state: ${formState || 'null'}. Set the state manually in the review form, or ensure the address can be geocoded.`,
        }, { status: 422 })
      }

      const regionOverrideId = ro.region_override_id || null

      // Resolve region NAME for downstream vertical sync via the same
      // override → computed → legacy chain that ongoing syncs use.
      // Listings doesn't exist yet at this point (insert path) so we
      // construct a pseudo-listing with the override name looked up
      // from regions, no computed (no lat/lng-driven trigger has fired
      // yet either), and the candidate's legacy region text as the
      // last fallback.
      let overrideRegionName = null
      if (regionOverrideId) {
        const { data: regionRow } = await sb
          .from('regions')
          .select('name')
          .eq('id', regionOverrideId)
          .maybeSingle()
        overrideRegionName = regionRow?.name || null
      }
      const regionResolution = resolveRegionName({
        region_override: overrideRegionName ? { name: overrideRegionName } : null,
        region_computed: null,
        region: candidate.region || null,
      })

      // Compose display address: street, suburb, state postcode.
      // Mobile venues have no fixed street address — leave it null (the region
      // and service_area line carry their location instead).
      let displayAddress = isMobile ? null : formAddress
      if (displayAddress && (formSuburb || formState)) {
        const parts = [displayAddress]
        const localityParts = [formSuburb, [formState, enriched.postcode].filter(Boolean).join(' ')].filter(Boolean)
        if (localityParts.length > 0) parts.push(localityParts.join(' '))
        displayAddress = parts.join(', ')
      }

      // Optional "where to find them" line — only meaningful for mobile / market
      // venues. Trimmed to null so a blank input doesn't store an empty string.
      const serviceArea = isMobile ? ((service_area || '').trim() || null) : null

      const fullData = {
        name: ro.name || candidate.name,
        slug,
        description,
        // Legacy region text — fed to vertical-DB pushes, which still expect
        // a region text field, but NOT written to listings.region by this
        // handler. The text comes from resolveRegionName()'s resolution
        // chain (override-name → legacy candidate.region) so verticals
        // receive the editorial-correct region rather than whatever the
        // raw candidate row carried.
        region: regionResolution.name,
        region_override_id: regionOverrideId,
        state: formState,
        lat: formLat,
        lng: formLng,
        website: normaliseUrl(ro.website_url || candidate.website_url) || null,
        phone: enriched.phone || null,
        address: displayAddress,
        email: enriched.email || null,
        suburb: formSuburb,
        postcode: enriched.postcode || null,
        opening_hours: enriched.opening_hours || null,
        instagram_handle: enriched.instagram_handle || null,
        category: effectiveCategory,
        hero_image_url: null,
        address_on_request: !!address_on_request,
        visitable: resolvedVisitable,
        presence_type: presence_type || 'permanent',
        service_area: serviceArea,
        offers_classes: !!offers_classes,
      }

      if (ogImage) {
        console.log(`[approve] Ignoring og:image (${ogImage}) — new listings use default hero. Owner uploads on claim.`)
      }

      // 6. Push to the vertical's own database (synchronous with retries)
      // For Way, merge wayClassification into the push payload so the
      // outbound mapper has operator_type, accreditations, etc. The push
      // runs BEFORE the RPC creates the portal listing + way_meta, so
      // these fields come from the request body, not a database read.
      const pushPayload = vertical === 'way' && wayClassification
        ? { ...fullData, ...wayClassification, category: subcategory }
        : fullData
      console.log(`[approve] Pushing to ${vertical} vertical DB (up to 3 attempts)...`)
      const pushResult = await pushToVerticalWithRetry(vertical, pushPayload, 3)
      const verticalRowId = pushResult.success ? pushResult.id : null
      if (verticalRowId) {
        console.log(`[approve] Created in ${vertical} DB with id: ${verticalRowId} (attempt ${pushResult.attempts})`)
      } else {
        console.error(`[approve] Push to ${vertical} failed after ${pushResult.attempts} attempts: ${pushResult.error}`)
      }

      // 7. Create master listing — idempotent so retry works after partial failure
      const sourceId = verticalRowId || `candidate-${candidate.id}`

      // Determine data source — AI prospector candidates get flagged
      const isAiOriginated = candidate.source === 'ai_prospector' || candidate.source === 'ai_daily'
        || candidate.source === 'automated_discovery'

      const effectiveSecondary = subcategory_secondary || null
      const subTypes = [fullData.category, effectiveSecondary].filter(Boolean)

      const listingData = {
        vertical,
        source_id: sourceId,
        name: fullData.name,
        slug,
        description,
        // Legacy listings.region (text) intentionally NOT written by this
        // tool. Region resolution goes through region_override_id (set
        // here from the reviewer's dropdown) and region_computed_id (set
        // automatically by listings_region_computed_trigger when lat/lng
        // is written). Per the regions overhaul, the legacy text column
        // is being deprecated.
        region_override_id: fullData.region_override_id,
        state: fullData.state,
        lat: fullData.lat,
        lng: fullData.lng,
        website: fullData.website,
        phone: fullData.phone,
        address: fullData.address,
        suburb: fullData.suburb,
        hero_image_url: null, // Default hero — owner uploads on claim
        sub_type: fullData.category || null,
        sub_type_secondary: effectiveSecondary,
        sub_types: subTypes,
        status: 'active',
        is_claimed: false,
        is_featured: false,
        data_source: isAiOriginated ? 'ai_generated' : 'manually_curated',
        // Admin approval in /admin/candidates IS the human review, so the listing
        // goes live immediately. data_source stays 'ai_generated' for accurate
        // provenance (and to keep the "auto-generated — claim it" disclaimer);
        // needs_review tracks review STATE, not provenance. The old value
        // (needs_review: isAiOriginated) conflated the two and silently 404'd
        // every approved AI-prospector candidate via the public gate — see
        // lib/listings/publicFilter.js + app/place/[slug]/page.js.
        needs_review: false,
        address_on_request: fullData.address_on_request,
        visitable: fullData.visitable,
        presence_type: fullData.presence_type,
        // Portal-only: full set of non-visitable modes. Not sent to vertical DBs
        // (they only have the scalar presence_type). Null when visitable/mobile.
        presence_types: presenceTypesArr.length ? presenceTypesArr : null,
        service_area: fullData.service_area,
      }

      // Check if listing already exists — match by slug OR source_id to catch:
      //   - Retries (same slug from same candidate)
      //   - Source_id collisions (pushToVertical UPSERT returned an existing row's ID)
      //   - Name edits between approval attempts (slug changed but source_id is same)
      const { data: existingBySlug } = await sb
        .from('listings')
        .select('id, slug, source_id, name, status, needs_review')
        .eq('vertical', vertical)
        .eq('slug', slug)
        .maybeSingle()

      let existingBySourceId = null
      if (!existingBySlug) {
        const { data } = await sb
          .from('listings')
          .select('id, slug, source_id, name, status, needs_review')
          .eq('vertical', vertical)
          .eq('source_id', String(sourceId))
          .maybeSingle()
        existingBySourceId = data
      }

      const existingListing = existingBySlug || existingBySourceId

      let listingId
      if (existingListing) {
        // Existing listing found — update it with latest data
        listingId = existingListing.id
        const matchedBy = existingBySlug ? 'slug' : 'source_id'

        // Prefer the existing source_id if the new vertical push failed (avoids overwriting valid link with candidate- placeholder)
        const { data: currentListing } = await sb.from('listings').select('source_id').eq('id', listingId).single()
        const effectiveSourceId = verticalRowId || (currentListing?.source_id && !String(currentListing.source_id).startsWith('candidate-') ? currentListing.source_id : sourceId)

        // Update all fields — include slug and name in case they changed since the first attempt.
        // Legacy listings.region (text) intentionally NOT written here — same
        // rationale as the insert path above. region_override_id replaces it.
        const updatePayload = {
          source_id: effectiveSourceId,
          name: fullData.name,
          slug,
          description,
          region_override_id: fullData.region_override_id,
          state: fullData.state,
          lat: fullData.lat,
          lng: fullData.lng,
          website: fullData.website,
          phone: fullData.phone,
          address: fullData.address,
          suburb: fullData.suburb,
          sub_type: fullData.category || null,
          sub_type_secondary: effectiveSecondary,
          sub_types: subTypes,
          status: 'active',
          data_source: listingData.data_source,
          needs_review: listingData.needs_review,
          address_on_request: fullData.address_on_request,
          visitable: fullData.visitable,
          presence_type: fullData.presence_type,
          // Portal-only full set of non-visitable modes; null when visitable/mobile
          // so re-approving as visitable clears a previously stored array.
          presence_types: presenceTypesArr.length ? presenceTypesArr : null,
          service_area: fullData.service_area,
        }
        // Never overwrite hero_image_url from scraping — owner uploads on claim

        if (vertical === 'way' && wayClassification) {
          // Way: atomic listings UPDATE + way_meta UPSERT (replace-semantics) via RPC
          const wayMetaPayload = { ...wayClassification, primary_type: effectiveCategory }
          const { error: rpcError } = await sb.rpc('approve_way_candidate', {
            p_listing: updatePayload,
            p_way_meta: wayMetaPayload,
            p_existing_listing_id: listingId,
          })
          if (rpcError) {
            console.error(`[approve] Way approval RPC failed (UPDATE path):`, rpcError.message)
            return NextResponse.json({
              error: `Way Atlas update failed: ${rpcError.message}`,
              detail: rpcError.details || null,
            }, { status: 500 })
          }
          console.log(`[approve] Updated existing master listing + way_meta ${listingId} via RPC (matched by ${matchedBy}: "${existingListing[matchedBy]}" → new slug: "${slug}")`)
        } else {
          await sb.from('listings').update(updatePayload).eq('id', listingId)
          console.log(`[approve] Updated existing master listing ${listingId} (matched by ${matchedBy}: "${existingListing[matchedBy]}" → new slug: "${slug}")`)
        }

        // Sync to vertical — use the effective source_id for the update
        if (effectiveSourceId && !String(effectiveSourceId).startsWith('candidate-')) {
          let updateSuccess = false
          let updateErrorMessage = null
          try {
            // For Way, merge wayClassification so the mapper receives
            // operator_type, accreditations, secondary_types, etc.
            // Without this, mapToVerticalSchema's || [] defaults blank
            // out the fields that pushToVerticalWithRetry wrote earlier.
            const syncData = vertical === 'way' && wayClassification
              ? { ...fullData, ...wayClassification }
              : fullData
            const syncResult = await updateInVertical(vertical, effectiveSourceId, syncData)
            if (syncResult.success) {
              console.log(`[approve] Synced retry update to ${vertical} vertical (source_id: ${effectiveSourceId})`)
              updateSuccess = true
            } else {
              console.warn(`[approve] Vertical sync failed on retry:`, syncResult.error)
              updateErrorMessage = syncResult.error
            }
          } catch (syncErr) {
            console.warn(`[approve] Vertical sync error on retry:`, syncErr.message)
            updateErrorMessage = syncErr.message
          }
          await recordSyncAndRevalidate({
            listingId,
            vertical,
            slug,
            sourceId: effectiveSourceId,
            regionResolution,
            syncAction: 'update',
            verticalSuccess: updateSuccess,
            errorMessage: updateErrorMessage,
            category: fullData.category,
          })
        }
      } else {
        // ── INSERT path ──────────────────────────────────────
        if (vertical === 'way' && wayClassification) {
          // Way: atomic listings INSERT + way_meta INSERT via RPC.
          // Both writes succeed or both roll back — eliminates the
          // partial-write failure mode that produced stranded listings.
          const wayMetaPayload = { ...wayClassification, primary_type: effectiveCategory }
          const { data: rpcResult, error: rpcError } = await sb.rpc('approve_way_candidate', {
            p_listing: listingData,
            p_way_meta: wayMetaPayload,
            p_existing_listing_id: null,
          })

          if (rpcError) {
            if (rpcError.code === '23505') {
              // Unique constraint violation — same diagnostic as non-Way path
              const { data: conflicts } = await sb
                .from('listings')
                .select('id, name, slug, source_id, status, needs_review, data_source, created_at')
                .eq('vertical', vertical)
                .or(`slug.eq.${slug},source_id.eq.${sourceId}`)
                .limit(5)

              console.error(`[approve] 23505 conflict for "${fullData.name}" (slug: ${slug}, source_id: ${sourceId}):`, JSON.stringify(conflicts))
              return NextResponse.json({
                error: `Duplicate conflict: ${conflicts?.length || 0} existing listing(s) in ${VERTICAL_DISPLAY_NAMES[vertical] || vertical} conflict with "${fullData.name}".`,
                conflicting: (conflicts || []).map(c => ({
                  id: c.id, name: c.name, slug: c.slug, source_id: c.source_id,
                  status: c.status, needs_review: c.needs_review, data_source: c.data_source,
                  created_at: c.created_at,
                })),
                candidate: { slug, source_id: sourceId },
                hint: 'An existing listing with a matching source_id or slug is blocking this insert. It may be hidden (needs_review=true) or from a failed previous approval. Check the admin listings page to resolve the duplicate.',
              }, { status: 409 })
            }
            throw rpcError
          }
          listingId = rpcResult.listing_id
          console.log(`[approve] Created master listing + way_meta ${listingId} via RPC`)
        } else {
          // Non-Way: existing INSERT path (unchanged)
          const { data: listing, error: insertError } = await sb
            .from('listings')
            .insert(listingData)
            .select('id')
            .single()

          if (insertError) {
            if (insertError.code === '23505') {
              // Unique constraint violation not caught by preventive checks — fetch conflicting listing for diagnostics
              const { data: conflicts } = await sb
                .from('listings')
                .select('id, name, slug, source_id, status, needs_review, data_source, created_at')
                .eq('vertical', vertical)
                .or(`slug.eq.${slug},source_id.eq.${sourceId}`)
                .limit(5)

              console.error(`[approve] 23505 conflict for "${fullData.name}" (slug: ${slug}, source_id: ${sourceId}):`, JSON.stringify(conflicts))
              return NextResponse.json({
                error: `Duplicate conflict: ${conflicts?.length || 0} existing listing(s) in ${VERTICAL_DISPLAY_NAMES[vertical] || vertical} conflict with "${fullData.name}".`,
                conflicting: (conflicts || []).map(c => ({
                  id: c.id, name: c.name, slug: c.slug, source_id: c.source_id,
                  status: c.status, needs_review: c.needs_review, data_source: c.data_source,
                  created_at: c.created_at,
                })),
                candidate: { slug, source_id: sourceId },
                hint: 'An existing listing with a matching source_id or slug is blocking this insert. It may be hidden (needs_review=true) or from a failed previous approval. Check the admin listings page to resolve the duplicate.',
              }, { status: 409 })
            }
            throw insertError
          }
          listingId = listing.id
        }

        // Log the insert-path sync + trigger vertical cache revalidation.
        // pushToVerticalWithRetry happened earlier (before the listings
        // insert) — we log against the new listing's id now that we have it.
        await recordSyncAndRevalidate({
          listingId,
          vertical,
          slug,
          sourceId: verticalRowId,
          regionResolution,
          syncAction: 'insert',
          verticalSuccess: !!verticalRowId,
          errorMessage: verticalRowId ? null : pushResult?.error,
          category: fullData.category,
        })
      }

      // 7b. Cross-vertical tags (migration 142) — best-effort, non-fatal.
      // Reflect the reviewer's vertical assignment(s) onto the published
      // listing so it can appear under more than one vertical. The DB trigger
      // guarantees the primary `vertical` is always present; here we add any
      // admin-chosen secondary verticals. The Way RPC path also lands here
      // (after listingId is set), so Way cross-listing works too.
      try {
        const chosenVerticals = Array.isArray(candidate.verticals) ? candidate.verticals : []
        if (chosenVerticals.length > 0) {
          const VALID_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table', 'way']
          const verticalsSet = [vertical, ...chosenVerticals]
            .filter((v, i, arr) => v && VALID_VERTICALS.includes(v) && arr.indexOf(v) === i)
          const { error: vErr } = await sb.from('listings').update({ verticals: verticalsSet }).eq('id', listingId)
          if (vErr && (vErr.code === '42703' || /column .*verticals.* does not exist/i.test(vErr.message || ''))) {
            console.warn('[approve] verticals column absent (migration 142 pending) — cross-vertical tags not written')
          } else if (vErr) {
            console.warn('[approve] failed to set cross-vertical tags:', vErr.message)
          } else if (verticalsSet.length > 1) {
            console.log(`[approve] Set cross-vertical tags for ${listingId}: ${verticalsSet.join(', ')}`)
          }
        }
      } catch (vTagErr) {
        console.warn('[approve] cross-vertical tag step errored (non-fatal):', vTagErr.message)
      }

      // 7c. Embed the new listing immediately so it is searchable on BOTH the
      // lexical and the semantic arm right away — no wait for the 6-hourly
      // embedding cron (during which a fresh, embedding-less venue can be
      // out-ranked by semantically-plausible-but-wrong matches). Reuses the
      // same free-tier Voyage *document* embedding as the cron. Best-effort:
      // on Voyage failure the row keeps embedding=NULL and the cron retries it
      // (listings with a null embedding are already in the cron's work set).
      try {
        await regenerateListingEmbedding(sb, listingId)
        console.log(`[approve] Embedded new listing ${listingId} inline`)
      } catch (embErr) {
        console.warn(`[approve] inline embed failed (cron will retry) for ${listingId}:`, embErr.message)
      }

      // 8. Mark candidate as converted
      const { error: updateError } = await sb
        .from('listing_candidates')
        .update({
          status: 'converted',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) {
        console.error('[approve] Failed to update candidate status:', updateError.message)
      }

      const verticalName = VERTICAL_DISPLAY_NAMES[vertical] || vertical
      const listingUrl = getVerticalListingUrl(vertical, slug, fullData.category)

      // Resolve the display region name from the override id (or null when
      // the reviewer didn't pick / wasn't auto-suggested). The trigger may
      // have populated region_computed_id from lat/lng; the consuming
      // frontend treats `region` as a display label and falls back to
      // candidate.region when null, so we prefer the override name first.
      let displayRegionName = null
      if (fullData.region_override_id) {
        const { data: regionRow } = await sb
          .from('regions')
          .select('name')
          .eq('id', fullData.region_override_id)
          .maybeSingle()
        displayRegionName = regionRow?.name || null
      }

      return NextResponse.json({
        success: true,
        action: 'approved',
        listing: {
          id: listingId,
          name: fullData.name,
          region: displayRegionName,
          region_override_id: fullData.region_override_id,
          vertical,
          verticalName,
          slug,
          url: listingUrl,
        },
        verticalSync: {
          success: !!verticalRowId,
          rowId: verticalRowId,
          attempts: pushResult.attempts || 1,
          warning: verticalRowId
            ? null
            : `Push to ${verticalName} failed after ${pushResult.attempts || 1} attempts: ${pushResult.error || 'unknown'}. Use "Retry push" to try again.`,
        },
        enrichment: {
          attempted: !!candidate.website_url,
          fieldsExtracted: Object.keys(enriched).filter(k => enriched[k] != null),
        },
      })
    }
  } catch (err) {
    console.error('[admin/candidates/POST] Error:', err.message, err.stack)
    return NextResponse.json({ error: `Action failed: ${err.message || 'Unknown error'}` }, { status: 500 })
  }
}
