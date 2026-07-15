// ============================================================
// Shared utility: push a listing to a vertical's own Supabase DB
// Used by candidate approval, backfill, and manual sync operations
// ============================================================

import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { isApprovedImageSource } from '@/lib/image-utils'
import { LISTING_REGION_SELECT, resolveRegionName } from '@/lib/regions'
import { WAY_PRIMARY_TYPES } from '@/lib/wayLabels'

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
  way: 'https://wayatlas.com.au',
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
  way: '/operators',          // Way's primary entity is the operator; experiences are nested under /operators/[slug]/[exp-slug] in Phase 3.
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
  way: 'Way Atlas',
}

// Valid categories per vertical — aligned with DB CHECK constraints on meta/vertical tables
export const VERTICAL_CATEGORIES = {
  sba: ['brewery', 'winery', 'distillery', 'cidery', 'meadery', 'cellar_door', 'sour_brewery', 'non_alcoholic'],
  collection: ['museum', 'gallery', 'heritage_site', 'cultural_centre', 'botanical_garden', 'sculpture_park', 'cinema', 'drive_in', 'live_music_venue', 'comedy_club', 'theatre', 'aboriginal_art_centre', 'artist_studio'],
  craft: ['ceramics_clay', 'visual_art', 'jewellery_metalwork', 'textile_fibre', 'wood_furniture', 'glass', 'printmaking', 'leathermaker', 'shoemaker', 'clothing', 'fragrance_candles', 'knifemaker', 'milliner'],
  fine_grounds: ['roaster', 'cafe'],
  rest: ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage', 'self_contained', 'eco_resort', 'heritage_hotel', 'national_park_stay', 'heritage_lighthouse', 'off_grid_cabin', 'houseboat'],
  field: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park', 'wildlife_zoo', 'bush_walk', 'botanic_garden', 'nature_reserve', 'fossicking'],
  corner: ['bookshop', 'records', 'homewares', 'design_store', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'bottle_shop', 'plants', 'nursery', 'specialty_retail', 'other'],
  found: ['vintage_clothing', 'vintage_furniture', 'vintage_store', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
  table: ['restaurant', 'bakery', 'market', 'farm_gate', 'pick_your_own', 'artisan_producer', 'specialty_retail', 'destination', 'cooking_school', 'providore', 'food_trail', 'cafe', 'creamery', 'chocolatier', 'confectioner', 'tea_shop', 'wine_bar', 'oyster_farm', 'historic_pub', 'ice_creamery', 'cheesemonger'],
  way: WAY_PRIMARY_TYPES,
}

// Default category per vertical — used when no valid category provided
const VERTICAL_DEFAULTS = {
  sba: 'winery', collection: 'museum', craft: 'ceramics_clay',
  fine_grounds: 'roaster', rest: 'boutique_hotel', field: 'lookout',
  corner: 'general', found: 'vintage_clothing', table: 'restaurant',
  way: 'guided_walk_day',
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

  // Rule 4 — visitable: boolean when present. presenceFields() omits the
  // key entirely for verticals whose source tables never received
  // migration 087 (portal is where visitable is curated there), so absence
  // is legal — a present-but-non-boolean value is a mapper regression.
  if ('visitable' in row && typeof row.visitable !== 'boolean') {
    return { ok: false, reason: 'missing_visitable' }
  }

  // Rule 5 — visitable listings need location. Non-visitable listings
  // skip these checks entirely (online makers, by-appointment, etc.).
  // Absent visitable counts as visitable: before presenceFields() those
  // sources defaulted to true, and their venues are physical places whose
  // coordinates should stay gated.
  if (row.visitable !== false) {
    // 5a. latitude: number, within Australia *including external territories*.
    // North: Torres Strait islands ~-9.2°; South: Macquarie Island ~-54.8°
    // (Tasmania mainland reaches ~-43.6°). Catches 0, -999, and swapped
    // lat/lng — a longitude value (+96..+169) is far outside this range.
    if (typeof row.lat !== 'number' || row.lat < -55 || row.lat > -9) {
      return { ok: false, reason: 'missing_or_invalid_latitude' }
    }
    // 5b. longitude: number, within Australia *including external territories*.
    // West: Cocos (Keeling) Islands ~96.8°E; East: Norfolk Island ~168.0°E.
    // Lord Howe Island (~159.1°E) sits between the mainland's eastern edge
    // (~153.6°E) and Norfolk — the old 112–154 mainland-only box wrongly
    // quarantined it. A swapped latitude (-9..-55) is far below 96, so
    // swap detection still holds.
    if (typeof row.lng !== 'number' || row.lng < 96 || row.lng > 169) {
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

/**
 * Reverse of mapWayPresenceTypeToPortal() in fieldMaps.js.
 * Maps portal presence_type values to Way's operators.presence_type.
 *
 * The forward mapping collapses multiple Way values to 'permanent'
 * (year_round, weather_dependent, tide_dependent all → permanent).
 * The reverse can't recover the original, so 'permanent' defaults
 * to 'year_round' — the most common Way presence type.
 *
 * Idempotent: Way-native values pass through unchanged, so callers
 * don't need to know whether the input is portal-normalised or raw.
 */
function mapPortalPresenceTypeToWay(presenceType) {
  switch (presenceType) {
    // Portal values → closest Way equivalent
    case 'permanent':      return 'year_round'
    case 'by_appointment': return 'by_appointment'
    case 'seasonal':       return 'seasonal'
    case 'markets':        return 'year_round'
    case 'online':         return 'year_round'
    case 'mobile':         return 'year_round'

    // Way-native values — pass through unchanged
    case 'year_round':         return 'year_round'
    case 'weather_dependent':  return 'weather_dependent'
    case 'charter_only':       return 'charter_only'
    case 'tide_dependent':     return 'tide_dependent'

    default:               return 'year_round'
  }
}

// ── Opening-hours normalisation ────────────────────────────────────────
// Two verticals — sba (Small Batch) and collection (Culture) — share a legacy
// `venues` table where opening_hours is a Postgres text[] (one display string
// per day), NOT jsonb like the other eight verticals. The enrichment pipeline
// and portal carry opening_hours as a { monday: "...", ... } day-map object,
// which Postgres rejects against a text[] column with "22P02 expected JSON
// array". Convert the day-map to the established text[] shape
// (["Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed", …]) before pushing to
// those two verticals. Inputs that are already a text[] (re-sync) or a plain
// string pass through safely; null/empty → null (never writes an empty array).
const _OH_DAYS = [
  ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'],
]
export function openingHoursToTextArray(oh) {
  if (oh == null) return null
  // Already a text[] (e.g. re-sync of a row read back from a text[] column).
  if (Array.isArray(oh)) {
    const cleaned = oh.filter(v => typeof v === 'string' && v.trim() !== '')
    return cleaned.length ? cleaned : null
  }
  // A single freeform string — wrap so the text[] column accepts it.
  if (typeof oh === 'string') {
    const t = oh.trim()
    return t ? [t] : null
  }
  // Day-map object { monday: "...", ... } — emit one "Day: hours" line per
  // known day, skipping days the enrichment left null/unknown.
  if (typeof oh === 'object') {
    const lines = []
    for (const [key, label] of _OH_DAYS) {
      const raw = oh[key]
      if (typeof raw !== 'string') continue
      const val = raw.trim()
      if (!val || /^(null|unknown|n\/a|closed - unknown)$/i.test(val)) continue
      lines.push(`${label}: ${val}`)
    }
    return lines.length ? lines : null
  }
  return null
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

  // Include hero_image_url only from approved domains (Supabase Storage, GCS) AND
  // only when image moderation has not flagged/held it. A hero a moderator
  // rejected must never reach a vertical site — verticals render hero_image_url
  // directly and sit outside the portal's display gate, so this is the single
  // place that keeps a blocked image off all 10 downstream sites. 'clean',
  // 'pending', and absent (pre-migration / un-passed) all pass through unchanged.
  // See lib/moderation/imageModeration.js + migration 164.
  if (data.hero_image_url !== undefined) {
    const heroBlocked = data.image_moderation_status === 'flagged' || data.image_moderation_status === 'held'
    base.hero_image_url = (!heroBlocked && isApprovedImageSource(data.hero_image_url)) ? data.hero_image_url : null
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
        // sba `venues.opening_hours` is text[] (legacy schema) — convert the
        // day-map object to the per-day display array. See openingHoursToTextArray.
        opening_hours: openingHoursToTextArray(data.opening_hours),
        type: validateCategory('sba', data.category),
        listing_tier: 'basic',
        status: 'published',
      }

    case 'collection':
      return {
        ...base,
        // collection `venues.opening_hours` is text[] (legacy schema, shared
        // with sba) — convert the day-map object. See openingHoursToTextArray.
        opening_hours: openingHoursToTextArray(data.opening_hours),
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

    case 'way':
      // Way Atlas operators table has its own column naming — don't spread
      // base (which includes portal-centric columns like `address`).
      // hero_image_url intentionally null: typographic card by default,
      // operator uploads on claim.
      return {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        state: data.state || null,
        phone: data.phone || null,
        departure_point_lat: data.lat || null,
        departure_point_lng: data.lng || null,
        departure_point_name: data.departure_point_name || data.address || data.suburb || null,
        website_url: data.website || null,
        hero_image_url: null,
        primary_type: validateCategory('way', data.category),
        operator_type: data.operator_type || 'independent',
        operator_legal_name: data.operator_legal_name || null,
        aboriginal_community: data.aboriginal_community || null,
        secondary_types: data.secondary_types || [],
        accreditations: data.accreditations || [],
        primary_region_id: data.primary_region_id || null,
        operating_region_ids: data.operating_region_ids || [],
        established_year: data.established_year || null,
        presence_type: mapPortalPresenceTypeToWay(data.presence_type),
        operating_season_months: data.operating_season_months || [],
        multiple_departure_points: data.multiple_departure_points ?? false,
        visitable: data.visitable ?? true,
        status: 'published',
        booking_url: data.booking_url || null,
        contact_email: data.contact_email || null,
        contact_name: data.contact_name || null,
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
 * Unpublish a single row in a vertical's own DB.
 *
 * Why this exists: the source→master sync (lib/sync/syncVertical.js, every 6h
 * per vercel.json) re-derives master `listings.status` from each source row's
 * publish state via normalizeStatus(). So hiding a listing in the master DB
 * alone is NOT durable — if its source row is still published, the next sync
 * flips the master row back to 'active'. Admin actions that retire a master
 * listing (e.g. a duplicate merge in /admin/duplicates) must therefore also
 * unpublish the source row, or the change silently reverts within 6 hours.
 *
 * Surgical: this touches ONLY the publish-state column(s). Unlike
 * updateInVertical it does not re-push name/slug/category/etc., so it can never
 * clobber source data — important when retiring a row we're about to forget.
 *
 * Robust to schema shape: normalizeStatus() treats a row as active when EITHER
 * status='published' OR published=true, so a table carrying both columns needs
 * both neutralised. We introspect the actual row and clear whichever exist
 * (status→'draft', published→false). 'draft' (not 'archived') because the
 * source venues_status_check only accepts 'published'/'draft'.
 *
 * Best-effort and non-throwing: returns a result object the caller can surface
 * as a warning rather than failing the whole operation.
 *
 * @param {string} vertical            - 'sba' | 'fine_grounds' | 'table' | ...
 * @param {string|number|null} sourceId - master listings.source_id
 * @returns {Promise<{ ok: boolean, table?: string, patch?: object, skipped?: string, error?: string }>}
 */
export async function unpublishInVertical(vertical, sourceId) {
  if (sourceId == null || String(sourceId).startsWith('candidate-')) {
    // Portal-native or not-yet-pushed listing: no source row exists, so the
    // master-side hide is already durable. Nothing to do.
    return { ok: false, skipped: 'no_source_row' }
  }

  const config = VERTICAL_CONFIG[vertical]
  if (!config || !config.url) return { ok: false, skipped: 'no_config' }

  try {
    const client = getVerticalClient(vertical)

    // Fine Grounds keeps roasters + cafes in separate tables; the source_id
    // prefix selects the table and the suffix is the real row id.
    let table = config.table
    let rowId = sourceId
    if (vertical === 'fine_grounds') {
      const s = String(sourceId)
      if (s.startsWith('roaster_'))   { table = 'roasters'; rowId = s.slice('roaster_'.length) }
      else if (s.startsWith('cafe_')) { table = 'cafes';    rowId = s.slice('cafe_'.length) }
      else return { ok: false, skipped: 'unrecognised_source_id' }
    }
    if (!table) return { ok: false, skipped: 'no_table' }

    // Read the row to discover which publish column(s) it actually has and to
    // confirm it exists before we claim success.
    const { data: existing, error: readErr } = await client
      .from(table).select('*').eq('id', rowId).maybeSingle()
    if (readErr)   return { ok: false, table, error: readErr.message }
    if (!existing) return { ok: false, table, skipped: 'source_row_missing' }

    const patch = {}
    if ('status' in existing)    patch.status = 'draft'
    if ('published' in existing) patch.published = false
    if (Object.keys(patch).length === 0) {
      return { ok: false, table, skipped: 'no_publish_column' }
    }

    const { error: updErr } = await client.from(table).update(patch).eq('id', rowId)
    if (updErr) return { ok: false, table, error: updErr.message }
    return { ok: true, table, patch }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Re-publish a single row in a vertical's own DB — the exact inverse of
 * unpublishInVertical().
 *
 * Why this exists: once an admin action unpublishes a source row (dedupe merge,
 * gate-review Hide/Delete), simply flipping the master listing back to 'active'
 * is NOT durable — the next 6-hourly source→master sync re-derives status from
 * the still-unpublished source row and knocks it straight back to 'inactive'.
 * So a "restore" must also re-publish the source row.
 *
 * Surgical and schema-robust in the same way as unpublishInVertical: it reads
 * the row, sets whichever publish column(s) exist (status→'published',
 * published→true), and touches nothing else. Best-effort and non-throwing.
 *
 * @param {string} vertical            - 'sba' | 'fine_grounds' | 'table' | ...
 * @param {string|number|null} sourceId - master listings.source_id
 * @returns {Promise<{ ok: boolean, table?: string, patch?: object, skipped?: string, error?: string }>}
 */
export async function republishInVertical(vertical, sourceId) {
  if (sourceId == null || String(sourceId).startsWith('candidate-')) {
    // Portal-native or not-yet-pushed listing: no source row to re-publish, so
    // the master-side 'active' is already the whole story.
    return { ok: false, skipped: 'no_source_row' }
  }

  const config = VERTICAL_CONFIG[vertical]
  if (!config || !config.url) return { ok: false, skipped: 'no_config' }

  try {
    const client = getVerticalClient(vertical)

    // Fine Grounds keeps roasters + cafes in separate tables; the source_id
    // prefix selects the table and the suffix is the real row id.
    let table = config.table
    let rowId = sourceId
    if (vertical === 'fine_grounds') {
      const s = String(sourceId)
      if (s.startsWith('roaster_'))   { table = 'roasters'; rowId = s.slice('roaster_'.length) }
      else if (s.startsWith('cafe_')) { table = 'cafes';    rowId = s.slice('cafe_'.length) }
      else return { ok: false, skipped: 'unrecognised_source_id' }
    }
    if (!table) return { ok: false, skipped: 'no_table' }

    const { data: existing, error: readErr } = await client
      .from(table).select('*').eq('id', rowId).maybeSingle()
    if (readErr)   return { ok: false, table, error: readErr.message }
    if (!existing) return { ok: false, table, skipped: 'source_row_missing' }

    const patch = {}
    if ('status' in existing)    patch.status = 'published'
    if ('published' in existing) patch.published = true
    if (Object.keys(patch).length === 0) {
      return { ok: false, table, skipped: 'no_publish_column' }
    }

    const { error: updErr } = await client.from(table).update(patch).eq('id', rowId)
    if (updErr) return { ok: false, table, error: updErr.message }
    return { ok: true, table, patch }
  } catch (err) {
    return { ok: false, error: err.message }
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
      image_moderation_status: listing.image_moderation_status, // gate hero sync (see mapToVerticalSchema)
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
      way: { table: 'way_meta', key: 'primary_type' },
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

    // Way meta enrichment: the outbound mapper needs operator_type,
    // accreditations, secondary_types, etc. which live in way_meta,
    // not on the base listings row. Merge them into data so the
    // case 'way': branch in mapToVerticalSchema can consume them.
    if (vertical === 'way') {
      try {
        const { data: wayMeta } = await sb
          .from('way_meta')
          .select('*')
          .eq('listing_id', listingId)
          .maybeSingle()
        if (wayMeta) {
          Object.assign(data, {
            operator_type: wayMeta.operator_type,
            operator_legal_name: wayMeta.operator_legal_name,
            aboriginal_community: wayMeta.aboriginal_community,
            secondary_types: wayMeta.secondary_types,
            accreditations: wayMeta.accreditations,
            primary_region_id: wayMeta.primary_region_id,
            operating_region_ids: wayMeta.operating_region_ids,
            departure_point_name: wayMeta.departure_point_name,
            established_year: wayMeta.established_year,
            operating_season_months: wayMeta.operating_season_months,
            multiple_departure_points: wayMeta.multiple_departure_points,
            booking_url: wayMeta.booking_url,
            contact_email: wayMeta.contact_email,
            contact_name: wayMeta.contact_name,
            // Use way_meta.presence_type as the authoritative value
            // (Way-specific like 'year_round', 'charter_only') — overrides
            // the portal-normalised value from listings.presence_type.
            presence_type: wayMeta.presence_type || data.presence_type,
          })
        }
      } catch { /* way_meta enrichment failure is non-blocking */ }
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
