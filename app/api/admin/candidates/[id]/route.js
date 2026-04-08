import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { pushToVertical, updateInVertical, getVerticalListingUrl, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

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

const VERTICAL_CATEGORIES = {
  sba: ['winery', 'distillery', 'brewery', 'cidery', 'non_alcoholic', 'meadery', 'sake_brewery'],
  collection: ['archive', 'cultural_centre', 'gallery', 'botanical_garden', 'heritage_site', 'museum'],
  craft: ['ceramics_clay', 'visual_art', 'jewellery_metalwork', 'textile_fibre', 'wood_furniture', 'glass', 'printmaking'],
  fine_grounds: ['roaster', 'cafe'],
  rest: ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage'],
  field: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park'],
  corner: ['bookshop', 'record_store', 'homewares', 'clothing', 'gift_shop', 'general_store', 'stationery', 'art_supplies', 'lifestyle'],
  found: ['vintage_clothing', 'vintage_furniture', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
  table: ['farm_gate', 'market', 'artisan_producer', 'specialty_retail', 'destination'],
}

// ─── Website Enrichment ────────────────────────────────────

/** Fetch a URL and return stripped plain text (max 8000 chars) */
async function fetchWebsiteContent(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-enrichment)' },
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const html = await res.text()
    return html
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
      .slice(0, 8000)
  } catch {
    return null
  }
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const result = await res.json()
    const text = result.content?.[0]?.text?.trim()
    if (!text) return null
    const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '')
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/** Geocode an address via Mapbox */
async function geocodeAddress(address, state) {
  if (!address) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null
  try {
    const query = `${address}${state ? `, ${state}` : ''}, Australia`
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    return { lat: feature.center[1], lng: feature.center[0] }
  } catch {
    return null
  }
}

// ─── Description Generation (fallback when no website) ─────

async function generateDescription(candidate) {
  const type = VERTICAL_LABELS[candidate.vertical] || 'venue'
  const prompt = `Write a 2–3 sentence editorial description for "${candidate.name}", a ${type} in ${candidate.region || 'Australia'}. ${candidate.notes ? `Context: ${candidate.notes}` : ''}

Tone: warm, concise, editorial — like a curated travel guide. Focus on what makes the place distinctive. Do not invent specific details you don't know. Do not include the venue name in the description. Return only the description text, nothing else.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const result = await res.json()
    return result.content?.[0]?.text?.trim() || null
  } catch {
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

    const allowed = ['name', 'vertical', 'region', 'website_url', 'description', 'notes', 'confidence']
    const updates = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('listing_candidates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

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
    const { action } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action — must be approve or reject' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

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
      // 1. Fetch the candidate
      const { data: candidate, error: fetchError } = await sb
        .from('listing_candidates')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
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
      if (candidate.website_url) {
        console.log(`[approve] Fetching website: ${candidate.website_url}`)
        const websiteText = await fetchWebsiteContent(candidate.website_url)
        if (websiteText) {
          console.log(`[approve] Extracting details with Claude (${websiteText.length} chars)...`)
          enriched = (await enrichFromWebsite(candidate, websiteText)) || {}
          console.log(`[approve] Enriched fields: ${Object.keys(enriched).filter(k => enriched[k] != null).join(', ')}`)
        } else {
          console.log(`[approve] Could not fetch website content`)
        }
      }

      // 3. Geocode — try enriched address first, then fall back to name + region
      let coords = null
      if (enriched.address) {
        coords = await geocodeAddress(enriched.address, enriched.state)
        if (coords) {
          console.log(`[approve] Geocoded from address: ${coords.lat}, ${coords.lng}`)
        }
      }
      // Fallback: geocode from business name + region (less precise but usually gets the right town)
      if (!coords && candidate.region) {
        coords = await geocodeAddress(`${candidate.name}, ${candidate.region}`, enriched.state || null)
        if (coords) {
          console.log(`[approve] Geocoded from name+region fallback: ${coords.lat}, ${coords.lng}`)
        }
      }
      // Last resort: geocode from just the region name
      if (!coords && candidate.region) {
        coords = await geocodeAddress(candidate.region, enriched.state || null)
        if (coords) {
          console.log(`[approve] Geocoded from region fallback: ${coords.lat}, ${coords.lng}`)
        }
      }

      // 4. Generate description if still missing
      let description = enriched.description || candidate.description || null
      if (!description) {
        description = await generateDescription(candidate)
      }

      // 5. Build the full enriched data object
      const fullData = {
        name: candidate.name,
        slug,
        description,
        region: candidate.region || enriched.suburb || null,
        state: enriched.state || null,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        website: normaliseUrl(candidate.website_url) || null,
        phone: enriched.phone || null,
        address: enriched.address || null,
        email: enriched.email || null,
        suburb: enriched.suburb || candidate.region || null,
        postcode: enriched.postcode || null,
        opening_hours: enriched.opening_hours || null,
        instagram_handle: enriched.instagram_handle || null,
        category: enriched.category || null,
        hero_image_url: null,
      }

      // 6. Push to the vertical's own database
      console.log(`[approve] Pushing to ${vertical} vertical DB...`)
      const pushResult = await pushToVertical(vertical, fullData)
      const verticalRowId = pushResult.success ? pushResult.id : null
      if (verticalRowId) {
        console.log(`[approve] Created in ${vertical} DB with id: ${verticalRowId}`)
      } else {
        console.warn(`[approve] Push to ${vertical} failed: ${pushResult.error}`)
      }

      // 7. Create master listing — idempotent so retry works after partial failure
      const sourceId = verticalRowId || `candidate-${candidate.id}`

      // Determine data source — AI prospector candidates get flagged
      const isAiOriginated = candidate.source === 'ai_prospector' || candidate.source === 'ai_daily'
      const dataSource = isAiOriginated ? 'ai_generated' : 'manually_curated'

      const listingData = {
        vertical,
        source_id: sourceId,
        name: fullData.name,
        slug,
        description,
        region: fullData.region,
        state: fullData.state,
        lat: fullData.lat,
        lng: fullData.lng,
        website: fullData.website,
        phone: fullData.phone,
        address: fullData.address,
        hero_image_url: null,
        status: 'active',
        is_claimed: false,
        is_featured: false,
        data_source: dataSource,
        needs_review: isAiOriginated,
      }

      // Check if listing already exists (retry case — previous attempt may have written master but not vertical)
      const { data: existingListing } = await sb
        .from('listings')
        .select('id')
        .eq('vertical', vertical)
        .eq('slug', slug)
        .maybeSingle()

      let listingId
      if (existingListing) {
        // Retry — update existing listing with latest data (including new source_id if vertical push now succeeded)
        listingId = existingListing.id

        // Prefer the existing source_id if the new vertical push failed (avoids overwriting valid link with candidate- placeholder)
        const { data: currentListing } = await sb.from('listings').select('source_id').eq('id', listingId).single()
        const effectiveSourceId = verticalRowId || (currentListing?.source_id && !String(currentListing.source_id).startsWith('candidate-') ? currentListing.source_id : sourceId)

        await sb.from('listings').update({ source_id: effectiveSourceId, description, region: fullData.region, state: fullData.state, lat: fullData.lat, lng: fullData.lng, website: fullData.website, phone: fullData.phone, address: fullData.address }).eq('id', listingId)
        console.log(`[approve] Updated existing master listing ${listingId} (retry)`)

        // Sync to vertical — use the effective source_id for the update
        if (effectiveSourceId && !String(effectiveSourceId).startsWith('candidate-')) {
          try {
            const syncResult = await updateInVertical(vertical, effectiveSourceId, fullData)
            if (syncResult.success) {
              console.log(`[approve] Synced retry update to ${vertical} vertical (source_id: ${effectiveSourceId})`)
            } else {
              console.warn(`[approve] Vertical sync failed on retry:`, syncResult.error)
            }
          } catch (syncErr) {
            console.warn(`[approve] Vertical sync error on retry:`, syncErr.message)
          }
        }
      } else {
        const { data: listing, error: insertError } = await sb
          .from('listings')
          .insert(listingData)
          .select('id')
          .single()

        if (insertError) {
          if (insertError.code === '23505') {
            return NextResponse.json({ error: 'A listing with this name already exists for this vertical' }, { status: 409 })
          }
          throw insertError
        }
        listingId = listing.id
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

      return NextResponse.json({
        success: true,
        action: 'approved',
        listing: {
          id: listingId,
          name: fullData.name,
          region: fullData.region,
          vertical,
          verticalName,
          slug,
          url: listingUrl,
        },
        verticalSync: {
          success: !!verticalRowId,
          rowId: verticalRowId,
          warning: verticalRowId
            ? null
            : `Push to ${verticalName} failed: ${pushResult.error || 'unknown'}. Will sync on next cron run.`,
        },
        enrichment: {
          attempted: !!candidate.website_url,
          fieldsExtracted: Object.keys(enriched).filter(k => enriched[k] != null),
        },
      })
    }
  } catch (err) {
    console.error('[admin/candidates/POST] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 })
  }
}
