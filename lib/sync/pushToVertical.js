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

// Valid categories per vertical — aligned with DB CHECK constraints on meta/vertical tables
export const VERTICAL_CATEGORIES = {
  sba: ['brewery', 'winery', 'distillery', 'cidery', 'meadery', 'cellar_door', 'sour_brewery', 'non_alcoholic'],
  collection: ['museum', 'gallery', 'heritage_site', 'cultural_centre', 'botanical_garden', 'sculpture_park'],
  craft: ['ceramics_clay', 'visual_art', 'jewellery_metalwork', 'textile_fibre', 'wood_furniture', 'glass', 'printmaking'],
  fine_grounds: ['roaster', 'cafe'],
  rest: ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage', 'self_contained'],
  field: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park', 'wildlife_zoo', 'bush_walk'],
  corner: ['bookshop', 'records', 'homewares', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'plants', 'art_supplies', 'other'],
  found: ['vintage_clothing', 'vintage_furniture', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
  table: ['restaurant', 'bakery', 'market', 'farm_gate', 'artisan_producer', 'specialty_retail', 'destination', 'cooking_school', 'providore', 'food_trail', 'cafe', 'creamery'],
}

// Default category per vertical — used when no valid category provided
const VERTICAL_DEFAULTS = {
  sba: 'winery', collection: 'museum', craft: 'ceramics_clay',
  fine_grounds: 'roaster', rest: 'boutique_hotel', field: 'lookout',
  corner: 'general', found: 'vintage_clothing', table: 'restaurant',
}

/**
 * Validate and normalise a category for a vertical.
 * Returns a valid category string, falling back to the vertical's default.
 */
export function validateCategory(vertical, category) {
  const valid = VERTICAL_CATEGORIES[vertical]
  if (!valid) return category || null

  if (category && valid.includes(category)) return category

  // Try lowercase/normalised match
  if (category) {
    const normalised = category.toLowerCase().replace(/[\s-]+/g, '_')
    if (valid.includes(normalised)) return normalised
  }

  // Fallback to default
  const fallback = VERTICAL_DEFAULTS[vertical] || valid[0]
  if (category) {
    console.warn(`[pushToVertical] Invalid category "${category}" for ${vertical}, using default "${fallback}"`)
  }
  return fallback
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
        email: data.email || null,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: validateCategory('sba', data.category),
        listing_tier: 'basic',
        status: 'published',
      }

    case 'collection':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: validateCategory('collection', data.category),
        listing_tier: 'basic',
        status: 'published',
      }

    case 'craft':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        suburb: data.suburb || data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        category: validateCategory('craft', data.category),
        published: true,
      }

    case 'fine_grounds':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        status: 'published',
      }

    case 'rest':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        sub_region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        type: validateCategory('rest', data.category),
        listing_tier: 'free',
        status: 'published',
      }

    case 'field': {
      // Field Atlas places table doesn't have phone, email, or opening_hours
      const { phone: _fieldPhone, ...fieldBase } = base
      return {
        ...fieldBase,
        region: data.region || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        place_type: validateCategory('field', data.category),
        published: true,
      }
    }

    case 'corner': {
      // Corner Atlas shops table doesn't have hero_image_url — remove from base
      const { hero_image_url: _cornerHero, ...cornerBase } = base
      return {
        ...cornerBase,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website_url: data.website || null,
        category: validateCategory('corner', data.category),
        published: true,
      }
    }

    case 'found':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website: data.website || null,
        category: validateCategory('found', data.category),
        published: true,
      }

    case 'table': {
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        suburb: data.suburb || data.region || null,
        lat: data.lat || null,
        lng: data.lng || null,
        website: data.website || null,
        category: validateCategory('table', data.category),
        published: true,
      }
    }

    default:
      return base
  }
}

/**
 * Insert or update a listing in the vertical's own database.
 * Uses UPSERT with ON CONFLICT (slug) to handle cases where a listing
 * already exists (e.g. re-push after a failed source_id link, or
 * candidate approval for a listing that was manually added earlier).
 *
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

    // UPSERT: insert if new, update if slug already exists.
    // This prevents duplicate key violations when a listing was previously
    // pushed but the source_id link back to master failed or was lost.
    const { data: upserted, error } = await client
      .from(table)
      .upsert(verticalRow, { onConflict: 'slug' })
      .select('id')
      .single()

    if (error) {
      return { success: false, id: null, table, error: error.message }
    }

    const id = upserted?.id ? String(upserted.id) : null
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
 * Push to vertical with retry logic + exponential backoff.
 * Returns the result from the last attempt, plus `attempts` count.
 */
export async function pushToVerticalWithRetry(vertical, data, maxRetries = 3) {
  let lastResult = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await pushToVertical(vertical, data)
    if (lastResult.success) {
      return { ...lastResult, attempts: attempt }
    }
    // Don't retry on validation errors (missing coords, unknown vertical) — only transient failures
    const err = (lastResult.error || '').toLowerCase()
    if (err.includes('no config for vertical') || err.includes('missing coordinates')) {
      return { ...lastResult, attempts: attempt }
    }
    if (attempt < maxRetries) {
      const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000) // 500ms, 1s, 2s
      await new Promise(r => setTimeout(r, delay))
      console.log(`[pushToVertical] Retry ${attempt}/${maxRetries} for ${vertical}: ${lastResult.error}`)
    }
  }
  return { ...lastResult, attempts: maxRetries }
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
    // Primary subcategory: prefer sub_types[0] (canonical), fall back to sub_type (legacy)
    const primaryCategory = (Array.isArray(listing.sub_types) && listing.sub_types.length > 0)
      ? listing.sub_types[0]
      : (listing.sub_type || null)

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
      category: primaryCategory,
    }

    // Fetch category from meta table (source of truth) to override stale sub_type
    const META_CATEGORY_KEY = {
      sba: { table: 'sba_meta', key: 'producer_type' },
      collection: { table: 'collection_meta', key: 'institution_type' },
      craft: { table: 'craft_meta', key: 'discipline' },
      fine_grounds: { table: 'fine_grounds_meta', key: 'entity_type' },
      rest: { table: 'rest_meta', key: 'accommodation_type' },
      field: { table: 'field_meta', key: 'feature_type' },
      corner: { table: 'corner_meta', key: 'shop_type' },
      found: { table: 'found_meta', key: 'shop_type' },
      table: { table: 'table_meta', key: 'food_type' },
    }
    const metaLookup = META_CATEGORY_KEY[vertical]
    if (metaLookup) {
      try {
        const { data: metaRow } = await sb
          .from(metaLookup.table)
          .select(metaLookup.key)
          .eq('listing_id', listingId)
          .maybeSingle()
        if (metaRow?.[metaLookup.key]) {
          data.category = metaRow[metaLookup.key]
        }
      } catch { /* meta fetch failure is non-blocking */ }
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
