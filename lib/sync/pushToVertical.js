// ============================================================
// Shared utility: push a listing to a vertical's own Supabase DB
// Used by candidate approval, backfill, and manual sync operations
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { isApprovedImageSource } from '@/lib/image-utils'
import { LISTING_REGION_SELECT, resolveRegionName } from '@/lib/regions'

// ── Vertical revalidation -----------------------------------------------
// After a sync write to a vertical's source DB, the vertical's page caches
// (Vercel ISR / revalidate=3600) hold stale renders for up to an hour. Each
// vertical exposes /api/revalidate so the portal can purge the affected
// path immediately. Phased rollout — Rest Atlas first; other verticals
// return 404 from this call until they ship the endpoint, which we record
// as a non-fatal status in sync_log.
const VERTICAL_BASE_URLS = {
  sba: 'https://smallbatchatlas.com.au',
  collection: 'https://collectionatlas.com.au',
  craft: 'https://craftatlas.com.au',
  fine_grounds: 'https://finegroundsatlas.com.au',
  rest: 'https://restatlas.com.au',
  field: 'https://fieldatlas.com.au',
  corner: 'https://corneratlas.com.au',
  found: 'https://foundatlas.com.au',
  table: 'https://tableatlas.com.au',
}

const VERTICAL_LISTING_PATH_PREFIX = {
  sba: '/venue',
  collection: '/venue',
  craft: '/venue',
  fine_grounds: '/roasters', // default — Fine Grounds branches to /cafes for category='cafe' inside triggerVerticalRevalidation
  rest: '/stay',
  field: '/places',
  corner: '/shops',
  found: '/shops',
  table: '/listings',
}

async function triggerVerticalRevalidation(vertical, slug, category) {
  const base = VERTICAL_BASE_URLS[vertical]
  let prefix = VERTICAL_LISTING_PATH_PREFIX[vertical]
  // Fine Grounds has two entity tables (roasters, cafes) with separate
  // listing-path prefixes. Branch on the listing's category to pick the
  // right one — same selector that pushToVertical() uses to choose the
  // target table. Default to /roasters when category isn't passed in.
  if (vertical === 'fine_grounds') {
    prefix = category === 'cafe' ? '/cafes' : '/roasters'
  }
  if (!base || !prefix || !slug) return 'skipped_no_target'

  const secret = process.env.REVALIDATION_SECRET
  if (!secret) return 'skipped_no_secret'

  const path = `${prefix}/${slug}`
  try {
    const url = `${base}/api/revalidate?path=${encodeURIComponent(path)}&secret=${encodeURIComponent(secret)}`
    const res = await fetch(url, { method: 'POST' })
    if (res.status === 404) return 'endpoint_not_yet_implemented'
    if (res.status === 401 || res.status === 403) return `auth_${res.status}`
    return res.ok ? 'revalidated' : `error_${res.status}`
  } catch (e) {
    return `fetch_error:${(e?.message || '').slice(0, 60)}`
  }
}

/**
 * Records a sync attempt in sync_log and triggers vertical cache
 * revalidation. Writes are non-fatal — if the log insert fails, the
 * caller's sync result is unchanged.
 *
 * @param {Object} params
 * @param {string} params.listingId         - portal listings.id
 * @param {string} params.vertical          - 'sba' | 'rest' | etc.
 * @param {string|null} params.slug         - listing slug (for revalidation path)
 * @param {string|number|null} params.sourceId - vertical source_id
 * @param {{name:string|null, source:string}} params.regionResolution - from resolveRegionName()
 * @param {'insert'|'update'|'sync'} params.syncAction
 * @param {boolean} params.verticalSuccess
 * @param {string|null} params.errorMessage
 * @param {string|null} [params.category] - listing category, used by Fine Grounds
 *   to pick the correct revalidation path prefix (/roasters vs /cafes). Optional;
 *   ignored by single-table verticals.
 */
export async function recordSyncAndRevalidate({
  listingId,
  vertical,
  slug,
  sourceId,
  regionResolution,
  syncAction,
  verticalSuccess,
  errorMessage,
  category,
}) {
  // Trigger revalidation only if the vertical write succeeded — no point
  // purging the cache when we haven't changed anything downstream.
  let revalidateStatus = null
  if (verticalSuccess && slug) {
    revalidateStatus = await triggerVerticalRevalidation(vertical, slug, category)
  }

  try {
    const sb = getSupabaseAdmin()
    await sb.from('sync_log').insert({
      listing_id: listingId,
      vertical,
      source_id: sourceId == null ? null : String(sourceId),
      resolved_region_name: regionResolution?.name ?? null,
      resolution_source: regionResolution?.source ?? 'null',
      sync_action: syncAction,
      vertical_response_status: verticalSuccess ? 'success' : 'error',
      revalidate_response_status: revalidateStatus,
      error_message: errorMessage || null,
    })
  } catch (e) {
    // Logging failure is non-fatal. Caller's sync state is authoritative.
    console.warn('[sync_log] insert failed:', e?.message)
  }

  return { revalidateStatus }
}

// Per-process cache of table column names keyed by "${url}:${table}"
const _columnCache = new Map()

async function getTableColumns(client, url, table) {
  const cacheKey = `${url}:${table}`
  if (_columnCache.has(cacheKey)) return _columnCache.get(cacheKey)

  try {
    const { data } = await client.from(table).select('*').limit(1)
    if (data && data.length > 0) {
      const cols = Object.keys(data[0])
      _columnCache.set(cacheKey, cols)
      return cols
    }
  } catch { /* introspection failure is non-blocking */ }
  return null
}

function stripUnknownColumns(payload, columns, vertical, table) {
  if (!columns) return payload
  const safe = {}
  for (const [key, value] of Object.entries(payload)) {
    if (columns.includes(key)) {
      safe[key] = value
    } else {
      console.warn(`[pushToVertical] Stripping field '${key}' — not on ${vertical}.${table}`)
    }
  }
  return safe
}

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
  rest: ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage', 'self_contained', 'eco_resort', 'heritage_hotel', 'national_park_stay', 'heritage_lighthouse'],
  field: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park', 'wildlife_zoo', 'bush_walk', 'botanic_garden', 'nature_reserve'],
  corner: ['bookshop', 'records', 'homewares', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'plants', 'other'],
  found: ['vintage_clothing', 'vintage_furniture', 'vintage_store', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
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

// NO UNIT TESTS YET — pending a separate test-bootstrap decision for the repo.
// Keep this function pure (no I/O, no side effects) so when tests land it's
// trivially testable.
/**
 * Validate a listing row before write. Sync write sites call this and route
 * rows that return { ok: false, reason } to listings_quarantine instead of
 * listings. See docs/architecture/regions.md Sync Behaviour §5.
 *
 * The input object must include vertical alongside the mapper output
 * (mappers don't set vertical themselves — the sync wrapper adds it).
 *
 * Reason strings are a stable enum — downstream §1.8 alert groups by them.
 *
 * @param {object} row - Full listing payload including `vertical` key.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateListingRow(row) {
  // Rule 1 — name: non-empty string.
  if (!row?.name || typeof row.name !== 'string' || row.name.trim() === '') {
    return { ok: false, reason: 'missing_name' }
  }

  // Rule 2 — slug: non-empty, lowercase a-z / digits / hyphens only.
  if (!row.slug || typeof row.slug !== 'string' || !/^[a-z0-9-]+$/.test(row.slug)) {
    return { ok: false, reason: 'invalid_slug' }
  }

  // Rule 3 — status: one of the four DB-legal values.
  if (!['active', 'inactive', 'pending', 'hidden'].includes(row.status)) {
    return { ok: false, reason: 'invalid_status' }
  }

  // Rule 4 — visitable: boolean (never NULL). Mappers use
  // normalizeVisitable which returns `row.visitable ?? true`, so this
  // should always be set — guards against a future mapper regression.
  if (typeof row.visitable !== 'boolean') {
    return { ok: false, reason: 'missing_visitable' }
  }

  // Rule 5 — visitable listings need location. Non-visitable listings
  // skip these checks entirely (online makers, by-appointment, etc.).
  if (row.visitable === true) {
    // 5a. latitude: number, roughly within Australia. Catches 0, -999,
    // and swapped lat/lng (longitude values are 112–154, outside this range).
    if (typeof row.lat !== 'number' || row.lat < -44 || row.lat > -10) {
      return { ok: false, reason: 'missing_or_invalid_latitude' }
    }
    // 5b. longitude: number, roughly within Australia.
    if (typeof row.lng !== 'number' || row.lng < 112 || row.lng > 154) {
      return { ok: false, reason: 'missing_or_invalid_longitude' }
    }
    // 5c. state: valid two-letter code.
    if (!['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'].includes(row.state)) {
      return { ok: false, reason: 'invalid_state_code' }
    }
  }

  // Rule 7 (checked before 6 for safety — rule 6 reads VERTICAL_CATEGORIES
  // keyed by vertical).
  const allowed = VERTICAL_CATEGORIES[row.vertical]
  if (!allowed) {
    return { ok: false, reason: 'unknown_vertical' }
  }

  // Rule 6 — sub_type: if present and non-empty, must be in the vertical's
  // canonical list. NULL / empty string pass — ~80% of current listings
  // have NULL sub_type; retroactive enforcement is out of scope.
  if (row.sub_type !== null && row.sub_type !== undefined && row.sub_type !== '') {
    if (!allowed.includes(row.sub_type)) {
      return { ok: false, reason: 'sub_type_not_in_vertical_canonical' }
    }
  }

  return { ok: true }
}

/**
 * Build a quarantine insert payload by stripping NULL / undefined values
 * from the mapper output. Explicit NULL in an INSERT prevents quarantine's
 * column defaults from firing (migration 099 copied listings defaults
 * onto quarantine). Omit unset keys and the defaults will apply.
 *
 * @param {object} listingData - Mapper output (may include undefined/null fields).
 * @param {string} reason - Stable failure-reason enum from validateListingRow.
 * @returns {object} Minimal payload safe to insert into listings_quarantine.
 */
export function buildQuarantinePayload(listingData, reason) {
  const payload = { failure_reason: reason }
  for (const [key, value] of Object.entries(listingData)) {
    if (value !== null && value !== undefined) {
      payload[key] = value
    }
  }
  return payload
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
    address_on_request: data.address_on_request || false,
    visitable: data.visitable ?? true,
    presence_type: data.presence_type || 'permanent',
  }

  // Include hero_image_url only from approved domains (Supabase Storage, GCS)
  if (data.hero_image_url !== undefined) {
    base.hero_image_url = isApprovedImageSource(data.hero_image_url) ? data.hero_image_url : null
  }

  switch (vertical) {
    case 'sba':
      return {
        ...base,
        sub_region: data.region || null,
        suburb: data.suburb || data.region || null,
        postcode: data.postcode || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        opening_hours: data.opening_hours || null,
        type: validateCategory('sba', data.category),
        listing_tier: 'basic',
        status: 'published',
      }

    case 'collection':
      return {
        ...base,
        opening_hours: data.opening_hours || null,
        sub_region: data.region || null,
        suburb: data.suburb || data.region || null,
        postcode: data.postcode || null,
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
        opening_hours: data.opening_hours || null,
        // sub_region holds the resolved region name; suburb retains its existing
        // dual-purpose behaviour until a separate read-side change switches the
        // render path off suburb. Migration 007_add_sub_region must be applied
        // before this column is non-stripped on write.
        sub_region: data.region || null,
        suburb: data.suburb || data.region || null,
        postcode: data.postcode || null,
        latitude: data.lat || null,
        longitude: data.lng || null,
        website: data.website || null,
        category: validateCategory('craft', data.category),
        offers_classes: data.offers_classes || false,
        classes: data.classes || null,
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
        needs_review: false,
      }

    case 'rest':
      return {
        ...base,
        email: data.email || null,
        opening_hours: data.opening_hours || null,
        sub_region: data.region || null,
        postcode: data.postcode || null,
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
        suburb: data.suburb || data.region || null,
        postcode: data.postcode || null,
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
        // See craft case for sub_region rationale.
        sub_region: data.region || null,
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
        // See craft case for sub_region rationale.
        sub_region: data.region || null,
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
        // See craft case for sub_region rationale.
        sub_region: data.region || null,
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

    // Warn if coordinates are missing — some vertical DBs have NOT NULL constraints,
    // but others (Collection, Corner, Found) allow nullable coords.
    // Let the upsert attempt proceed and fail naturally if the DB requires them.
    const lat = data.lat ?? null
    const lng = data.lng ?? null
    if (lat == null || lng == null) {
      console.warn(`[pushToVertical] Missing coordinates for "${data.name}" — pushing to ${VERTICAL_DISPLAY_NAMES[vertical] || vertical} without coords`)
    }

    const client = getVerticalClient(vertical)
    const verticalRow = mapToVerticalSchema(vertical, data)

    // Determine target table (Fine Grounds has two)
    let table = config.table
    if (vertical === 'fine_grounds') {
      table = data.category === 'cafe' ? 'cafes' : 'roasters'
    }

    // Strip columns that don't exist on the target table
    const columns = await getTableColumns(client, config.url, table)
    const safeRow = stripUnknownColumns(verticalRow, columns, vertical, table)

    const { data: upserted, error } = await client
      .from(table)
      .upsert(safeRow, { onConflict: 'slug' })
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

    // Strip columns that don't exist on the target table
    const columns = await getTableColumns(client, config.url, table)
    const safeRow = stripUnknownColumns(verticalRow, columns, vertical, table)

    const { error } = await client
      .from(table)
      .update(safeRow)
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

    // Read the master listing — include the region relations so
    // resolveRegionName() can apply override → computed → legacy
    // fallback. Single source of truth for the region text we push to
    // verticals.
    const { data: listing, error: readError } = await sb
      .from('listings')
      .select(`*, ${LISTING_REGION_SELECT}`)
      .eq('id', listingId)
      .single()

    if (readError || !listing) {
      return {
        success: false, verticalRowId: null, verticalName, url: null,
        error: `Master listing not found: ${readError?.message || 'no data'}`,
        warning: null,
      }
    }

    // Resolve the region text for downstream vertical push.
    const regionResolution = resolveRegionName(listing)

    // Build the data object for the vertical push
    // Primary subcategory: prefer sub_types[0] (canonical), fall back to sub_type (legacy)
    const primaryCategory = (Array.isArray(listing.sub_types) && listing.sub_types.length > 0)
      ? listing.sub_types[0]
      : (listing.sub_type || null)

    const data = {
      name: listing.name,
      slug: listing.slug,
      description: listing.description,
      region: regionResolution.name,
      state: listing.state,
      lat: listing.lat,
      lng: listing.lng,
      website: listing.website,
      phone: listing.phone,
      address: listing.address,
      hero_image_url: isApprovedImageSource(listing.hero_image_url) ? listing.hero_image_url : null,
      suburb: listing.suburb || regionResolution.name,
      postcode: listing.postcode || null,
      opening_hours: listing.opening_hours || null,
      category: primaryCategory,
      address_on_request: listing.address_on_request || false,
      visitable: listing.visitable ?? true,
      presence_type: listing.presence_type || 'permanent',
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
      // Log the failure too — useful when triaging stuck syncs.
      await recordSyncAndRevalidate({
        listingId,
        vertical,
        slug: listing.slug,
        sourceId: null,
        regionResolution,
        syncAction: 'sync',
        verticalSuccess: false,
        errorMessage: result.error,
        category: data.category,
      })
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

    // Log success + trigger vertical cache revalidation. Both are
    // non-fatal — sync result is authoritative.
    const { revalidateStatus } = await recordSyncAndRevalidate({
      listingId,
      vertical,
      slug: listing.slug,
      sourceId: result.id,
      regionResolution,
      syncAction: 'sync',
      verticalSuccess: true,
      errorMessage: null,
      category: data.category,
    })

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
      regionResolution,
      revalidateStatus,
    }
  } catch (err) {
    return {
      success: false, verticalRowId: null, verticalName, url: null,
      error: err.message,
      warning: null,
    }
  }
}
