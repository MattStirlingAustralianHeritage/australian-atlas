// ============================================================
// Field maps: source vertical schemas → master DB listings schema
// Each map function takes a source row and returns a master listing object
//
// IMPORTANT: description is intentionally NOT mapped inbound.
// Per CLAUDE.md Architecture Rule 4, listing descriptions are
// portal-authoritative (editorially rewritten). The inbound sync
// must not overwrite them with stale vertical copies.
// ============================================================

// Normalize status: verticals use 'published'/'draft'/boolean → master uses 'active'/'inactive'
function normalizeStatus(row) {
  if (row.status === 'published' || row.published === true) return 'active'
  if (row.status === 'draft' || row.published === false) return 'inactive'
  if (row.status === 'archived') return 'inactive'
  if (row.status === 'active') return 'active'
  return 'pending'
}

// Normalize claimed: verticals use is_claimed, claimed, or owner_id
function normalizeClaimed(row) {
  if (row.is_claimed !== undefined) return !!row.is_claimed
  if (row.claimed !== undefined) return !!row.claimed
  if (row.owner_id) return true
  return false
}

// Normalize featured — only for verticals that use a simple boolean flag.
// SBA/Collection use listing_tier instead (handled in their map functions).
// NOTE: featured_on_homepage is NOT a premium indicator — it's an opt-in
// for the vertical's own homepage carousel and defaults to true.
function normalizeFeatured(row) {
  return !!(row.is_featured)
}

// Premium tier check for verticals using listing_tier (SBA, Collection, Craft)
function isPaidTier(row) {
  return ['standard', 'premium'].includes(row.listing_tier)
}

// Build sub_types array from a single category value.
// sub_type (scalar) is kept for backward compatibility; sub_types (array) is the
// canonical source. The DB trigger on listings syncs sub_types[1] → sub_type.
function toSubTypes(value) {
  return value ? [value] : []
}

// Normalize visitable + presence_type from source
function normalizeVisitable(row) {
  return row.visitable ?? true
}

function normalizePresenceType(row) {
  const valid = ['permanent', 'by_appointment', 'markets', 'online', 'seasonal', 'mobile']
  return valid.includes(row.presence_type) ? row.presence_type : 'permanent'
}

// Normalize opening_hours JSONB from source
// Source formats vary: some use opening_hours, some cellar_door_hours
// Returns null if no meaningful hours data exists
function normalizeHours(hours) {
  if (!hours || typeof hours !== 'object') return null
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const hasAnyData = days.some(d => hours[d] && hours[d] !== '')
  return hasAnyData ? hours : null
}

// ---- SBA ----
export function mapSbaListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: isPaidTier(row),
    is_market: false,
    sub_type: row.type || null,
    sub_types: toSubTypes(row.type),
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapSbaMeta(row) {
  const features = row.features || []
  return {
    producer_type: row.type,
    subtype: row.subtype,
    has_tasting_room: features.includes('Tastings') || false,
    has_cellar_door: row.type === 'cellar_door' || (row.cellar_door_hours != null),
    has_tours: features.includes('Tours'),
    has_online_store: features.includes('Online Shop'),
    has_restaurant: features.includes('Restaurant'),
    has_accommodation: features.includes('Accommodation'),
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
    opening_hours: normalizeHours(row.opening_hours || row.cellar_door_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: (row.features || []).includes('By Appointment') || row.by_appointment || false,
  }
}

// ---- Collection ----
export function mapCollectionListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: isPaidTier(row),
    is_market: false,
    sub_type: row.type || null,
    sub_types: toSubTypes(row.type),
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapCollectionMeta(row) {
  return {
    institution_type: row.type,
    subtype: row.subtype,
    is_free_admission: (row.features || []).includes('free_entry'),
    is_accessible: (row.features || []).includes('accessible'),
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
    hours_notes: row.hours_notes || null,
    by_appointment: (row.features || []).includes('By Appointment') || row.by_appointment || false,
  }
}

// ---- Craft ----
export function mapCraftListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: isPaidTier(row),
    is_market: false,
    sub_type: row.category || null,
    sub_types: toSubTypes(row.category),
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapCraftMeta(row) {
  return {
    discipline: row.type,
    subcategories: row.subcategories,
    materials: row.materials,
    practice_description: row.practice_description,
    is_open_to_public: (row.features || []).includes('Studio') || (row.features || []).includes('Gallery'),
    by_appointment: (row.features || []).includes('By Appointment'),
    hours_notes: row.hours_notes || null,
    has_online_store: (row.features || []).includes('Online Shop') || (row.features || []).includes('Retail Shop'),
    commission_available: row.commission_available,
    experiences_and_classes: row.experiences_and_classes,
    offers_classes: row.offers_classes || false,
    classes: row.classes || null,
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
  }
}

// ---- Fine Grounds (Roasters) ----
export function mapFineGroundsRoasterListing(row) {
  return {
    source_id: `roaster_${row.id}`,
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: normalizeFeatured(row),
    is_market: false,
    sub_type: 'roaster',
    sub_types: ['roaster'],
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapFineGroundsRoasterMeta(row) {
  return {
    entity_type: 'roaster',
    is_roaster: true,
    is_cafe: false,
    beans_origin: row.origin_focus,
    roast_style: row.roast_style,
    has_tasting_room: row.has_tasting_room,
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
    opening_hours: normalizeHours(row.opening_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}

// ---- Fine Grounds (Cafes) ----
export function mapFineGroundsCafeListing(row) {
  return {
    source_id: `cafe_${row.id}`,
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: normalizeFeatured(row),
    is_market: false,
    sub_type: 'cafe',
    sub_types: ['cafe'],
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapFineGroundsCafeMeta(row) {
  return {
    entity_type: 'cafe',
    is_roaster: false,
    is_cafe: true,
    brewing_methods: row.brew_methods,
    food_offering: row.food_offering,
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
    opening_hours: normalizeHours(row.opening_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}

// ---- Rest ----
export function mapRestListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.sub_region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: normalizeFeatured(row),
    is_market: false,
    sub_type: row.type || null,
    sub_types: toSubTypes(row.type),
    status: normalizeStatus(row),
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapRestMeta(row) {
  return {
    accommodation_type: row.type,
    tagline: row.tagline,
    setting: row.setting,
    min_price_per_night: row.min_price_per_night,
    max_price_per_night: row.max_price_per_night,
    guest_capacity: row.guest_capacity,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    amenities: row.amenities,
    features: row.features,
    listing_tier: row.listing_tier,
    google_rating: row.google_rating,
    google_rating_count: row.google_rating_count,
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}

// ---- Field ----
export function mapFieldListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.region,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    website: null,
    phone: null,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: false,  // Field Atlas has no commercial layer
    is_featured: normalizeFeatured(row),
    is_market: false,
    sub_type: row.place_type || null,
    sub_types: toSubTypes(row.place_type),
    status: row.published ? 'active' : 'inactive',
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapFieldMeta(row) {
  return {
    feature_type: row.place_type,
    is_entry_free: row.entry_fee === 'free',
    entry_fee: row.entry_fee,
    dogs_allowed: row.dog_friendly,
    family_friendly: row.family_friendly,
    swimming: row.swimming,
    difficulty: row.difficulty,
    walk_distance_km: row.walk_distance_km,
    best_seasons: row.best_seasons,
    best_time_of_day: row.best_time_of_day,
    park_name: row.park_name,
    nearest_town: row.nearest_town,
    what_to_bring: row.what_to_bring,
    know_before_you_go: row.know_before_you_go,
    trail_distance_km: row.trail_distance_km || null,
    trail_duration_minutes: row.trail_duration_minutes || null,
    trail_difficulty: row.trail_difficulty || null,
    trail_surface: row.trail_surface || null,
    trail_is_loop: row.trail_is_loop ?? null,
    trail_elevation_gain_m: row.trail_elevation_gain_m || null,
    trail_bike_type: row.trail_bike_type || null,
  }
}

// ---- Corner ----
export function mapCornerListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.suburb || row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    website: row.website_url,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: normalizeFeatured(row),
    is_market: false,
    sub_type: row.category || null,
    sub_types: toSubTypes(row.category),
    status: row.published ? 'active' : 'inactive',
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapCornerMeta(row) {
  return {
    shop_type: row.category,
    categories: row.categories,
    story: row.story,
    known_for: row.known_for,
    owner_name: row.owner_name,
    year_established: row.year_established,
    has_online_store: !!row.online_shop_url,
    parking: row.parking,
    accessibility: row.accessibility,
    opening_hours: normalizeHours(row.opening_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}

// ---- Found ----
export function mapFoundListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.suburb || row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    website: row.website,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: !!row.owner_id,
    is_featured: normalizeFeatured(row),
    is_market: row.category === 'market',
    sub_type: row.category || null,
    sub_types: toSubTypes(row.category),
    status: row.published ? 'active' : 'inactive',
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapFoundMeta(row) {
  return {
    shop_type: row.category,
    categories: row.categories,
    story: row.story,
    known_for: row.known_for,
    price_range: row.price_range,
    market_schedule: row.market_schedule,
    op_shop_chain: row.op_shop_chain,
    opening_hours: normalizeHours(row.opening_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}

// Way Atlas extends presence_type with values that don't fit the portal
// listings.presence_type CHECK constraint (see migration 087). The portal
// constraint accepts: permanent, by_appointment, markets, online, seasonal,
// mobile. Way's extensions — year_round, weather_dependent, charter_only,
// tide_dependent — are preserved in way_meta.presence_type for vertical-
// specific filtering. The portal column gets the closest categorical match.
function mapWayPresenceTypeToPortal(presence_type) {
  switch (presence_type) {
    case 'year_round':         return 'permanent'
    case 'weather_dependent':  return 'permanent'  // Operates daily, schedule may slip — closest portal value.
    case 'charter_only':       return 'by_appointment'
    case 'tide_dependent':     return 'permanent'  // Operates daily, departure window shifts — closest portal value.
    case 'seasonal':           return 'seasonal'
    case 'permanent':
    case 'by_appointment':
    case 'markets':
    case 'online':
    case 'mobile':
      return presence_type
    default:                   return 'permanent'
  }
}

// ---- Way ----
// Way Atlas's primary entity is the OPERATOR. The Way Supabase project's
// `operators` table is the source. One portal listings row per operator —
// `experiences` is a vertical-side display structure that doesn't sync up.
//
// Mapping decisions (per architectural sign-off, May 2026):
//   • lat/lng              ← departure_point_lat/lng (drives spatial trigger,
//                            so region_computed_id resolves from departure)
//   • address              ← departure_point_name (e.g. "Lismore",
//                            "Esperance Airport") — humans read this; the
//                            map renders the pin from lat/lng
//   • sub_type, sub_types  ← primary_type (one of the 17 Way primary types)
//   • is_claimed           ← derived from claim_status ∈ {claimed, paid}
//   • presence_type        ← the operator's Way-specific presence value
//                            (year_round / weather_dependent / etc.) where
//                            it maps cleanly; otherwise normalized to 'permanent'
//   • region               ← NEVER set from sync (regions.md §3) — the spatial
//                            trigger writes region_computed_id from lat/lng.
//                            operating_region_ids is exposed via way_meta and
//                            queried by the regional pages directly.
export function mapWayListing(row) {
  const claimedStatuses = new Set(['claimed', 'paid'])
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: null,                                  // Never write — spatial trigger handles it.
    state: row.state,
    lat: row.departure_point_lat,
    lng: row.departure_point_lng,
    website: row.website_url,
    phone: row.phone,
    address: row.departure_point_name,
    hero_image_url: row.hero_image_url,
    is_claimed: claimedStatuses.has(row.claim_status),
    is_featured: false,                            // Way has no listing_tier — see Spec §IX (one price, no tiers).
    is_market: false,
    sub_type: row.primary_type || null,
    sub_types: toSubTypes(row.primary_type),
    status: row.status === 'published' ? 'active'
          : row.status === 'archived'  ? 'inactive'
          : 'inactive',                            // 'draft' → inactive on portal.
    visitable: normalizeVisitable(row),
    presence_type: mapWayPresenceTypeToPortal(row.presence_type),
    market_appearances: null,
  }
}

export function mapWayMeta(row) {
  return {
    primary_type: row.primary_type,
    secondary_types: row.secondary_types || [],
    operator_type: row.operator_type,
    operator_legal_name: row.operator_legal_name,
    aboriginal_community: row.aboriginal_community,
    presence_type: row.presence_type,
    operating_season_months: row.operating_season_months,
    primary_region_id: row.primary_region_id,
    operating_region_ids: row.operating_region_ids || [],
    departure_point_name: row.departure_point_name,
    multiple_departure_points: !!row.multiple_departure_points,
    contact_email: row.contact_email,
    contact_name: row.contact_name,
    booking_url: row.booking_url,
    established_year: row.established_year,
    accreditations: row.accreditations || [],
    claim_status: row.claim_status || 'unclaimed',
    // cultural_authority_* fields are NOT mapped from sync — they live on the
    // portal way_meta row and are written exclusively by the cultural
    // authority review queue resolution trigger (see migration 115). The Way
    // project's operators table doesn't carry verification state; that's
    // editorial infrastructure, not source-of-truth data.
  }
}

// ---- Table ----
export function mapTableListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,

    region: row.suburb || row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    website: row.website_url,
    phone: row.phone,
    address: row.address,
    hero_image_url: row.hero_image_url,
    is_claimed: normalizeClaimed(row),
    is_featured: normalizeFeatured(row),
    is_market: row.category === 'market',
    sub_type: row.category || null,
    sub_types: toSubTypes(row.category),
    status: row.published ? 'active' : 'inactive',
    visitable: normalizeVisitable(row),
    presence_type: normalizePresenceType(row),
    market_appearances: row.market_appearances || null,
  }
}

export function mapTableMeta(row) {
  return {
    food_type: row.category,
    cuisine: row.cuisine,
    cuisine_tags: row.cuisine_tags,
    categories: row.categories,
    story: row.story,
    known_for: row.known_for,
    owner_name: row.owner_name,
    year_established: row.year_established,
    is_seasonal: row.seasonal_availability != null,
    seasonal_availability: row.seasonal_availability,
    market_schedule: row.market_schedule,
    pick_your_own: row.pick_your_own,
    cafe_on_site: row.cafe_on_site,
    cooking_classes: row.cooking_classes,
    wholesale_available: row.wholesale_available,
    delivery_available: row.delivery_available,
    has_online_store: !!row.online_shop_url,
    parking: row.parking,
    accessibility: row.accessibility,
    opening_hours: normalizeHours(row.opening_hours),
    hours_notes: row.hours_notes || null,
    by_appointment: row.by_appointment || false,
  }
}
