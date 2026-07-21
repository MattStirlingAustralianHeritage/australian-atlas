// ============================================================
// Canonical listing update function
// Every admin tool that writes to the listings table MUST use this.
// Listing Editor, Listings Review, Candidate Review, Visibility, etc.
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { updateInVertical, pushToVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'
import { anchoredGeocode } from '@/lib/geo/anchoredGeocode'
import { resolveRegionForCoords } from '@/lib/geo/resolveRegionForCoords'
import { resolveRegionParam } from '@/lib/regions'

// Must match the GET endpoint in /api/admin/listings/route.js — do NOT add
// columns here unless they are guaranteed to exist (i.e. in the base migration).
// Columns from optional migrations (e.g. humanised from 036) can be WRITTEN
// via ALLOWED_FIELDS but must NOT appear in the SELECT or saves will fail
// when the migration hasn't been applied.
const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, sub_type, sub_types, status, editors_pick, created_at, updated_at'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'status', 'hero_image_url', 'vertical', 'verticals', 'sub_type',
  'sub_types', 'humanised', 'humanised_at',
  // Presence model (migrations 066 + 087 + 183). Write-only here — NOT in
  // SELECT_COLS — so an editor toggle (address-on-request, mobile venue,
  // service area) actually persists to the master listings row. The vertical
  // sync builds its own explicit payload below, so these never leak into it.
  'address_on_request', 'presence_type', 'visitable', 'service_area',
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

  // ── 4b. Region single source of truth ──────────────────────
  // The master detail page and BOTH editors (Listing Editor + the inline
  // place-page editor) resolve a listing's region from the FK chain
  // (region_override_id ?? region_computed_id), NOT the legacy `region` text
  // column. So a region change must drive the FK, otherwise the edit is inert
  // on the public page. We read the current FK state once, up front, and use it
  // for both the address-change geocode path (4c) and the explicit region edit
  // path (4d). Editors send all fields (incl. old values) every save, so we
  // compare against the DB to decide what actually changed.
  let currentListing = null
  let sb0 = null
  const touchesRegion = 'region' in updates
  const touchesAddress = 'address' in updates && !!updates.address
  if (touchesRegion || touchesAddress) {
    sb0 = getSupabaseAdmin()
    const { data: cur } = await sb0
      .from('listings')
      .select('address, state, suburb, region, lat, lng, region_override_id, region_computed_id')
      .eq('id', id)
      .maybeSingle()
    currentListing = cur
  }

  const addressChanged = touchesAddress && currentListing && updates.address !== currentListing.address

  // ── 4c. Address changed → re-geocode, region follows the new pin ──
  if (addressChanged) {
    const state = updates.state || currentListing.state || null
    const suburb = updates.suburb || currentListing.suburb || null
    // Anchored geocode: the postcode/suburb validates the precise result and
    // supplies a town-level fallback so a hard-to-resolve street string can't
    // land the pin in a same-named street hundreds of km away. See
    // lib/geo/anchoredGeocode.js.
    const coords = await anchoredGeocode({ address: updates.address, suburb, state })
    if (coords) {
      updates.lat = coords.lat
      updates.lng = coords.lng
      console.log(`[updateListing] Re-geocoded address "${updates.address}" → ${coords.lat}, ${coords.lng} [precision=${coords.precision}] (${coords.placeName})`)

      // The listings trigger (migration 097) recomputes region_computed_id by
      // polygon containment on the lat/lng write. resolveRegionForCoords adds a
      // nearest-centre fallback for points outside every polygon. We write:
      //   - region (text): kept in sync for the vertical push (verticals still
      //     read the legacy text column).
      //   - region_override_id (FK): set ONLY when the point is uncovered by any
      //     polygon, so the detail page — which reads the FK, not the text
      //     column — always shows a region. A clean polygon hit needs no
      //     override; the trigger's computed FK is authoritative.
      try {
        const region = await resolveRegionForCoords(sb0, coords.lat, coords.lng, { state })
        if (region) {
          updates.region = region.name
          if (region.source === 'nearest') {
            updates.region_override_id = region.id
            console.log(`[updateListing] Point outside all polygons — set region_override_id to "${region.name}" (${region.distKm.toFixed(0)}km from centre)`)
          } else {
            // Clean polygon hit — the trigger's computed FK is authoritative.
            // Drop any stale override so computed wins.
            updates.region_override_id = null
            console.log(`[updateListing] Region computed by containment: "${region.name}"`)
          }
        }
      } catch (regionErr) {
        console.warn(`[updateListing] Region re-assignment failed:`, regionErr.message)
      }
    } else {
      console.warn(`[updateListing] Re-geocode failed for address: "${updates.address}"`)
    }
  }

  // ── 4d. Explicit region edit → canonical region override ──
  // When the admin edits the region field directly (without changing the
  // address), treat it as a manual override against the pin-computed region so
  // the public page reflects exactly what was set. Skipped when the address
  // changed in this same save — there the new pin owns the region (4c above).
  if (touchesRegion && !addressChanged) {
    const name = typeof updates.region === 'string' ? updates.region.trim() : ''
    if (!name) {
      // Cleared → drop the override and fall back to the pin-computed region.
      updates.region_override_id = null
      updates.region = null
    } else {
      // Resolve against live AND draft regions. The admin editor's region
      // dropdown is populated from both (drafts are pre-launch regions that
      // are still legitimate assignment targets), so a pick must resolve to
      // its FK regardless of publish status — otherwise the edit lands only in
      // the display-dead `region` text column and the public page (which reads
      // region_override_id ?? region_computed_id) never moves. Archived regions
      // are intentionally excluded — they're retired and not assignable.
      const { region: resolved } = await resolveRegionParam(name, { statuses: ['live', 'draft'] })
      if (resolved?.id) {
        updates.region = resolved.name // canonical spelling for the text mirror
        // Only pin an override when the pin-computed region differs; if computed
        // already yields this region, no override is needed (keeps the FK clean
        // and lets the pin keep driving region on future re-geocodes).
        updates.region_override_id =
          resolved.id === currentListing?.region_computed_id ? null : resolved.id
      } else {
        // Unresolvable (archived, or an unknown free-text name not in the
        // dropdown) → keep the text as typed and leave the FK untouched, but
        // log it so a silently-inert region edit is at least traceable.
        console.warn(`[updateListing/${action}] Region "${name}" did not resolve to a live/draft region — FK override left unchanged (text mirror only)`)
      }
    }
  }

  // ── 5. Stamp updated_at ──
  updates.updated_at = new Date().toISOString()

  // ── 5. Write to master DB ──
  const sb = getSupabaseAdmin()
  let listing = null
  try {
    let { data, error } = await sb
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    // Forward-compat: the cross-vertical `verticals` column (migration 142)
    // may not exist on this deployment yet. Drop it and retry so a normal
    // edit still succeeds — the cross-vertical tags simply aren't written
    // until the migration lands. Mirrors the candidate /create fallback.
    if (error && error.code === '42703' && 'verticals' in updates) {
      console.warn(`[updateListing/${action}] verticals column absent (migration 142 pending) — saving without cross-vertical tags`)
      delete updates.verticals
      ;({ data, error } = await sb
        .from('listings')
        .update(updates)
        .eq('id', id)
        .select(SELECT_COLS)
        .single())
    }

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
      // Hero moderation status (master-only, migration 164): the vertical sync must
      // withhold a flagged/held hero. SELECT_COLS omits it (forward-compat with
      // pre-migration deploys), so read it separately + guarded — an absent column
      // leaves it undefined → treated as not-blocked (unchanged behaviour).
      let imageModerationStatus
      const { data: modRow, error: modReadErr } = await sb
        .from('listings')
        .select('image_moderation_status')
        .eq('id', id)
        .maybeSingle()
      if (!modReadErr && modRow) imageModerationStatus = modRow.image_moderation_status

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
        image_moderation_status: imageModerationStatus, // gate hero sync (see mapToVerticalSchema)
        // Ownership display state flows DOWN to the vertical (grantClaim relies
        // on this so the nightly sync re-derives the same truth it pushed).
        is_claimed: listing.is_claimed,
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
