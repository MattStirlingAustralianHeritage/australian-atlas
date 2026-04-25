import { cache } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { listingJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'
import { checkAdmin } from '@/lib/admin-auth'
import { isApprovedImageSource } from '@/lib/image-utils'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import VerticalBadge from '@/components/VerticalBadge'
import ListingCard, { TypographicCard, VERTICAL_TOKENS } from '@/components/ListingCard'
import ListingMap from '@/components/ListingMap'
import InlineListingEditor from '@/components/InlineListingEditor'
import StartTrailButton from '@/components/StartTrailButton'
import ReportIssueButton from '@/components/ReportIssueButton'
import OpeningHours from '@/components/OpeningHours'
import PlaceMemories from '@/components/PlaceMemories'
import SameSpirit from '@/components/SameSpirit'
import { RelatedCollections } from '@/components/RelatedContent'
import VerificationBadge from '@/components/VerificationBadge'

export const revalidate = 3600

// ── Vertical category labels ──────────────────────────────────

const VERTICAL_CATEGORY_LABELS = {
  sba: 'Artisan Producer',
  collection: 'Cultural Institution',
  craft: 'Maker & Studio',
  fine_grounds: 'Specialty Coffee',
  rest: 'Boutique Stay',
  field: 'Natural Place',
  corner: 'Independent Shop',
  found: 'Vintage & Secondhand',
  table: 'Independent Dining',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

// ── Data fetching ─────────────────────────────────────────────

// Maps vertical → its meta table + the specific category key
const META_CATEGORY_LOOKUP = {
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

// Subcategory display labels (matches ListingCard.CATEGORY_LABELS)
const SUBCATEGORY_LABELS = {
  winery: 'Winery', distillery: 'Distillery', brewery: 'Brewery',
  cidery: 'Cidery', non_alcoholic: 'Non-Alcoholic', meadery: 'Meadery',
  museum: 'Museum', gallery: 'Gallery', heritage_site: 'Heritage Site',
  cultural_centre: 'Cultural Centre', botanical_garden: 'Botanical Garden',
  ceramics_clay: 'Ceramics & Clay', visual_art: 'Visual Art',
  jewellery_metalwork: 'Jewellery & Metalwork', textile_fibre: 'Textile & Fibre',
  wood_furniture: 'Wood & Furniture', glass: 'Glass', printmaking: 'Printmaking',
  roaster: 'Roaster', cafe: 'Cafe',
  boutique_hotel: 'Boutique Hotel', guesthouse: 'Guesthouse', bnb: 'B&B',
  farm_stay: 'Farm Stay', glamping: 'Glamping', cottage: 'Cottage',
  self_contained: 'Self-Contained',
  swimming_hole: 'Swimming Hole', waterfall: 'Waterfall', lookout: 'Lookout',
  gorge: 'Gorge', coastal_walk: 'Coastal Walk', hot_spring: 'Hot Spring',
  cave: 'Cave', national_park: 'National Park', bush_walk: 'Bush Walk',
  wildlife_zoo: 'Wildlife & Zoo', botanic_garden: 'Botanic Garden', nature_reserve: 'Nature Reserve',
  bookshop: 'Bookshop', record_store: 'Record Store', homewares: 'Homewares',
  clothing: 'Clothing', general_store: 'General Store', stationery: 'Stationery',
  vintage_clothing: 'Vintage Clothing', vintage_furniture: 'Vintage Furniture',
  vintage_store: 'Vintage Store', antiques: 'Antiques', op_shop: 'Op Shop',
  books_ephemera: 'Books & Ephemera', art_objects: 'Art Objects', market: 'Market',
  restaurant: 'Restaurant', bakery: 'Bakery', farm_gate: 'Farm Gate',
  artisan_producer: 'Artisan Producer', specialty_retail: 'Specialty Retail',
  destination: 'Destination', providore: 'Providore',
}

function formatSubcategory(value) {
  if (!value) return null
  return SUBCATEGORY_LABELS[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}


const getListing = cache(async function getListing(slug) {
  const sb = getSupabaseAdmin()
  // slug is NOT unique across verticals — use limit(1) instead of .single()
  // to avoid PGRST116 if two verticals share a slug
  const { data, error } = await sb
    .from('listings')
    .select(`id, vertical, name, slug, description, region, state, suburb, lat, lng, website, phone, address, hero_image_url, is_featured, is_claimed, editors_pick, status, hours, cluster_id, verified, sub_type, sub_types, ${LISTING_REGION_SELECT}`)
    .eq('slug', slug)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // If the query fails (e.g. missing column), retry without optional columns
  if (error && !data) {
    const retry = await sb
      .from('listings')
      .select(`id, vertical, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_featured, is_claimed, editors_pick, status, ${LISTING_REGION_SELECT}`)
      .eq('slug', slug)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (retry.error || !retry.data) return null
    return retry.data
  }

  if (!data) return null

  // Fetch vertical-specific subcategory from meta table.
  // This is the source of truth — sub_type on listings may be stale.
  const metaLookup = META_CATEGORY_LOOKUP[data.vertical]
  if (metaLookup) {
    try {
      const metaFields = metaLookup.table === 'craft_meta'
        ? `${metaLookup.key}, offers_classes, classes`
        : metaLookup.key
      const { data: metaRow } = await sb
        .from(metaLookup.table)
        .select(metaFields)
        .eq('listing_id', data.id)
        .maybeSingle()

      if (metaRow?.[metaLookup.key]) {
        data._subcategory = metaRow[metaLookup.key]
      }
      if (metaRow?.offers_classes) {
        data._offers_classes = true
        data._classes = metaRow.classes
      }
    } catch {
      // Meta fetch failure is non-blocking
    }
  }

  return data
})

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function getNearbyListings(listing, limit = 4) {
  if (!listing.lat || !listing.lng) return []
  const sb = getSupabaseAdmin()

  const PRIMARY_RADIUS_KM = 25
  const MAX_RADIUS_KM = 50

  const latDelta = MAX_RADIUS_KM / 111
  const lngDelta = MAX_RADIUS_KM / (111 * Math.cos(listing.lat * Math.PI / 180))

  const { data } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .neq('id', listing.id)
    .neq('vertical', listing.vertical)
    .or('address_on_request.eq.false,address_on_request.is.null')
    .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
    .gte('lat', listing.lat - latDelta)
    .lte('lat', listing.lat + latDelta)
    .gte('lng', listing.lng - lngDelta)
    .lte('lng', listing.lng + lngDelta)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(100)

  if (!data || data.length === 0) return []

  const withDist = data
    .map(l => ({ ...l, _dist: haversineKm(listing.lat, listing.lng, l.lat, l.lng) }))
    .filter(l => l._dist <= MAX_RADIUS_KM)
    .sort((a, b) => a._dist - b._dist)

  if (withDist.length === 0) return []

  let pool = withDist.filter(l => l._dist <= PRIMARY_RADIUS_KM)
  if (pool.length < limit) {
    pool = withDist
  }

  // Cap per-vertical to ensure cross-vertical diversity
  const result = []
  const verticalCounts = {}
  const usedIds = new Set()

  const addFromPool = (cap) => {
    for (const l of pool) {
      if (result.length >= limit) break
      if (usedIds.has(l.id)) continue
      const vc = verticalCounts[l.vertical] || 0
      if (cap != null && vc >= cap) continue
      verticalCounts[l.vertical] = vc + 1
      usedIds.add(l.id)
      result.push(l)
    }
  }

  addFromPool(1)
  addFromPool(2)
  addFromPool(null)

  return result
}

async function getRegionListings(listing, excludeIds = [], limit = 4) {
  // Decision 1: NULL effective region → no cross-region recommendations.
  // Decision 3: override-wins precedence via getListingRegion.
  const region = getListingRegion(listing)
  if (!region) return []
  const sb = getSupabaseAdmin()

  const { data } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .or(`region_computed_id.eq.${region.id},region_override_id.eq.${region.id}`)
    .not('id', 'in', `(${[listing.id, ...excludeIds].join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(limit)

  return data || []
}

async function getCrossVerticalListings(listing, excludeIds = [], limit = 3) {
  const region = getListingRegion(listing)
  if (!region || !listing.vertical) return []
  const sb = getSupabaseAdmin()

  const { data } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .or(`region_computed_id.eq.${region.id},region_override_id.eq.${region.id}`)
    .neq('vertical', listing.vertical)
    .not('id', 'in', `(${[listing.id, ...excludeIds].join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(limit)

  return data || []
}

/**
 * Cluster-aware recommendations: listings in the same semantic cluster
 * but from different verticals. Gives recommendations semantic coherence
 * without being repetitive.
 */
async function getClusterSiblings(listing, excludeIds = [], limit = 3) {
  if (!listing.cluster_id) return []
  const sb = getSupabaseAdmin()

  const { data } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .eq('cluster_id', listing.cluster_id)
    .neq('vertical', listing.vertical)
    .not('id', 'in', `(${[listing.id, ...excludeIds].join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(limit)

  return data || []
}

// ── Helper: clean website for display ─────────────────────────

function cleanWebsite(url) {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname + (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

// ── Metadata ──────────────────────────────────────────────────

export async function generateMetadata({ params }) {
  const { slug } = await params
  const listing = await getListing(slug)
  if (!listing) return { title: 'Place not found' }

  const metaSubcategory = formatSubcategory(listing._subcategory || listing.sub_type)
  const vertLabel = metaSubcategory || VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const region = getListingRegion(listing)
  const location = [region?.name, listing.state].filter(Boolean).join(', ')
  const title = location
    ? `${listing.name} — ${vertLabel} in ${location}`
    : `${listing.name} — ${vertLabel}`
  const description = listing.description
    ? listing.description.slice(0, 160)
    : `Discover ${listing.name}${location ? ` in ${location}` : ''} on Australian Atlas.`

  return {
    title: `${title} | Australian Atlas`,
    description,
    openGraph: {
      title,
      description,
      url: `https://australianatlas.com.au/place/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'website',
      images: [
        isApprovedImageSource(listing.hero_image_url)
          ? { url: listing.hero_image_url, width: 1200, height: 630, alt: listing.name }
          : { url: `https://australianatlas.com.au/og/${slug}`, width: 1200, height: 630, alt: listing.name },
      ],
    },
    alternates: {
      canonical: `https://australianatlas.com.au/place/${slug}`,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────

export default async function PlacePage({ params }) {
  const { slug } = await params
  const listing = await getListing(slug)
  if (!listing) notFound()

  // Server-side admin check — determines whether the inline editor renders at all.
  // Non-admin users never receive the editor component in the HTML.
  let isAdmin = false
  try {
    const cookieStore = await cookies()
    isAdmin = await checkAdmin(cookieStore)
  } catch { /* auth check failure = not admin */ }

  const nearby = await getNearbyListings(listing)
  const nearbyIds = nearby.map(n => n.id)

  // Region-based internal linking
  const regionListings = await getRegionListings(listing, nearbyIds)
  const regionIds = regionListings.map(r => r.id)
  const crossVerticalListings = await getCrossVerticalListings(listing, [...nearbyIds, ...regionIds])
  const allUsedIds = [...nearbyIds, ...regionIds, ...crossVerticalListings.map(c => c.id)]

  // Cluster-aware recommendations: same semantic cluster, different vertical
  const clusterSiblings = await getClusterSiblings(listing, allUsedIds)

  // Fetch approved place memories (max 5)
  const sbMem = getSupabaseAdmin()
  const { data: memories } = await sbMem
    .from('place_memories')
    .select('id, author_name, memory, created_at')
    .eq('listing_id', listing.id)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(5)

  // Effective region via the FK helper. Returns canonical { id, slug, name, state }
  // from regions table, or null when both region_computed_id and region_override_id
  // are NULL (the ~917 quarantine listings). Per Decision 1, no fallback to legacy text.
  const region = getListingRegion(listing)
  const cleanRegion = region?.name ?? null
  const regionData = region

  const vertLabel = getVerticalLabel(listing.vertical)
  const vertColor = VERTICAL_COLORS[listing.vertical] || '#5F8A7E'
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const specificSubcategory = formatSubcategory(listing._subcategory || listing.sub_type)
  const categoryLabel = specificSubcategory || VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const secondarySubcategories = (listing.sub_types || []).slice(1).map(formatSubcategory).filter(Boolean)
  const verticalUrl = getVerticalUrl(listing.vertical, listing.slug)
  const location = [cleanRegion, listing.state].filter(Boolean).join(', ')
  const hasCoords = listing.lat && listing.lng
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const websiteUrl = listing.website?.startsWith('http') ? listing.website : listing.website ? `https://${listing.website}` : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* ── Structured data ───────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingJsonLd(listing)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd([
          { name: 'Home', url: '/' },
          { name: categoryLabel, url: `/explore?vertical=${listing.vertical}` },
          { name: listing.name },
        ])) }}
      />

      {/* ── Hero ────────────────────────────────────────── */}
      {isApprovedImageSource(listing.hero_image_url) ? (
        <div className="w-full relative overflow-hidden" style={{ minHeight: '50vh' }}>
          <img
            src={listing.hero_image_url}
            alt={listing.name}
            loading="eager"
            className="w-full h-full object-cover absolute inset-0"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,26,23,0.6) 0%, rgba(28,26,23,0.15) 40%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-12" style={{ zIndex: 2 }}>
            <div className="max-w-4xl mx-auto">
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)', marginBottom: '12px',
              }}>
                {vertLabel} &middot; {categoryLabel}
              </p>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1,
                color: '#fff', margin: 0,
              }}>
                {listing.name}
              </h1>
              {location && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300,
                  color: 'rgba(255,255,255,0.7)', marginTop: '8px',
                }}>
                  {location}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full relative" style={{
          minHeight: '40vh',
          background: tokens.bg,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          textAlign: 'center', padding: '3rem 1.5rem',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
            backgroundSize: '16px 16px', opacity: 0.06, pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '700px' }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: tokens.text, opacity: 0.5, marginBottom: '16px',
            }}>
              {vertLabel} &middot; {categoryLabel}
            </p>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1,
              color: tokens.text, margin: 0,
            }}>
              {listing.name}
            </h1>
            {location && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300,
                color: tokens.text, opacity: 0.6, marginTop: '10px',
              }}>
                {location}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-20" style={{ marginTop: '48px' }}>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 mb-8 text-xs flex-wrap" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
          <Link href="/map" className="hover:underline" style={{ padding: '6px 2px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Map</Link>
          <span>&rsaquo;</span>
          {listing.state && (
            <>
              <Link href={`/search?state=${encodeURIComponent(listing.state)}`} className="hover:underline" style={{ padding: '6px 2px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>{listing.state}</Link>
              <span>&rsaquo;</span>
            </>
          )}
          {cleanRegion && (
            <>
              <Link
                href={`/regions/${regionData.slug}`}
                className="hover:underline"
                style={{ padding: '6px 2px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              >
                {cleanRegion}
              </Link>
              <span>&rsaquo;</span>
            </>
          )}
          <span style={{ color: 'var(--color-ink)', padding: '6px 2px' }}>{listing.name}</span>
        </nav>

        {/* Atlas Select / Featured badges */}
        {(listing.editors_pick || (listing.is_featured && listing.is_claimed)) && (
          <div className="flex items-center gap-2 mb-6">
            {listing.editors_pick && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white" style={{ background: 'var(--color-ink)' }}>
                Atlas Select
              </span>
            )}
            {listing.is_featured && listing.is_claimed && !listing.editors_pick && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white" style={{ background: 'var(--color-accent)' }}>
                Featured
              </span>
            )}
          </div>
        )}

        {/* ── Description + Sidebar layout ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 mb-12">
          {/* Description — editorial column */}
          <div className="lg:col-span-3">
            {listing.description && (
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '18px',
                fontWeight: 400, lineHeight: 1.75, color: 'var(--color-ink)',
              }}>
                {listing.description.split('\n').map((p, i) => (
                  p.trim() ? <p key={i} className={i > 0 ? 'mt-5' : ''}>{p}</p> : null
                ))}
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex flex-wrap items-center gap-4 mt-10">
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--color-accent)', fontFamily: 'var(--font-body)', minHeight: 44 }}
                >
                  Visit Website
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              {hasCoords && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-70"
                  style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', minHeight: 44 }}
                >
                  <svg className="w-4 h-4" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Get Directions
                </a>
              )}
              <StartTrailButton listing={{ id: listing.id, name: listing.name, slug: listing.slug, region: listing.region, state: listing.state, vertical: listing.vertical, lat: listing.lat, lng: listing.lng }} />
            </div>

            <ReportIssueButton listingId={listing.id} listingName={listing.name} />
          </div>

          {/* Sidebar — details + map */}
          <div className="lg:col-span-2">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
              {hasCoords ? (
                <div className="w-full overflow-hidden" style={{ height: '200px' }}>
                  <ListingMap lat={listing.lat} lng={listing.lng} name={listing.name} color={vertColor} />
                </div>
              ) : null}

              <div className="p-5">
                <div className="flex flex-col gap-4">
                  {listing.address && (
                    <DetailItem icon="pin" label="Address" value={listing.address} />
                  )}
                  {websiteUrl && (
                    <DetailItem icon="globe" label="Website">
                      <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: vertColor }}>
                        {cleanWebsite(listing.website)}
                      </a>
                    </DetailItem>
                  )}
                  {listing.phone && (
                    <DetailItem icon="phone" label="Phone">
                      <a href={`tel:${listing.phone}`} className="hover:underline" style={{ color: vertColor }}>
                        {listing.phone}
                      </a>
                    </DetailItem>
                  )}
                  {cleanRegion && (
                    <DetailItem icon="map" label="Region">
                      <Link
                        href={`/regions/${regionData.slug}`}
                        className="hover:underline"
                        style={{ color: vertColor }}
                      >
                        {cleanRegion}
                      </Link>
                    </DetailItem>
                  )}
                </div>

                {listing.hours && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                    <OpeningHours hours={listing.hours} />
                  </div>
                )}
              </div>
            </div>

            {/* Also listed on */}
            <div className="flex items-center gap-3 mt-4 py-3 px-4 rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              <VerticalBadge vertical={listing.vertical} size="sm" />
              <span className="text-xs" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
                Also on
              </span>
              <a
                href={verticalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium hover:underline"
                style={{ fontFamily: 'var(--font-body)', color: vertColor }}
              >
                {vertLabel} &rarr;
              </a>
            </div>
          </div>
        </div>

        {/* ── Place Memories — only if has memories ───────── */}
        {memories && memories.length > 0 && (
          <PlaceMemories listingId={listing.id} initialMemories={memories} />
        )}

        {/* ── Claim CTA (if unclaimed) ───────────────────── */}
        {!listing.is_claimed && (
          <div style={{
            background: '#F5F0E8', margin: '0 -1.5rem', padding: '3rem 2rem',
            textAlign: 'center', marginBottom: '3rem',
          }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400,
              color: 'var(--color-ink)', margin: '0 0 8px',
            }}>
              Own {listing.name}?
            </p>
            <p className="mb-5" style={{
              fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300,
              color: 'var(--color-muted)', maxWidth: '400px', margin: '0 auto 20px',
            }}>
              Claim your free listing to update your details and connect with visitors.
            </p>
            <Link
              href={`/claim/${listing.slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-accent)', fontFamily: 'var(--font-body)', minHeight: 44 }}
            >
              Claim this listing
            </Link>
          </div>
        )}

        {/* ── Classes & Workshops (craft only) ────────────── */}
        {listing._offers_classes && listing._classes?.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
              Classes & Workshops
            </h2>
            <div className="flex flex-col gap-3">
              {listing._classes.map((cls, i) => {
                const skillColors = { beginner: '#4a7c59', intermediate: '#b8860b', advanced: '#c04b4b', all_levels: '#4a6fa5' }
                const skillLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All Levels' }
                const typeLabels = { workshop: 'Workshop', course: 'Course', class: 'Class', masterclass: 'Masterclass', tasting: 'Tasting', tour: 'Tour' }
                return (
                  <div key={i} className="p-4 rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--color-ink)' }}>{cls.title}</span>
                      {cls.type && (
                        <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded" style={{ background: `${vertColor}15`, color: vertColor, letterSpacing: '0.06em' }}>
                          {typeLabels[cls.type] || cls.type}
                        </span>
                      )}
                      {cls.skill_level && (
                        <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded" style={{ background: `${skillColors[cls.skill_level] || '#666'}15`, color: skillColors[cls.skill_level] || '#666', letterSpacing: '0.06em' }}>
                          {skillLabels[cls.skill_level] || cls.skill_level}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs mb-2" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                      {cls.duration && <span>{cls.duration}</span>}
                      {cls.duration && cls.frequency && <span style={{ opacity: 0.4 }}>&middot;</span>}
                      {cls.frequency && <span>{cls.frequency}</span>}
                      {cls.group_size && <><span style={{ opacity: 0.4 }}>&middot;</span><span>Max {cls.group_size}</span></>}
                    </div>
                    {cls.price && <div className="text-sm font-semibold mb-2" style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>{cls.price}</div>}
                    {cls.description && <p className="text-sm mb-3" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>{cls.description}</p>}
                    {cls.booking_url && (
                      <a href={cls.booking_url} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-xs font-bold uppercase px-3 py-1.5 rounded text-white"
                        style={{ background: vertColor, letterSpacing: '0.04em', textDecoration: 'none' }}>
                        Book this class &rarr;
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── In the Same Spirit ─────────────────────────── */}
        <SameSpirit
          listingId={listing.id}
          vertical={listing.vertical}
          suburb={listing.suburb || ''}
        />

        {/* ── Nearby listings ────────────────────────────── */}
        {nearby.length > 0 && (
          <section>
            <h2
              className="mb-5"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '22px',
                color: 'var(--color-ink)',
              }}
            >
              Nearby on Australian Atlas
            </h2>
            <style dangerouslySetInnerHTML={{ __html: `
              .nearby-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
              @media (max-width: 640px) {
                .nearby-grid {
                  display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory;
                  -webkit-overflow-scrolling: touch; padding-bottom: 8px;
                }
                .nearby-grid::-webkit-scrollbar { display: none; }
                .nearby-grid > * { scroll-snap-align: start; flex-shrink: 0; width: 75vw; max-width: 300px; }
              }
            `}} />
            <div className="nearby-grid">
              {nearby.map(n => (
                <ListingCard key={n.id} listing={n} />
              ))}
            </div>
          </section>
        )}

        {/* ── More in region ─────────────────────────────── */}
        {cleanRegion && regionListings.length > 0 && (
          <section className="mt-12">
            <h2
              className="mb-5"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '22px',
                color: 'var(--color-ink)',
              }}
            >
              More in {cleanRegion}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {regionListings.map(r => (
                <ListingCard key={r.id} listing={r} />
              ))}
            </div>
          </section>
        )}

        {/* ── Explore this region ────────────────────────── */}
        {cleanRegion && (
          <Link
            href={`/regions/${regionData.slug}`}
            className="block mt-10 py-5 px-6 rounded-lg transition-colors"
            style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase mb-1" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: '10px' }}>
                  Explore Region
                </p>
                <p className="text-base font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
                  Explore all of {cleanRegion}, {listing.state}
                </p>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}

        {/* ── Cross-vertical discovery ───────────────────── */}
        {cleanRegion && crossVerticalListings.length > 0 && (
          <section className="mt-12">
            <h3
              className="mb-4"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '15px',
                color: 'var(--color-muted)',
              }}
            >
              While you&rsquo;re in {cleanRegion}, also discover
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {crossVerticalListings.map(c => (
                <ListingCard key={c.id} listing={c} />
              ))}
            </div>
          </section>
        )}

        {/* ── Collections from this region ─────────────────── */}
        <RelatedCollections region={listing.region} vertical={listing.vertical} limit={2} />

        {/* ── Semantically similar ── cluster-aware recommendations */}
        {clusterSiblings.length > 0 && (
          <section className="mt-12">
            <h3
              className="mb-4"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '15px',
                color: 'var(--color-muted)',
              }}
            >
              You might also like
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {clusterSiblings.map(c => (
                <ListingCard key={c.id} listing={c} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Admin inline editing — only rendered server-side when checkAdmin() passes.
          Non-admin users never receive this component in the HTML at all.
          Passes only the fields the editor needs — avoids serialising the
          1536-dim embedding vector and other heavy columns to the client. */}
      {isAdmin && (
        <>
          <InlineListingEditor listing={{
            id: listing.id,
            name: listing.name,
            slug: listing.slug,
            description: listing.description,
            address: listing.address,
            website: listing.website,
            phone: listing.phone,
            region: listing.region,
            state: listing.state,
            status: listing.status,
            vertical: listing.vertical,
            lat: listing.lat,
            lng: listing.lng,
            is_featured: listing.is_featured,
            editors_pick: listing.editors_pick,
            is_claimed: listing.is_claimed,
            sub_type: listing.sub_type,
            sub_types: listing.sub_types || [],
          }} />
          <VerificationBadge
            listingId={listing.id}
            listingName={listing.name}
            initialVerified={listing.verified || false}
          />
        </>
      )}
    </div>
  )
}

// ── Detail item component ─────────────────────────────────────

const DETAIL_ICONS = {
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  map: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" /></svg>,
}

function DetailItem({ label, value, children, icon }) {
  return (
    <div className="flex gap-3">
      {icon && (
        <span style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }}>
          {DETAIL_ICONS[icon]}
        </span>
      )}
      <div>
        <dt
          className="text-xs font-semibold tracking-wider uppercase mb-0.5"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: '10px' }}
        >
          {label}
        </dt>
        <dd className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-ink)' }}>
          {children || value}
        </dd>
      </div>
    </div>
  )
}
