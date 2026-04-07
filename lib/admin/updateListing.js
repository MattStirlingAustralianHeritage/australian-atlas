// ============================================================
// Canonical listing update function
// Every admin tool that writes to the listings table MUST use this.
// Listing Editor, Humanator, Candidate Review, Visibility, etc.
// ============================================================

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { updateInVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, humanised, humanised_at, created_at, updated_at'

const ALLOWED_FIELDS = [
  'name', 'description', 'website', 'region', 'state', 'address',
  'lat', 'lng', 'phone', 'is_claimed', 'is_featured', 'is_market',
  'editors_pick', 'status', 'hero_image_url', 'vertical',
  'humanised', 'humanised_at',
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

  // ── 3. Validate lat/lng ──
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

  // ── 4. Stamp updated_at ──
  updates.updated_at = new Date().toISOString()

  // ── 5. Write to master DB ──
  let listing = null
  try {
    const sb = getSupabaseAdmin()
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

  // ── 6. Sync to vertical (non-blocking — master update already succeeded) ──
  let verticalSync = null
  if (syncToVertical && listing.vertical && listing.source_id) {
    try {
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
        category: null,
        _hidden: listing.status === 'hidden' || listing.status === 'inactive',
      }

      const result = await updateInVertical(listing.vertical, listing.source_id, syncData)
      const verticalName = VERTICAL_DISPLAY_NAMES[listing.vertical] || listing.vertical

      if (result.success) {
        verticalSync = { success: true, vertical: verticalName }
      } else {
        console.warn(`[updateListing/${action}] Vertical sync failed for ${id}:`, result.error)
        verticalSync = { success: false, vertical: verticalName, warning: result.error }
      }
    } catch (syncErr) {
      // Vertical sync failures NEVER block the master update result
      const verticalName = VERTICAL_DISPLAY_NAMES[listing.vertical] || listing.vertical
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
