// ============================================================
// Shared utility: push a listing to a vertical's own Supabase DB
// Used by candidate approval, backfill, and manual sync operations
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'

export const VERTICAL_DISPLAY_NAMES = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

/** Map enriched listing data to a vertical's native table schema */
export function mapToVerticalSchema(vertical, data) {
  const base = {
    name: data.name,
    slug: data.slug,
    description: data.description || null,
    state: data.state || null,
    phone: data.phone || null,
    address: data.address || null,
  }

  // Include hero_image_url if present in source data
  if (data.hero_image_url !== undefined) {
    base.hero_image_url = data.hero_image_url || null
  }

  switch (vertical) {
    case 'sba':
      return {
        ...base,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: data.category || 'winery',
        status: 'published',
      }

    case 'collection':
      return {
        ...base,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: data.category || 'museum',
        institution_type: data.category || 'museum',
        status: 'published',
      }

    case 'craft':
      return {
        ...base,
        suburb: data.suburb || data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        category: data.category || 'ceramics_clay',
        published: true,
      }

    case 'fine_grounds':
      return {
        ...base,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        status: 'published',
      }

    case 'rest':
      return {
        ...base,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: data.category || 'boutique_hotel',
        status: 'published',
      }

    case 'field':
      // Field Atlas places table doesn't have phone — remove from base
      const { phone: _fieldPhone, ...fieldBase } = base
      return {
        ...fieldBase,
        region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        place_type: data.category || 'lookout',
        published: true,
      }

    case 'corner':
      // Corner Atlas shops table doesn't have hero_image_url — remove from base
      const { hero_image_url: _cornerHero, ...cornerBase } = base
      return {
        ...cornerBase,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website_url: data.website || null,
        category: data.category || 'general',
        published: true,
      }

    case 'found':
      return {
        ...base,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website: data.website || null,
        category: data.category || 'vintage_clothing',
        published: true,
      }

    case 'table':
      return {
        ...base,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website_url: data.website || null,
        category: data.category || 'restaurant',
        published: true,
      }

    default:
      return base
  }
}

/**
 * Insert a listing into the vertical's own database.
 * Returns { success, id, table, error }
 */
export async function pushToVertical(vertical, data) {
  try {
    const config = VERTICAL_CONFIG[vertical]
    if (!config || !config.url) {
      return { success: false, id: null, table: null, error: `No config for vertical: ${vertical}` }
    }

    // Validate required fields — most vertical DBs have NOT NULL constraints on coordinates
    const lat = data.lat ?? null
    const lng = data.lng ?? null
    if (lat == null || lng == null) {
      return { success: false, id: null, table: config.table, error: `Missing coordinates (lat/lng) — cannot push to ${VERTICAL_DISPLAY_NAMES[vertical] || vertical}` }
    }

    const client = getVerticalClient(vertical)
    const verticalRow = mapToVerticalSchema(vertical, data)

    // Determine target table (Fine Grounds has two)
    let table = config.table
    if (vertical === 'fine_grounds') {
      table = data.category === 'cafe' ? 'cafes' : 'roasters'
    }

    const { data: inserted, error } = await client
      .from(table)
      .insert(verticalRow)
      .select('id')
      .single()

    if (error) {
      return { success: false, id: null, table, error: error.message }
    }

    const id = inserted?.id ? String(inserted.id) : null
    return { success: !!id, id, table, error: null }
  } catch (err) {
    return { success: false, id: null, table: null, error: err.message }
  }
}

/**
 * Update an existing listing in the vertical's own database.
 * Uses the source_id to find the row. Skips candidate placeholders.
 * Returns { success, table, error }
 */
export async function updateInVertical(vertical, sourceId, data) {
  try {
    if (!sourceId || String(sourceId).startsWith('candidate-')) {
      return { success: false, table: null, error: 'Listing not yet in vertical DB (no valid source_id)' }
    }

    const config = VERTICAL_CONFIG[vertical]
    if (!config || !config.url) {
      return { success: false, table: null, error: `No config for vertical: ${vertical}` }
    }

    const client = getVerticalClient(vertical)
    const verticalRow = mapToVerticalSchema(vertical, data)

    // Determine target table
    let table = config.table
    if (vertical === 'fine_grounds') {
      table = data.category === 'cafe' ? 'cafes' : 'roasters'
    }

    // If listing is hidden, override the status/published field
    if (data._hidden) {
      if ('published' in verticalRow) verticalRow.published = false
      if ('status' in verticalRow) verticalRow.status = 'draft'
    }

    const { error } = await client
      .from(table)
      .update(verticalRow)
      .eq('id', sourceId)

    if (error) {
      return { success: false, table, error: error.message }
    }
    return { success: true, table, error: null }
  } catch (err) {
    return { success: false, table: null, error: err.message }
  }
}

/**
 * Build the public URL for a listing on a vertical site.
 * Returns the URL string or null.
 */
export function getVerticalListingUrl(vertical, slug, category) {
  const config = VERTICAL_CONFIG[vertical]
  if (!config || !slug) return null

  let path = config.listingPath
  if (vertical === 'fine_grounds' && config.listingPaths) {
    path = category === 'cafe' ? config.listingPaths.cafes : config.listingPaths.roasters
  }
  if (!path) return null

  return `${config.baseUrl}${path}/${slug}`
}

/**
 * Sync a single master listing to its vertical DB.
 * Reads the listing from master, maps to vertical schema, inserts into vertical,
 * then updates the master source_id to match the vertical row ID.
 *
 * Returns { success, verticalRowId, verticalName, url, error, warning }
 */
export async function syncListingToVertical(listingId, vertical) {
  const verticalName = VERTICAL_DISPLAY_NAMES[vertical] || vertical

  try {
    const sb = getSupabaseAdmin()

    // Read the master listing
    const { data: listing, error: readError } = await sb
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single()

    if (readError || !listing) {
      return {
        success: false, verticalRowId: null, verticalName, url: null,
        error: `Master listing not found: ${readError?.message || 'no data'}`,
        warning: null,
      }
    }

    // Build the data object for the vertical push
    const data = {
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
      category: listing.sub_type || null,
    }

    const result = await pushToVertical(vertical, data)

    if (!result.success) {
      return {
        success: false, verticalRowId: null, verticalName, url: null,
        error: result.error,
        warning: null,
      }
    }

    // Update master source_id to match the vertical row so sync won't duplicate
    const { error: updateError } = await sb
      .from('listings')
      .update({ source_id: result.id })
      .eq('id', listingId)

    const url = getVerticalListingUrl(vertical, listing.slug, null)
    const warning = updateError
      ? `Vertical push succeeded but source_id update failed: ${updateError.message}`
      : null

    return {
      success: true,
      verticalRowId: result.id,
      verticalName,
      url,
      error: null,
      warning,
    }
  } catch (err) {
    return {
      success: false, verticalRowId: null, verticalName, url: null,
      error: err.message,
      warning: null,
    }
  }
}
