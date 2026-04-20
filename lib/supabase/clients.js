import { createClient } from '@supabase/supabase-js'

// Portal master DB — public client
let browserClient = null
export function getSupabase() {
  if (browserClient) return browserClient
  browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  return browserClient
}

// Portal master DB — service role (server-side only)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) } }
  )
}

// Vertical source DB client factory (server-side only, for sync)
export function getVerticalClient(vertical) {
  const config = VERTICAL_CONFIG[vertical]
  if (!config) throw new Error(`Unknown vertical: ${vertical}`)
  return createClient(config.url, config.serviceKey)
}

// Vertical connection config — populated from env vars
export const VERTICAL_CONFIG = {
  sba: {
    url: process.env.SBA_SUPABASE_URL,
    serviceKey: process.env.SBA_SUPABASE_SERVICE_KEY,
    table: 'venues',
    typeFilter: ['winery', 'distillery', 'brewery', 'cidery', 'non_alcoholic', 'meadery', 'sake_brewery'],
    baseUrl: 'https://smallbatchatlas.com.au',
    listingPath: '/venue',
  },
  collection: {
    url: process.env.COLLECTION_SUPABASE_URL,
    serviceKey: process.env.COLLECTION_SUPABASE_SERVICE_KEY,
    table: 'venues',
    typeFilter: ['archive', 'cultural_centre', 'gallery', 'botanical_garden', 'heritage_site', 'museum', 'sculpture_park'],
    baseUrl: 'https://collectionatlas.com.au',
    listingPath: '/venue',
  },
  craft: {
    url: process.env.CRAFT_SUPABASE_URL,
    serviceKey: process.env.CRAFT_SUPABASE_SERVICE_KEY,
    table: 'venues',
    baseUrl: 'https://craftatlas.com.au',
    listingPath: '/venue',
  },
  fine_grounds: {
    url: process.env.FINE_GROUNDS_SUPABASE_URL,
    serviceKey: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY,
    // Fine Grounds has TWO tables: roasters + cafes — handled specially
    tables: ['roasters', 'cafes'],
    baseUrl: 'https://finegroundsatlas.com.au',
    listingPaths: { roasters: '/roasters', cafes: '/cafes' },
  },
  rest: {
    url: process.env.REST_SUPABASE_URL,
    serviceKey: process.env.REST_SUPABASE_SERVICE_KEY,
    table: 'properties',
    baseUrl: 'https://restatlas.com.au',
    listingPath: '/stay',
  },
  field: {
    url: process.env.FIELD_SUPABASE_URL,
    serviceKey: process.env.FIELD_SUPABASE_SERVICE_KEY,
    table: 'places',
    baseUrl: 'https://fieldatlas.com.au',
    listingPath: '/places',
  },
  corner: {
    url: process.env.CORNER_SUPABASE_URL,
    serviceKey: process.env.CORNER_SUPABASE_SERVICE_KEY,
    table: 'shops',
    baseUrl: 'https://corneratlas.com.au',
    listingPath: '/shops',
  },
  found: {
    url: process.env.FOUND_SUPABASE_URL,
    serviceKey: process.env.FOUND_SUPABASE_SERVICE_KEY,
    table: 'shops',
    baseUrl: 'https://foundatlas.com.au',
    listingPath: '/shops',
  },
  table: {
    url: process.env.TABLE_SUPABASE_URL,
    serviceKey: process.env.TABLE_SUPABASE_SERVICE_KEY,
    table: 'listings',
    baseUrl: 'https://tableatlas.com.au',
    listingPath: '/listings',
  },
}

// ─── Per-vertical claim field config ─────────────────────
// Maps each vertical to the correct field name and type for marking
// a venue/listing as claimed on the vertical's own database.
export const VERTICAL_CLAIM_FIELD = {
  sba:          { claimField: 'is_claimed', claimType: 'boolean' },
  collection:   { claimField: 'is_claimed', claimType: 'boolean' },
  craft:        { claimField: 'is_claimed', claimType: 'boolean' },
  fine_grounds: { claimField: 'is_claimed', claimType: 'boolean' },
  rest:         { claimField: 'is_claimed', claimType: 'boolean', secondaryField: 'claimed_by' },
  corner:       { claimField: 'claimed',    claimType: 'boolean' },
  found:        { claimField: 'owner_id',   claimType: 'uuid' },
  table:        { claimField: 'claimed',    claimType: 'boolean' },
  field:        { claimField: 'is_claimed', claimType: 'boolean' },
}

// Returns the claim field config for a vertical, or null if unknown.
export function getClaimFieldConfig(vertical) {
  return VERTICAL_CLAIM_FIELD[vertical] || null
}

// Builds the correct update payload for marking a venue as claimed.
// `userId` is required for uuid-type fields (Found Atlas) and
// secondary fields (Rest Atlas claimed_by).
export function buildClaimPayload(vertical, userId) {
  const config = VERTICAL_CLAIM_FIELD[vertical]
  if (!config || config.claimable === false) return null

  const payload = {}

  if (config.claimType === 'uuid') {
    payload[config.claimField] = userId || null
  } else {
    payload[config.claimField] = true
  }

  if (config.secondaryField && userId) {
    payload[config.secondaryField] = userId
  }

  return payload
}

// ─── Per-vertical claims table mapping ───────────────────
// Maps each vertical to the correct claims table name and column
// names for reading/writing claim records on the vertical's DB.
export const VERTICAL_CLAIMS_TABLE = {
  corner: { table: 'shop_claims',    entityKey: 'shop_id',    nameKey: 'claimant_name', emailKey: 'claimant_email' },
  found:  { table: 'shop_claims',    entityKey: 'shop_id',    nameKey: 'claimant_name', emailKey: 'claimant_email' },
  table:  { table: 'listing_claims', entityKey: 'listing_id', nameKey: 'name',          emailKey: 'email' },
}
const DEFAULT_CLAIMS_TABLE = { table: 'claims', entityKey: 'venue_id', nameKey: 'contact_name', emailKey: 'contact_email' }

export function getVerticalClaimsTable(vertical) {
  return VERTICAL_CLAIMS_TABLE[vertical] || DEFAULT_CLAIMS_TABLE
}

// CMS connection
export function getCmsClient() {
  return createClient(
    process.env.CMS_SUPABASE_URL,
    process.env.CMS_SUPABASE_SERVICE_KEY
  )
}
