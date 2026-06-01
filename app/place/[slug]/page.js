import { cache } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalLabel, getVerticalTagline, getVerticalBrandColour } from '@/lib/verticalUrl'
import { listingJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'
import { checkAdmin } from '@/lib/admin-auth'
import { isApprovedImageSource } from '@/lib/image-utils'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { listOutgoing, listIncoming, filterPaidListingIds } from '@/lib/picks/producerPicks'
import {
  WAY_PRIMARY_TYPE_LABELS,
  WAY_OPERATOR_TYPE_LABELS,
  WAY_ACCREDITATION_LABELS,
  WAY_PRESENCE_TYPE_LABELS,
} from '@/lib/wayLabels'
import ListingCard, { TypographicCard } from '@/components/ListingCard'
import EmbeddedNearbyMap from '@/components/EmbeddedNearbyMap'
import InlineListingEditor from '@/components/InlineListingEditor'
import StartTrailButton from '@/components/StartTrailButton'
import SaveListingButton from '@/components/SaveListingButton'
import ReportIssueButton from '@/components/ReportIssueButton'
import OpeningHours from '@/components/OpeningHours'
import PlaceMemories from '@/components/PlaceMemories'
import ProducerPicks from '@/components/ProducerPicks'
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
  way: 'Experience',
}

// Brand colours sourced from lib/verticalUrl.js (see getVerticalBrandColour).

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
  way: { table: 'way_meta', key: 'primary_type' },
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
  heritage_hotel: 'Heritage Hotel', national_park_stay: 'National Park Stay',
  heritage_lighthouse: 'Heritage Lighthouse',
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
  // Way Atlas primary types — sourced from lib/wayLabels.js
  ...WAY_PRIMARY_TYPE_LABELS,
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
    .select(`id, vertical, name, slug, description, region, state, suburb, lat, lng, website, phone, address, hero_image_url, is_featured, is_claimed, editors_pick, status, hours, verified, sub_type, sub_types, ${LISTING_REGION_SELECT}`)
    .eq('slug', slug)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[place] Listing query failed for slug:', slug, '—', error.message, `[${error.code}]`)
    return null
  }

  if (!data) return null

  // Fetch vertical-specific subcategory from meta table.
  // This is the source of truth — sub_type on listings may be stale.
  const metaLookup = META_CATEGORY_LOOKUP[data.vertical]
  if (metaLookup) {
    try {
      let metaFields = metaLookup.key
      if (metaLookup.table === 'craft_meta') {
        metaFields = `${metaLookup.key}, offers_classes, classes`
      } else if (metaLookup.table === 'way_meta') {
        metaFields = 'primary_type, secondary_types, operator_type, aboriginal_community, accreditations, operating_region_ids, departure_point_name, cultural_authority_verified, presence_type'
      } else if (metaLookup.table === 'fine_grounds_meta') {
        metaFields = 'entity_type, roast_style, beans_origin, brewing_methods, features, has_tasting_room, food_offering'
      } else if (metaLookup.table === 'sba_meta') {
        metaFields = 'producer_type, subtype, features'
      }
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
      // Fine Grounds: attach meta for the roasting/origins detail section.
      if (metaLookup.table === 'fine_grounds_meta' && metaRow) {
        data._fgMeta = metaRow
      }
      // Small Batch: attach meta for the "Visiting" highlights section.
      if (metaLookup.table === 'sba_meta' && metaRow) {
        data._sbaMeta = metaRow
      }
      // Way Atlas: attach full meta for the operator detail section.
      if (metaLookup.table === 'way_meta' && metaRow) {
        data._wayMeta = metaRow
        // Resolve operating_region_ids UUIDs to region names.
        if (metaRow.operating_region_ids?.length) {
          const { data: regionRows } = await sb
            .from('regions')
            .select('id, name, slug')
            .in('id', metaRow.operating_region_ids)
          data._wayMeta._operatingRegions = regionRows || []
        }
      }
    } catch (metaErr) {
      console.error('[place] Meta lookup failed for listing', data.id, `(${metaLookup.table}):`, metaErr.message)
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

/**
 * Listings within an adaptive radius of the current listing for the
 * "Nearby on Australian Atlas" map. Tries 2km → 15km → 30km in turn and
 * picks the smallest band containing at least MIN_FOR_DENSITY listings, so
 * dense urban areas show a tight cluster and outer-metro / regional /
 * remote areas widen out.
 *
 * Returns { listings, radiusKm } so the caller can fit the map to the
 * chosen radius. Always includes the current listing so the highlighted
 * pin is part of the same data source.
 */
async function getMapNearbyListings(listing) {
  const RADII_KM = [2, 15, 30]
  const MIN_FOR_DENSITY = 3
  const FALLBACK_RADIUS_KM = 30
  if (!listing.lat || !listing.lng) {
    return { listings: [listing], radiusKm: FALLBACK_RADIUS_KM }
  }
  const sb = getSupabaseAdmin()
  const latDelta = FALLBACK_RADIUS_KM / 111
  const lngDelta = FALLBACK_RADIUS_KM / (111 * Math.cos(listing.lat * Math.PI / 180))

  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, lat, lng, is_featured, is_claimed, editors_pick, sub_type, address_on_request')
    .eq('status', 'active')
    .neq('id', listing.id)
    .or('address_on_request.eq.false,address_on_request.is.null')
    .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
    .gte('lat', listing.lat - latDelta)
    .lte('lat', listing.lat + latDelta)
    .gte('lng', listing.lng - lngDelta)
    .lte('lng', listing.lng + lngDelta)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(120)

  const withDist = (data || [])
    .map(l => ({ ...l, _dist: haversineKm(listing.lat, listing.lng, l.lat, l.lng) }))
    .filter(l => l._dist <= FALLBACK_RADIUS_KM)
    .sort((a, b) => a._dist - b._dist)

  let chosenRadius = FALLBACK_RADIUS_KM
  for (const r of RADII_KM) {
    if (withDist.filter(l => l._dist <= r).length >= MIN_FOR_DENSITY) {
      chosenRadius = r
      break
    }
  }

  const inBand = withDist.filter(l => l._dist <= chosenRadius)
  return { listings: [listing, ...inBand], radiusKm: chosenRadius }
}

/** Compute a bounding box around (lat, lng) for the given radius in km. */
function radiusBounds(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  return [[lng - lngDelta, lat - latDelta], [lng + lngDelta, lat + latDelta]]
}

async function getRegionListings(listing, excludeIds = [], limit = 4) {
  // Decision 1: NULL effective region → no cross-region recommendations.
  // Decision 3: override-wins precedence via getListingRegion.
  // Adjacency: when the primary region's pool is thin (< MIN_PRIMARY), we
  // top up from the same state but a different region. The label stays
  // "More in [region]" — the user doesn't need to see the fallback.
  const region = getListingRegion(listing)
  if (!region) return []
  const sb = getSupabaseAdmin()
  const SELECT = `id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`
  const MIN_PRIMARY = 8
  const FETCH_PRIMARY = Math.max(MIN_PRIMARY, limit)

  const excludeForQuery = [listing.id, ...excludeIds]

  const { data: primary } = await sb
    .from('listings_with_region')
    .select(SELECT)
    .eq('status', 'active')
    .eq('region_id', region.id)
    .not('id', 'in', `(${excludeForQuery.join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(FETCH_PRIMARY)

  const primaryRows = primary || []
  if (primaryRows.length >= MIN_PRIMARY || !region.state) {
    return primaryRows.slice(0, limit)
  }

  // Top-up from same state, different region. Excludes anything we already
  // have so the row stays free of duplicates. The "different region" check
  // happens post-fetch via getListingRegion — Postgres NULL semantics make
  // a column-level .neq tricky when override or computed can be null.
  const usedIds = new Set([...excludeForQuery, ...primaryRows.map(r => r.id)])
  const remaining = limit - primaryRows.length
  const { data: stateData } = await sb
    .from('listings')
    .select(SELECT)
    .eq('status', 'active')
    .eq('state', region.state)
    .not('id', 'in', `(${[...usedIds].join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(remaining * 6)

  const stateRows = (stateData || []).filter(l => {
    const eff = getListingRegion(l)
    return !eff || eff.id !== region.id
  }).slice(0, remaining)

  return [...primaryRows, ...stateRows].slice(0, limit)
}

/**
 * Sibling rows representing the same physical place on a different vertical.
 * Detected by an exact slug match across active rows — the master `listings`
 * table holds one row per (vertical, source_id) pair, so a venue cross-listed
 * across verticals shares its slug. Returns rows other than the current one.
 */
async function getCrossListedSiblings(listing) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('listings')
    .select('id, vertical, slug')
    .eq('slug', listing.slug)
    .eq('status', 'active')
    .neq('id', listing.id)
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

  // Nearby pins for the in-page map. Density-aware radius (2/10/25 km).
  const { listings: mapNearby, radiusKm: mapRadiusKm } = await getMapNearbyListings(listing)
  const mapNearbyIds = mapNearby.map(n => n.id)

  // The single surviving related row: "More in [region]". Excludes anything
  // already on the map so we don't show the same card twice on one page.
  const regionListings = await getRegionListings(listing, mapNearbyIds, 4)

  // Cross-listed siblings: same slug, different vertical (e.g. a winery+restaurant
  // on both Small Batch and Table). Used by the "Also listed on" meta section.
  const crossListedSiblings = await getCrossListedSiblings(listing)

  // Fetch approved place memories (max 5)
  const sbMem = getSupabaseAdmin()
  const { data: memories } = await sbMem
    .from('place_memories')
    .select('id, author_name, memory, created_at')
    .eq('listing_id', listing.id)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(5)

  // Producer picks — cross-venue endorsements stored in listing_relationships.
  //   picksGiven    = venues this place vouches for (outgoing)
  //   picksReceived = venues that have vouched for this place ("picked by")
  // Both are filtered to active venues so a pick never links to a hidden listing.
  const [picksGivenRaw, picksReceivedRaw, paidCuratorSet] = await Promise.all([
    listOutgoing(sbMem, [listing.id]),
    listIncoming(sbMem, [listing.id]),
    filterPaidListingIds(sbMem, [listing.id]),
  ])
  // Producer's Picks is a Standard-tier perk: a venue's own picks surface
  // publicly only while it holds an active standard claim. "Picked by"
  // (incoming) isn't gated — it reflects other venues vouching for this one.
  const picksGiven = paidCuratorSet.has(listing.id)
    ? picksGivenRaw.filter(p => p.pickedStatus === 'active')
    : []
  const picksReceived = picksReceivedRaw.filter(p => p.curatorStatus === 'active')

  // Effective region via the FK helper. Returns canonical { id, slug, name, state }
  // from regions table, or null when both region_computed_id and region_override_id
  // are NULL (the ~917 quarantine listings). Per Decision 1, no fallback to legacy text.
  const region = getListingRegion(listing)
  const cleanRegion = region?.name ?? null
  const regionData = region

  const vertLabel = getVerticalLabel(listing.vertical)
  const vertColor = getVerticalBrandColour(listing.vertical) || '#5F8A7E'
  const specificSubcategory = formatSubcategory(listing._subcategory || listing.sub_type)
  const categoryLabel = specificSubcategory || VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const secondarySubcategories = (listing.sub_types || []).slice(1).map(formatSubcategory).filter(Boolean)
  const verticalUrl = getVerticalUrl(listing.vertical, listing.slug)
  const location = [cleanRegion, listing.state].filter(Boolean).join(', ')
  const hasCoords = listing.lat && listing.lng
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const websiteUrl = listing.website?.startsWith('http') ? listing.website : listing.website ? `https://${listing.website}` : null

  // Fine Grounds coffee detail — mirrors the roast profile / origins / features
  // block on the vertical. roast_style is a scalar (may be comma-joined); the
  // rest are text[] columns synced from the Fine Grounds source DB.
  const fgMeta = listing._fgMeta || null
  const fgRoastStyles = fgMeta?.roast_style ? String(fgMeta.roast_style).split(',').map(s => s.trim()).filter(Boolean) : []
  const fgOrigins = Array.isArray(fgMeta?.beans_origin) ? fgMeta.beans_origin.filter(Boolean) : []
  const fgBrewing = Array.isArray(fgMeta?.brewing_methods) ? fgMeta.brewing_methods.filter(Boolean) : []
  const fgFeatures = Array.isArray(fgMeta?.features) ? fgMeta.features.filter(Boolean) : []
  const fgHasDetail = !!(fgMeta && (fgRoastStyles.length || fgOrigins.length || fgBrewing.length || fgFeatures.length || fgMeta.has_tasting_room))

  // Small Batch (sba) "Visiting" highlights. features is the curated source of
  // truth (the has_* booleans are sparse/duplicative — e.g. has_cellar_door is
  // unpopulated while "Cellar Door" appears in features); subtype is the
  // specialty descriptor (e.g. "Cool Climate", "Whisky", "Gin").
  const sbaMeta = listing._sbaMeta || null
  const sbaFeatures = Array.isArray(sbaMeta?.features) ? sbaMeta.features.filter(Boolean) : []
  const sbaSubtype = sbaMeta?.subtype ? String(sbaMeta.subtype).trim() : null
  const sbaHasDetail = !!(sbaMeta && (sbaFeatures.length || sbaSubtype))

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
      {/* Visible breadcrumb intentionally removed; SEO breadcrumbs are emitted via JSON-LD above. */}
      {/* .atlas-hero-band height tiers live in app/globals.css */}
      {isApprovedImageSource(listing.hero_image_url) ? (
        <div className="atlas-hero-band w-full relative overflow-hidden">
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
        <TypographicCard
          name={listing.name}
          vertical={listing.vertical}
          category={listing._subcategory || listing.sub_type}
          region={cleanRegion}
          state={listing.state}
          size="hero"
          showVerticalTag
        />
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-20" style={{ marginTop: '48px' }}>

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

            {/* CTA buttons — two-tier hierarchy.
                Primary pair (Visit Website + Start a trail here): equal visual
                weight, stacked full-width on mobile, side-by-side on desktop.
                Tertiary (Get Directions): text link with icon below.
                DOM order matches keyboard tab order requirement. */}
            <div className="mt-10 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 w-full sm:w-auto"
                    style={{ background: 'var(--color-accent)', fontFamily: 'var(--font-body)', minHeight: 44 }}
                  >
                    Visit Website
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                <StartTrailButton
                  listing={{ id: listing.id, name: listing.name, slug: listing.slug, region: listing.region, state: listing.state, vertical: listing.vertical, lat: listing.lat, lng: listing.lng }}
                  className="w-full sm:w-auto"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
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
                <SaveListingButton listingId={listing.id} listingName={listing.name} />
              </div>
            </div>

            <ReportIssueButton listingId={listing.id} listingName={listing.name} />
          </div>

          {/* Sidebar — meta details. The small map that used to live here is
              gone; map duties have moved to the full-width map section below. */}
          <div className="lg:col-span-2">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
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

            {/* Also listed on — the cross-vertical line treatment.
                Only renders when the listing genuinely exists on a second
                vertical (same slug, different vertical row). Self-references
                (the listing's own primary vertical) are suppressed. */}
            {crossListedSiblings.length > 0 && (
            <div className="mt-4 py-4 px-5 rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              <p
                className="mb-3"
                style={{
                  fontFamily: 'var(--font-body)', color: 'var(--color-muted)',
                  letterSpacing: '0.08em', fontSize: '10px',
                  fontWeight: 600, textTransform: 'uppercase',
                }}
              >
                Also listed on
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: 0, padding: 0, listStyle: 'none' }}>
                {crossListedSiblings.map(entry => {
                  const label = getVerticalLabel(entry.vertical)
                  const tagline = getVerticalTagline(entry.vertical)
                  const href = getVerticalUrl(entry.vertical, entry.slug)
                  const lineColor = getVerticalBrandColour(entry.vertical) || vertColor
                  return (
                    <li key={`${entry.vertical}-${entry.slug}`}>
                      <a
                        href={href}
                        className="hover:underline"
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: '14px',
                          fontWeight: 500, color: lineColor,
                        }}
                      >
                        {label} &rarr;
                      </a>
                      {tagline && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '12px',
                          fontWeight: 400, color: 'var(--color-muted)',
                          margin: '2px 0 0', lineHeight: 1.45,
                        }}>
                          {tagline}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
            )}
          </div>
        </div>

        {/* ── Producer Picks — cross-venue endorsements (public) ──
            Outgoing = venues this place vouches for; incoming = venues that
            have vouched for it. Renders nothing when both are empty. */}
        <ProducerPicks venueName={listing.name} picks={picksGiven} pickedBy={picksReceived} />

        {/* ── Place Memories — only if has memories ───────── */}
        {memories && memories.length > 0 && (
          <PlaceMemories listingId={listing.id} initialMemories={memories} />
        )}

        {/* Claim CTA used to live here, between the listing's primary content
            and the discovery content. It now sits below the More in row so
            it doesn't interrupt the traveller flow. */}

        {/* ── Roasting & origins (Fine Grounds only) ──────────
            Surfaces the same roast profile / origins / features detail the
            vertical shows. Data comes from fine_grounds_meta (synced from the
            Fine Grounds source DB). Renders only when at least one field is set. */}
        {fgHasDetail && (
          <section className="mb-10">
            <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
              {fgMeta.entity_type === 'cafe' ? 'Coffee & menu' : 'Roasting & origins'}
            </h2>
            <div className="p-5 rounded-lg flex flex-col gap-4" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              <MetaPillGroup label="Roast Profile" items={fgRoastStyles} vertColor={vertColor} />
              <MetaPillGroup label="Origins" items={fgOrigins} vertColor={vertColor} />
              <MetaPillGroup label="Brewing Methods" items={fgBrewing} vertColor={vertColor} />
              <MetaPillGroup label="Features" items={fgFeatures} vertColor={vertColor} muted />
              {fgMeta.has_tasting_room && (
                <p className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-ink)', margin: 0 }}>
                  Tasting room available
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Visiting (Small Batch only) ──────────────────────
            Surfaces the curated features + specialty the Small Batch vertical
            shows (cellar door, tastings, taproom, tours, restaurant, etc.).
            Data comes from sba_meta.features/subtype. Renders only when set. */}
        {sbaHasDetail && (
          <section className="mb-10">
            <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
              Visiting
            </h2>
            <div className="p-5 rounded-lg flex flex-col gap-4" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              <MetaPillGroup label="Specialty" items={sbaSubtype ? [sbaSubtype] : []} vertColor={vertColor} />
              <MetaPillGroup label="Features" items={sbaFeatures} vertColor={vertColor} />
            </div>
          </section>
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

        {/* ── Operator Details (Way Atlas only) ─────────── */}
        {listing._wayMeta && (
          <section className="mb-10">
            <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
              About this operator
            </h2>
            <div className="p-5 rounded-lg flex flex-col gap-4" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              {listing._wayMeta.operator_type && (
                <WayDetailRow label="Operator">
                  {WAY_OPERATOR_TYPE_LABELS[listing._wayMeta.operator_type] || formatSubcategory(listing._wayMeta.operator_type)}
                </WayDetailRow>
              )}
              {listing._wayMeta.aboriginal_community && (
                <WayDetailRow label="Community / Nation">
                  {listing._wayMeta.aboriginal_community}
                </WayDetailRow>
              )}
              {listing._wayMeta._operatingRegions?.length > 0 && (
                <WayDetailRow label="Operating regions">
                  <div className="flex flex-wrap gap-1.5">
                    {listing._wayMeta._operatingRegions.map(r => (
                      <Link
                        key={r.id}
                        href={`/regions/${r.slug}`}
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium hover:underline"
                        style={{ background: `${vertColor}12`, color: vertColor }}
                      >
                        {r.name}
                      </Link>
                    ))}
                  </div>
                </WayDetailRow>
              )}
              {listing._wayMeta.departure_point_name && (
                <WayDetailRow label="Departing from">
                  {listing._wayMeta.departure_point_name}
                </WayDetailRow>
              )}
              {listing._wayMeta.accreditations?.length > 0 && (
                <WayDetailRow label="Accreditations">
                  <div className="flex flex-wrap gap-1.5">
                    {listing._wayMeta.accreditations.map(a => (
                      <span
                        key={a}
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--color-ink)' }}
                      >
                        {WAY_ACCREDITATION_LABELS[a] || a}
                      </span>
                    ))}
                  </div>
                </WayDetailRow>
              )}
              {listing._wayMeta.presence_type && listing._wayMeta.presence_type !== 'year_round' && (
                <WayDetailRow label="Availability">
                  {WAY_PRESENCE_TYPE_LABELS[listing._wayMeta.presence_type] || formatSubcategory(listing._wayMeta.presence_type)}
                </WayDetailRow>
              )}
            </div>
          </section>
        )}

        {/* ── Nearby on Australian Atlas — full-width interactive map ──
            Replaces the small sidebar map AND the previous nearby/region
            carousel duplication. Pins are pre-fetched server-side with a
            density-aware radius (2/10/25 km) so dense urban areas show a
            tight cluster and remote areas widen out. */}
        {hasCoords && (
          <section className="mt-12">
            <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: '22px', color: 'var(--color-ink)', margin: 0,
              }}>
                Nearby on Australian Atlas
              </h2>
              <Link
                href={`/map?lng=${listing.lng}&lat=${listing.lat}&zoom=12`}
                className="hover:underline"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px',
                  fontWeight: 500, color: vertColor,
                }}
              >
                View on full map &rarr;
              </Link>
            </div>
            <div
              className="atlas-nearby-map rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
              role="region"
              aria-label={`Interactive map of ${listing.name} and nearby Australian Atlas listings within ${mapRadiusKm} km`}
            >
              <EmbeddedNearbyMap
                prefilteredListings={mapNearby}
                initialBounds={radiusBounds(listing.lat, listing.lng, mapRadiusKm)}
                highlightListingId={listing.id}
              />
            </div>
          </section>
        )}

        {/* ── More in [region] — the only surviving related row ────────
            3 cards on small screens, 4 on wide desktop. The "More in" pool
            broadens to same-state-different-region when the primary region
            is thin (see getRegionListings). Label stays the primary region.
            Below this, the page ends — no further carousels by design. */}
        {cleanRegion && regionListings.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-5" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: '22px', color: 'var(--color-ink)',
            }}>
              More in {cleanRegion}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {regionListings.slice(0, 4).map(r => (
                <ListingCard key={r.id} listing={r} />
              ))}
            </div>
          </section>
        )}

        {/* ── Claim CTA (if unclaimed) — moved to the bottom of the page
            so it doesn't interrupt the traveller flow. Editorially important
            to the platform, functionally irrelevant to the user, so it sits
            after the discovery content rather than between primary and
            discovery sections. */}
        {!listing.is_claimed && (
          <div className="mt-12" style={{
            background: '#F5F0E8', margin: '3rem -1.5rem 0', padding: '3rem 2rem',
            textAlign: 'center',
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

// ── Way Atlas operator detail helpers ─────────────────────────
// Label dictionaries imported from lib/wayLabels.js (single source of truth).

// Renders a labelled row of pills (Fine Grounds roast profile / origins /
// features). Returns null when there are no items so empty groups don't leave
// a dangling label. `muted` uses a neutral chip; otherwise vertical-branded.
function MetaPillGroup({ label, items, vertColor, muted = false }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <dt
        className="text-xs font-semibold tracking-wider uppercase mb-2"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: '10px' }}
      >
        {label}
      </dt>
      <dd className="flex flex-wrap gap-2" style={{ margin: 0 }}>
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-block px-3 py-1 rounded-full text-xs font-medium"
            style={muted
              ? { background: 'rgba(0,0,0,0.05)', color: 'var(--color-ink)' }
              : { background: `${vertColor}14`, color: vertColor }}
          >
            {item}
          </span>
        ))}
      </dd>
    </div>
  )
}

function WayDetailRow({ label, children }) {
  return (
    <div>
      <dt
        className="text-xs font-semibold tracking-wider uppercase mb-1"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: '10px' }}
      >
        {label}
      </dt>
      <dd className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-ink)' }}>
        {children}
      </dd>
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
