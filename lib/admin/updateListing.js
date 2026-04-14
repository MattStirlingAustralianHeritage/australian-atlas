// ============================================================
// Canonical listing update function
// Every admin tool that writes to the listings table MUST use this.
// Listing Editor, Listings Review, Candidate Review, Visibility, etc.
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { updateInVertical, pushToVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

/**
 * Geocode an address via Mapbox (shared with candidate approval).
 * Returns { lat, lng, place_name } or null.
 */
async function geocodeAddress(address, state) {
  if (!address) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000) // 8s timeout
  try {
    const query = `${address}${state ? `, ${state}` : ''}, Australia`
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${token}`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    return { lat: feature.center[1], lng: feature.center[0], place_name: feature.place_name || null }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Must match the GET endpoint in /api/admin/listings/route.js — do NOT add
// columns here unless they are guaranteed to exist (i.e. in the base migration).
// Columns from optional migrations (e.g. humanised from 036) can be WRITTEN
// via ALLOWED_FIELDS but must NOT appear in the SELECT or saves will fail
// when the migration hasn't been applied.
const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, sub_type, sub_types, status, editors_pick, created_at, updated_at'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'status', 'hero_image_url', 'vertical', 'sub_type',
  'sub_types', 'humanised', 'humanised_at',
]

/**
 * Update a master listing and optionally sync to its vertical DB.
 *
 * @param {string} id           - Master listing UUID
 * @param {object} rawUpdates   - Fields to update (will be filtered to ALLOWED_FIELDS)
 * @param {object} [options]
 * @param {boolean} [options.syncToVertical=true]  - Push changes to vertical DB
 * @param {string}  [options.action='edit']        - Context label for logging
 * @returns {{ success: boolean, listing: object|null, verticalSync: object|null, error: string|null }}
 */
export async function updateListing(id, rawUpdates, options = {}) {
  const { syncToVertical = true, action = 'edit' } = options

  // ── 1. Validate ID ──
  if (!id) {
    return { success: false, listing: null, verticalSync: null, error: 'Missing listing ID' }
  }

  // ── 2. Filter to allowed fields ──
  const updates = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in rawUpdates) updates[key] = rawUpdates[key]
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, listing: null, verticalSync: null, error: 'No valid fields to update' }
  }

  // ── 3. Normalise website URL ──
  if ('website' in updates) {
    if (!updates.website || updates.website.trim() === '') {
      // Empty string → null (consistent with "no website")
      updates.website = null
    } else {
      let url = updates.website.trim()
      // Reject dangerous or non-http(s) schemes
      if (/^(javascript|data|vbscript|about|ftp):/i.test(url)) {
        return { success: false, listing: null, verticalSync: null, error: 'Invalid URL scheme — only http/https URLs are allowed' }
      }
      // Strip common malformed prefixes
      url = url.replace(/^https?\/\//, 'https://')  // http// → https://
      url = url.replace(/^https?:\/(?=[^/])/, 'https://') // https:/x → https://x
      // Add protocol if missing
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`
      }
      // Upgrade http to https
      if (url.startsWith('http://')) {
        url = url.replace(/^http:\/\//, 'https://')
      }
      // Encode spaces (common in pasted URLs)
      url = url.replace(/ /g, '%20')
      updates.website = url
    }
  }

  // ── 4. Validate lat/lng ──
  if ('lat' in updates && updates.lat !== null && updates.lat !== undefined) {
    updates.lat = parseFloat(updates.lat)
    if (isNaN(updates.lat)) {
      return { success: false, listing: null, verticalSync: null, error: 'Invalid latitude value' }
    }
  }
  if ('lng' in updates && updates.lng !== null && updates.lng !== undefined) {
    updates.lng = parseFloat(updates.lng)
    if (isNaN(updates.lng)) {
      return { success: false, listing: null, verticalSync: null, error: 'Invalid longitude value' }
    }
  }

  // ── 4b. Re-geocode when address actually changes ──
  // Editors send all fields (including old lat/lng), so we compare against the
  // current DB value to decide whether the address was meaningfully changed.
  let currentListing = null
  if ('address' in updates && updates.address) {
    const sb0 = getSupabaseAdmin()
    const { data: cur } = await sb0.from('listings').select('address, state, region, lat, lng').eq('id', id).maybeSingle()
    currentListing = cur

    if (cur && updates.address !== cur.address) {
      const state = updates.state || cur.state || null
      const coords = await geocodeAddress(updates.address, state)
      if (coords) {
        updates.lat = coords.lat
        updates.lng = coords.lng
        console.log(`[updateListing] Re-geocoded address "${updates.address}" → ${coords.lat}, ${coords.lng} (${coords.place_name})`)

        // ── 4c. Best-effort region re-assignment from new coordinates ──
        // Find the nearest region by Haversine distance to region centers.
        // This is a short-term heuristic pending PostGIS ST_Contains.
        try {
          const { data: regions } = await sb0
            .from('regions')
            .select('name, state, center_lat, center_lng')
            .not('center_lat', 'is', null)
            .not('center_lng', 'is', null)

          if (regions && regions.length > 0) {
            const toRad = d => d * Math.PI / 180
            const haversine = (lat1, lng1, lat2, lng2) => {
              const dLat = toRad(lat2 - lat1)
              const dLng = toRad(lng2 - lng1)
              const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
              return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            }

            let nearest = null
            let minDist = Infinity
            for (const r of regions) {
              const dist = haversine(coords.lat, coords.lng, r.center_lat, r.center_lng)
              if (dist < minDist) {
                minDist = dist
                nearest = r
              }
            }

            // Only assign if within 150km of a region center (avoids wild mismatches)
            if (nearest && minDist < 150) {
              updates.region = nearest.name
              console.log(`[updateListing] Re-assigned region to "${nearest.name}" (${minDist.toFixed(1)}km from center)`)
            } else {
              console.log(`[updateListing] No region within 150km — nearest was "${nearest?.name}" at ${minDist.toFixed(1)}km`)
            }
          }
        } catch (regionErr) {
          console.warn(`[updateListing] Region re-assignment failed:`, regionErr.message)
        }
      } else {
        console.warn(`[updateListing] Re-geocode failed for address: "${updates.address}"`)
      }
    }
  }

  // ── 5. Stamp updated_at ──
  updates.updated_at = new Date().toISOString()

  // ── 5. Write to master DB ──
  const sb = getSupabaseAdmin()
  let listing = null
  try {
    const { data, error } = await sb
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (error) {
      console.error(`[updateListing/${action}] Supabase error:`, error.message, error.code, error.details)
      return {
        success: false,
        listing: null,
        verticalSync: null,
        error: `Database update failed: ${error.message}`,
      }
    }

    if (!data) {
      return {
        success: false,
        listing: null,
        verticalSync: null,
        error: 'Listing not found — may have been deleted',
      }
    }

    listing = data
  } catch (err) {
    console.error(`[updateListing/${action}] Unexpected error:`, err.message)
    return {
      success: false,
      listing: null,
      verticalSync: null,
      error: `Unexpected error: ${err.message}`,
    }
  }

  // ── 6. Immediate sync to vertical (master already succeeded) ──
  // Three paths:
  //   a) Valid source_id → update the existing vertical row
  //   b) Placeholder source_id (candidate-*) or null → insert a new vertical row, then link it
  //   c) No vertical configured → skip
  let verticalSync = null
  if (syncToVertical && listing.vertical) {
    const verticalName = VERTICAL_DISPLAY_NAMES[listing.vertical] || listing.vertical

    try {
      // Primary category: prefer sub_types[0] (canonical array), fall back to sub_type (legacy scalar)
      const primaryCategory = (Array.isArray(listing.sub_types) && listing.sub_types.length > 0)
        ? listing.sub_types[0]
        : (listing.sub_type || null)

      const syncData = {
        name: listing.name,
        slug: listing.slug,
        description: listing.description,
        region: listing.region,
        state: listing.state,
        lat: listing.lat,
        lng: listing.lng,
        website: listing.website,
        phone: listing.phone,
        address: listing.address,
        hero_image_url: listing.hero_image_url,
        suburb: listing.region,
        category: primaryCategory,
        _hidden: listing.status === 'hidden' || listing.status === 'inactive',
      }

      // Try to get the category from meta table for accurate vertical sync
      try {
        const EXTENSION_TABLES = {
          sba: 'sba_meta', collection: 'collection_meta', craft: 'craft_meta',
          fine_grounds: 'fine_grounds_meta', rest: 'rest_meta', field: 'field_meta',
          corner: 'corner_meta', found: 'found_meta', table: 'table_meta',
        }
        const metaTable = EXTENSION_TABLES[listing.vertical]
        if (metaTable) {
          const { data: metaRow } = await sb.from(metaTable).select('*').eq('listing_id', id).maybeSingle()
          if (metaRow) {
            // Map meta fields to the category field used by pushToVertical
            if (metaRow.producer_type) syncData.category = metaRow.producer_type
            else if (metaRow.institution_type) syncData.category = metaRow.institution_type
            else if (metaRow.discipline) syncData.category = metaRow.discipline
            else if (metaRow.entity_type) syncData.category = metaRow.entity_type
            else if (metaRow.accommodation_type) syncData.category = metaRow.accommodation_type
            else if (metaRow.feature_type) syncData.category = metaRow.feature_type
            else if (metaRow.shop_type) syncData.category = metaRow.shop_type
            else if (metaRow.food_type) syncData.category = metaRow.food_type
          }
        }
      } catch {}

      const hasValidSourceId = listing.source_id
        && !String(listing.source_id).startsWith('candidate-')

      if (hasValidSourceId) {
        // ── Path A: update existing vertical row ──
        const result = await updateInVertical(listing.vertical, listing.source_id, syncData)
        if (result.success) {
          verticalSync = { success: true, vertical: verticalName, method: 'updated' }
        } else {
          console.warn(`[updateListing/${action}] Vertical update failed for ${id}:`, result.error)
          verticalSync = { success: false, vertical: verticalName, warning: result.error }
        }
      } else {
        // ── Path B: no valid source_id — check slug first, then update or insert ──
        const config = VERTICAL_CONFIG[listing.vertical]
        if (!config || !config.url) {
          verticalSync = { success: false, vertical: verticalName, warning: `No config for vertical: ${listing.vertical}` }
        } else {
          const vertClient = getVerticalClient(listing.vertical)
          let table = config.table
          if (listing.vertical === 'fine_grounds') {
            // Fine Grounds has two tables: roasters + cafes — use category from meta
            table = syncData.category === 'cafe' ? 'cafes' : 'roasters'
          }

          // Check if the listing already exists in the vertical DB by slug
          // For fine_grounds, also check the other table in case the category changed
          let existingRow = null
          const { data: foundRow } = await vertClient
            .from(table)
            .select('id')
            .eq('slug', listing.slug)
            .maybeSingle()
          existingRow = foundRow

          if (!existingRow && listing.vertical === 'fine_grounds') {
            const otherTable = table === 'roasters' ? 'cafes' : 'roasters'
            const { data: otherRow } = await vertClient
              .from(otherTable)
              .select('id')
              .eq('slug', listing.slug)
              .maybeSingle()
            if (otherRow) {
              existingRow = otherRow
              table = otherTable // use the table where we actually found it
            }
          }

          if (existingRow) {
            // ── Path B1: row exists by slug — update it and link source_id ──
            const verticalId = String(existingRow.id)
            const result = await updateInVertical(listing.vertical, verticalId, syncData)
            const sb = getSupabaseAdmin()
            const { error: linkError } = await sb
              .from('listings')
              .update({ source_id: verticalId })
              .eq('id', id)

            if (result.success) {
              listing.source_id = verticalId
              verticalSync = { success: true, vertical: verticalName, method: 'linked+updated' }
              if (linkError) {
                verticalSync.warning = `Updated but source_id link failed: ${linkError.message}`
              }
              console.log(`[updateListing/${action}] Found existing ${verticalName} row by slug, linked source_id ${verticalId}`)
            } else {
              console.warn(`[updateListing/${action}] Found ${verticalName} row by slug but update failed:`, result.error)
              verticalSync = { success: false, vertical: verticalName, warning: result.error }
            }
          } else {
            // ── Path B2: truly new — push a new row and link back ──
            const pushResult = await pushToVertical(listing.vertical, syncData)
            if (pushResult.success && pushResult.id) {
              const sb = getSupabaseAdmin()
              const { error: linkError } = await sb
                .from('listings')
                .update({ source_id: pushResult.id })
                .eq('id', id)

              if (linkError) {
                console.warn(`[updateListing/${action}] Pushed to ${verticalName} but source_id link failed:`, linkError.message)
                verticalSync = { success: true, vertical: verticalName, method: 'inserted',
                  warning: `Pushed but source_id link failed: ${linkError.message}` }
              } else {
                listing.source_id = pushResult.id
                verticalSync = { success: true, vertical: verticalName, method: 'inserted' }
                console.log(`[updateListing/${action}] Pushed to ${verticalName} and linked source_id ${pushResult.id}`)
              }
            } else {
              console.warn(`[updateListing/${action}] Vertical push failed for ${id}:`, pushResult.error)
              verticalSync = { success: false, vertical: verticalName, warning: pushResult.error }
            }
          }
        }
      }
    } catch (syncErr) {
      // Vertical sync failures NEVER block the master update result
      console.warn(`[updateListing/${action}] Vertical sync exception:`, syncErr.message)
      verticalSync = { success: false, vertical: verticalName, warning: syncErr.message }
    }
  }

  return { success: true, listing, verticalSync, error: null }
}

/**
 * Hide or unhide a listing (convenience wrapper).
 */
export async function toggleListingVisibility(id, hide) {
  return updateListing(id, {
    status: hide ? 'hidden' : 'active',
  }, { action: hide ? 'hide' : 'unhide' })
}
