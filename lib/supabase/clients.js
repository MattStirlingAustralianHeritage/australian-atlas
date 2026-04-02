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
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
    typeFilter: ['archive', 'cultural_centre', 'gallery', 'botanical_garden', 'heritage_site', 'museum'],
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
    listingPaths: { roasters: '/roaster', cafes: '/cafe' },
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
    listingPath: '/shop',
  },
  found: {
    url: process.env.FOUND_SUPABASE_URL,
    serviceKey: process.env.FOUND_SUPABASE_SERVICE_KEY,
    table: 'shops',
    baseUrl: 'https://foundatlas.com.au',
    listingPath: '/shop',
  },
  table: {
    url: process.env.TABLE_SUPABASE_URL,
    serviceKey: process.env.TABLE_SUPABASE_SERVICE_KEY,
    table: 'listings',
    baseUrl: 'https://tableatlas.com.au',
    listingPath: '/listing',
  },
}

// CMS connection
export function getCmsClient() {
  return createClient(
    process.env.CMS_SUPABASE_URL,
    process.env.CMS_SUPABASE_SERVICE_KEY
  )
}
