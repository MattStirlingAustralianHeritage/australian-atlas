import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { extractStateFromPlaceName } from '@/lib/geo/stateDerivation'

/**
 * POST /api/admin/candidates/classify
 *
 * "Drop a URL, get it sorted into a vertical." The reviewer pastes a
 * single operator URL; we fetch the page, ask Claude which of the ten
 * network verticals it belongs to (e.g. commonfolkcoffee.com.au →
 * Fine Grounds), extract the business name + location, geocode it, and
 * insert a pending candidate that then flows through the exact same
 * review/enrich/publish pipeline as everything else.
 *
 * The dropped URL is operator-provided, so storing it as website_url is
 * compliant with the network's "URLs are never AI-generated" rule. The
 * name/address are extracted from the live page (grounded, never invented)
 * — Claude is told to return null for anything it can't read off the page.
 *
 * Body: { url: string }
 * Auth: admin cookie
 * Response (200): { candidate, classification: { vertical, verticalName, confidence, reasoning } }
 * Response (422): { error, classification } — page fetched but no vertical fit
 */

export const maxDuration = 60

// One-line disambiguating description per vertical. Mirrors the editorial
// taxonomy used by the publish-time enricher (app/api/admin/candidates/[id])
// and the queue's VERTICAL_TYPE_LABELS, with `way` added (experience operators).
const VERTICAL_TAXONOMY = {
  sba: 'Small Batch — an artisan food or drink PRODUCER you can visit: brewery, winery, distillery, cidery, meadery, cellar door.',
  collection: 'Culture — a museum, gallery, or cultural collection open to visitors.',
  craft: 'Craft — a maker or artisan studio (ceramics, textiles, woodwork, jewellery, glass, leather) where work is made or sold.',
  fine_grounds: 'Fine Grounds — a specialty coffee roaster or a coffee-led café (coffee is the focus, not a full food menu).',
  rest: 'Rest — boutique or independent accommodation (a place to stay).',
  field: 'Field — an outdoor or natural destination: national park, trail, lookout, beach, garden, reserve.',
  corner: 'Corner — an independent retail shop (homewares, books, fashion, lifestyle) that is not vintage/secondhand.',
  found: 'Found — a vintage, antique, secondhand, or retro shop.',
  table: 'Table — an independent restaurant or food-led eatery where dining/food is the focus (not coffee-led).',
  way: 'Way — a guided experience, tour, or activity operator (walks, cruises, cultural tours, adventure experiences).',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const ALLOWED_VERTICALS = Object.keys(VERTICAL_TAXONOMY)

/** Normalise a pasted URL to a fetchable https:// origin. Returns null if unusable. */
function normaliseUrl(url) {
  if (!url) return null
  let u = String(url).trim()
  if (!u) return null
  // Strip wrapping quotes/whitespace a paste can drag along.
  u = u.replace(/^["'\s]+|["'\s]+$/g, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Fetch a URL and return stripped plain text + the <title>. Mirrors the
 *  enrichment fetch in app/api/admin/candidates/[id]/route.js. */
async function fetchSiteText(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-classifier)' },
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) return { text: null, title: null, status: res.status }

    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || null

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 7000)

    return { text, title, status: res.status }
  } catch (err) {
    return { text: null, title: null, status: 0, error: err.message || String(err) }
  }
}

/** Ask Claude to classify the page into one vertical and pull the basics. */
async function classifyWithClaude({ url, hostname, title, text }) {
  const taxonomy = Object.entries(VERTICAL_TAXONOMY)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join('\n')

  const prompt = `You are sorting an Australian venue/operator website into ONE of the Australian Atlas network verticals.

URL: ${url}
Domain: ${hostname}
Page title: ${title || '(none)'}

Page content:
${text}

Verticals (choose the single best fit):
${taxonomy}

Disambiguation rules:
- A specialty coffee roaster or coffee-focused café → fine_grounds, NOT table.
- A brewery / winery / distillery / cellar door → sba, NOT table.
- A pottery / ceramics / textile / jewellery studio → craft.
- A vintage / antique / secondhand shop → found, NOT corner.
- Tours, guided walks, cruises, cultural experiences → way.

Return a JSON object. Use null for anything you cannot confidently read from the page — never guess or invent.

{
  "vertical": "one of: ${ALLOWED_VERTICALS.join(', ')} — or null if the site does not fit any vertical or is not an Australian visitable venue/operator",
  "name": "The business name, cleaned (no taglines, no ' | Home' suffixes)",
  "address": "Full street address if shown, else null",
  "suburb": "Suburb or town, else null",
  "state": "Australian state abbreviation (NSW, VIC, QLD, SA, WA, TAS, ACT, NT) or null",
  "region": "Tourism region / area name if evident (e.g. Mornington Peninsula), else null",
  "confidence": 0.0,
  "reasoning": "One short sentence on why this vertical."
}

Return ONLY valid JSON, no markdown fences, no other text.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error(`[classify] Claude API ${res.status}: ${errBody.slice(0, 300)}`)
    return null
  }

  const result = await res.json()
  const raw = result.content?.[0]?.text?.trim()
  if (!raw) return null

  // Strip markdown fences if the model wrapped the JSON.
  let jsonStr = raw
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  else jsonStr = jsonStr.replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim()

  try {
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error('[classify] Failed to parse Claude JSON:', err.message, '— raw:', raw.slice(0, 200))
    return null
  }
}

/** Geocode an Australian address/suburb via Mapbox. Mirrors the geocode route. */
async function geocodeAustralianAddress({ address, suburb, state }) {
  if (!address && !suburb) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null
  try {
    const parts = [address, suburb, state, 'Australia'].filter(Boolean)
    const query = parts.join(', ')
    const apiUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${token}`
    const res = await fetch(apiUrl)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    return { lat: feature.center[1], lng: feature.center[0], place_name: feature.place_name || null }
  } catch {
    return null
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const url = normaliseUrl(body.url)
    if (!url) {
      return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 })
    }

    const hostname = hostnameOf(url)

    // 1. Fetch the page.
    const { text, title, status } = await fetchSiteText(url)
    if (!text) {
      return NextResponse.json({
        error: status
          ? `Couldn't read that page (HTTP ${status}). Check the URL and try again.`
          : `Couldn't reach that URL. Check it's correct and publicly accessible.`,
      }, { status: 422 })
    }

    // 2. Classify with Claude.
    const classification = await classifyWithClaude({ url, hostname, title, text })
    if (!classification) {
      return NextResponse.json({ error: 'Classification failed — try again in a moment.' }, { status: 502 })
    }

    const vertical = (classification.vertical || '').trim()
    if (!ALLOWED_VERTICALS.includes(vertical)) {
      // Page read fine, but Claude couldn't place it in a vertical.
      return NextResponse.json({
        error: classification.reasoning
          ? `Couldn't sort this into a vertical — ${classification.reasoning}`
          : `Couldn't confidently sort this into a vertical. Add it manually if it belongs on the network.`,
        classification,
      }, { status: 422 })
    }

    const name = (classification.name || '').trim() || (title || hostname).trim()
    const region = (classification.region || '').trim() || null
    const address = (classification.address || '').trim() || null
    const suburb = (classification.suburb || '').trim() || null
    let state = (classification.state || '').trim().toUpperCase() || null
    const confidence = typeof classification.confidence === 'number'
      ? Math.max(0, Math.min(1, classification.confidence))
      : null
    const verticalName = VERTICAL_NAMES[vertical] || vertical
    const today = new Date().toISOString().split('T')[0]

    const reasoning = (classification.reasoning || '').trim()
    const noteLines = [
      `Auto-sorted from URL → ${verticalName}${confidence != null ? ` (${Math.round(confidence * 100)}%)` : ''}.`,
      reasoning,
    ].filter(Boolean)

    const sb = getSupabaseAdmin()

    // 3. Insert the candidate. Same core/extended column-fallback pattern as
    //    the manual create route, so it works whether or not migration 086
    //    (address/state columns) has reached this deployment.
    const core = {
      name,
      vertical,
      website_url: url,
      region,
      notes: noteLines.join(' '),
      source: 'user_suggested',
      source_detail: `url suggestion — ${today}`,
      status: 'pending',
    }
    if (confidence != null) core.confidence = confidence

    const extended = { ...core, address, state }

    let { data: candidate, error } = await sb
      .from('listing_candidates')
      .insert(extended)
      .select('*')
      .single()

    if (error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''))) {
      console.warn('[classify] 086 columns absent — inserting core fields only')
      ;({ data: candidate, error } = await sb
        .from('listing_candidates')
        .insert(core)
        .select('*')
        .single())
    }

    if (error) {
      console.error('[classify] Insert failed:', error.message)
      return NextResponse.json({ error: `Create failed: ${error.message}` }, { status: 500 })
    }

    // 4. Geocode inline so the candidate lands publish-ready (lat/lng + a
    //    derived state), matching what AddListingForm achieves via the
    //    separate geocode call. Non-fatal — the publish handler geocodes
    //    again as a fallback if this is skipped or fails.
    if (candidate?.id && (address || suburb)) {
      const geo = await geocodeAustralianAddress({ address, suburb, state })
      if (geo) {
        if (!state) {
          const derived = extractStateFromPlaceName(geo.place_name)
          if (derived) state = derived
        }
        const geoPatch = { lat: geo.lat, lng: geo.lng }
        if (state && !candidate.state) geoPatch.state = state
        const { data: patched } = await sb
          .from('listing_candidates')
          .update(geoPatch)
          .eq('id', candidate.id)
          .select('*')
          .single()
        if (patched) candidate = patched
      }
    }

    return NextResponse.json({
      candidate,
      classification: { vertical, verticalName, confidence, reasoning },
    })
  } catch (err) {
    console.error('[classify] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Classification failed' }, { status: 500 })
  }
}
