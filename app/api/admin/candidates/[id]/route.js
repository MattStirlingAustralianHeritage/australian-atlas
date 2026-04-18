import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { pushToVerticalWithRetry, updateInVertical, getVerticalListingUrl, VERTICAL_DISPLAY_NAMES, VERTICAL_CATEGORIES } from '@/lib/sync/pushToVertical'
// Hero image scraping removed — all new listings use the default fallback hero.
// Venue owners upload their own hero image when they claim the listing.

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
 *  Returns { text, ogImage } — text is the page content (max 8000 chars),
 *  ogImage is the og:image URL extracted from meta tags before stripping HTML.
 */
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
    if (!res.ok) {
      console.log(`[fetchWebsite] HTTP ${res.status} for ${url}`)
      return { text: null, ogImage: null }
    }

    const html = await res.text()

    // Extract og:image before stripping HTML — handles both meta attribute orders
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    const ogImage = ogMatch?.[1] || null

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
      .slice(0, 8000)

    return { text, ogImage }
  } catch (err) {
    console.log(`[fetchWebsite] Error for ${url}: ${err.message || err}`)
    return { text: null, ogImage: null }
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
    const { action, subcategory, subcategory_secondary, reviewerOverrides } = await request.json()

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

      // Compose display address: street, suburb, state postcode
      // enriched.address is typically street-only (e.g. "68 Nettleton Rd")
      // Combine with suburb/state/postcode for full display format
      let displayAddress = enriched.address || null
      if (displayAddress && (enriched.suburb || enriched.state)) {
        const parts = [displayAddress]
        const localityParts = [enriched.suburb, [enriched.state, enriched.postcode].filter(Boolean).join(' ')].filter(Boolean)
        if (localityParts.length > 0) parts.push(localityParts.join(' '))
        displayAddress = parts.join(', ')
      }

      const fullData = {
        name: ro.name || candidate.name,
        slug,
        description,
        region: ro.region || candidate.region || enriched.suburb || null,
        state: enriched.state || null,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        website: normaliseUrl(ro.website_url || candidate.website_url) || null,
        phone: enriched.phone || null,
        address: displayAddress,
        email: enriched.email || null,
        suburb: enriched.suburb || ro.region || candidate.region || null,
        postcode: enriched.postcode || null,
        opening_hours: enriched.opening_hours || null,
        instagram_handle: enriched.instagram_handle || null,
        category: effectiveCategory,
        // Hero image: always null for new listings.
        // Unclaimed listings use the designed fallback — no scraping, no og:image.
        // Venue owners upload their own hero image when they claim the listing.
        hero_image_url: null,
      }

      if (ogImage) {
        console.log(`[approve] Ignoring og:image (${ogImage}) — new listings use default hero. Owner uploads on claim.`)
      }

      // 6. Push to the vertical's own database (synchronous with retries)
      console.log(`[approve] Pushing to ${vertical} vertical DB (up to 3 attempts)...`)
      const pushResult = await pushToVerticalWithRetry(vertical, fullData, 3)
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
        region: fullData.region,
        state: fullData.state,
        lat: fullData.lat,
        lng: fullData.lng,
        website: fullData.website,
        phone: fullData.phone,
        address: fullData.address,
        hero_image_url: null, // Default hero — owner uploads on claim
        sub_type: fullData.category || null,
        sub_type_secondary: effectiveSecondary,
        sub_types: subTypes,
        status: 'active',
        is_claimed: false,
        is_featured: false,
        data_source: isAiOriginated ? 'ai_generated' : 'manually_curated',
        needs_review: isAiOriginated,
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

        // Update all fields — include slug and name in case they changed since the first attempt
        const updatePayload = {
          source_id: effectiveSourceId,
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
          sub_type: fullData.category || null,
          sub_type_secondary: effectiveSecondary,
          sub_types: subTypes,
          status: 'active',
          data_source: listingData.data_source,
          needs_review: listingData.needs_review,
        }
        // Never overwrite hero_image_url from scraping — owner uploads on claim

        await sb.from('listings').update(updatePayload).eq('id', listingId)
        console.log(`[approve] Updated existing master listing ${listingId} (matched by ${matchedBy}: "${existingListing[matchedBy]}" → new slug: "${slug}")`)

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
