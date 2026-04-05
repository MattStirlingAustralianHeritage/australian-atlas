// ============================================================
// Field maps: source vertical schemas → master DB listings schema
// Each map function takes a source row and returns a master listing object
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

// Normalize featured
function normalizeFeatured(row) {
  return !!(row.featured || row.featured_on_homepage || row.is_featured)
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
    description: row.description,
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
    status: normalizeStatus(row),
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
  }
}

// ---- Collection ----
export function mapCollectionListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: normalizeStatus(row),
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
  }
}

// ---- Craft ----
export function mapCraftListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: normalizeStatus(row),
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
    has_online_store: (row.features || []).includes('Online Shop') || (row.features || []).includes('Retail Shop'),
    commission_available: row.commission_available,
    experiences_and_classes: row.experiences_and_classes,
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
    description: row.description,
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
    status: normalizeStatus(row),
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
  }
}

// ---- Fine Grounds (Cafes) ----
export function mapFineGroundsCafeListing(row) {
  return {
    source_id: `cafe_${row.id}`,
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: normalizeStatus(row),
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
  }
}

// ---- Rest ----
export function mapRestListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: normalizeStatus(row),
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
  }
}

// ---- Field ----
export function mapFieldListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: row.published ? 'active' : 'inactive',
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
  }
}

// ---- Corner ----
export function mapCornerListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: row.published ? 'active' : 'inactive',
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
  }
}

// ---- Found ----
export function mapFoundListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: row.published ? 'active' : 'inactive',
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
  }
}

// ---- Table ----
export function mapTableListing(row) {
  return {
    source_id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
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
    status: row.published ? 'active' : 'inactive',
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
  }
}
