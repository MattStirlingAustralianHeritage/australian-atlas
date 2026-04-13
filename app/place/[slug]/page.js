import { cache } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { listingJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'
import { checkAdmin } from '@/lib/admin-auth'
import VerticalBadge from '@/components/VerticalBadge'
import ListingCard, { TypographicCard, VERTICAL_TOKENS } from '@/components/ListingCard'
import ListingMap from '@/components/ListingMap'
import InlineListingEditor from '@/components/InlineListingEditor'
import StartTrailButton from '@/components/StartTrailButton'
import ReportIssueButton from '@/components/ReportIssueButton'
import OpeningHours from '@/components/OpeningHours'

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

const getListing = cache(async function getListing(slug) {
  const sb = getSupabaseAdmin()
  // slug is NOT unique across verticals — use limit(1) instead of .single()
  // to avoid PGRST116 if two verticals share a slug
  const { data, error } = await sb
    .from('listings')
    .select('id, vertical, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_featured, is_claimed, editors_pick, status, hours')
    .eq('slug', slug)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // If the query fails (e.g. missing column), retry without optional columns
  if (error && !data) {
    const retry = await sb
      .from('listings')
      .select('id, vertical, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_featured, is_claimed, editors_pick, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (retry.error || !retry.data) return null
    return retry.data
  }

  if (!data) return null
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

async function getNearbyListings(listing, limit = 6) {
  if (!listing.lat || !listing.lng) return []
  const sb = getSupabaseAdmin()

  const PRIMARY_RADIUS_KM = 15
  const MAX_RADIUS_KM = 30

  // Bounding box sized to hard cap (30km) — no results beyond this ever shown
  const latDelta = MAX_RADIUS_KM / 111
  const lngDelta = MAX_RADIUS_KM / (111 * Math.cos(listing.lat * Math.PI / 180))

  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick')
    .eq('status', 'active')
    .neq('id', listing.id)
    .gte('lat', listing.lat - latDelta)
    .lte('lat', listing.lat + latDelta)
    .gte('lng', listing.lng - lngDelta)
    .lte('lng', listing.lng + lngDelta)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(100)

  if (!data || data.length === 0) return []

  // Calculate actual Haversine distances and hard-cap at MAX_RADIUS_KM
  const withDist = data
    .map(l => ({ ...l, _dist: haversineKm(listing.lat, listing.lng, l.lat, l.lng) }))
    .filter(l => l._dist <= MAX_RADIUS_KM)
    .sort((a, b) => a._dist - b._dist)

  if (withDist.length === 0) return []

  // Try primary radius first (15km)
  let pool = withDist.filter(l => l._dist <= PRIMARY_RADIUS_KM)

  // Expand to 30km if fewer than 3 results within 15km
  if (pool.length < 3) {
    pool = withDist
  }

  // Pick closest, but cap per-vertical to ensure cross-vertical diversity.
  // Pass 1: strict cap (max 2 per vertical) — prioritises variety
  // Pass 2: relaxed cap (max 3 per vertical) — fills remaining slots
  // Pass 3: no cap — only if still short (very sparse areas)
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

  addFromPool(2)  // strict: max 2 per vertical
  addFromPool(3)  // relaxed: max 3 per vertical
  addFromPool(null)  // uncapped: fill remaining if needed

  return result
}

async function getRegionListings(listing, excludeIds = [], limit = 4) {
  if (!listing.region) return []
  const sb = getSupabaseAdmin()

  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick')
    .eq('status', 'active')
    .eq('region', listing.region)
    .not('id', 'in', `(${[listing.id, ...excludeIds].join(',')})`)
    .order('editors_pick', { ascending: false })
    .limit(limit)

  return data || []
}

async function getCrossVerticalListings(listing, excludeIds = [], limit = 3) {
  if (!listing.region || !listing.vertical) return []
  const sb = getSupabaseAdmin()

  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, description, is_featured, is_claimed, editors_pick')
    .eq('status', 'active')
    .eq('region', listing.region)
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

  const vertLabel = VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const regionIsStreet = listing.region && /\d/.test(listing.region)
  const location = regionIsStreet
    ? (listing.address || [listing.region, listing.state].filter(Boolean).join(', '))
    : [listing.region, listing.state].filter(Boolean).join(', ')
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
        listing.hero_image_url
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

  // Look up region slug for linking
  const sb = getSupabaseAdmin()
  const regionData = listing.region
    ? (await sb.from('regions').select('slug, name').ilike('name', listing.region).maybeSingle()).data
    : null

  const vertLabel = getVerticalLabel(listing.vertical)
  const vertColor = VERTICAL_COLORS[listing.vertical] || '#5F8A7E'
  const categoryLabel = VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const verticalUrl = getVerticalUrl(listing.vertical, listing.slug)
  // Build location subtitle — prefer address when region looks like a street
  // (data quality issue: some listings have street address stored as region)
  const regionIsStreet = listing.region && /\d/.test(listing.region)
  const location = regionIsStreet
    ? (listing.address || [listing.region, listing.state].filter(Boolean).join(', '))
    : [listing.region, listing.state].filter(Boolean).join(', ')
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
      {listing.hero_image_url && !listing.hero_image_url.includes('unsplash.com') ? (
        <div className="w-full aspect-[21/7] overflow-hidden relative">
          <img
            src={listing.hero_image_url}
            alt={listing.name}
            loading="eager"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,26,23,0.35) 0%, transparent 50%)' }} />
        </div>
      ) : (
        <TypographicCard
          name={listing.name}
          vertical={listing.vertical}
          region={listing.region}
          state={listing.state}
          aspectRatio="21/7"
          showVerticalTag={true}
        />
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-5 pb-20" style={{ marginTop: listing.hero_image_url ? '-48px' : '0' }}>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 mb-6 text-xs" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', marginTop: listing.hero_image_url ? '0' : '32px' }}>
          <Link href="/map" className="hover:underline">Map</Link>
          <span>&rsaquo;</span>
          {listing.state && (
            <>
              <Link href={`/search?state=${encodeURIComponent(listing.state)}`} className="hover:underline">{listing.state}</Link>
              <span>&rsaquo;</span>
            </>
          )}
          {listing.region && (
            <>
              <Link
                href={regionData ? `/regions/${regionData.slug}` : `/search?region=${encodeURIComponent(listing.region)}`}
                className="hover:underline"
              >
                {listing.region}
              </Link>
              <span>&rsaquo;</span>
            </>
          )}
          <span style={{ color: 'var(--color-ink)' }}>{listing.name}</span>
        </nav>

        {/* Vertical badge + category */}
        <div className="flex items-center gap-2 mb-3">
          <VerticalBadge vertical={listing.vertical} />
          <span className="text-xs" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
            {categoryLabel}
          </span>
        </div>

        {/* Name */}
        <h1
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(28px, 5vw, 40px)',
            lineHeight: 1.15,
            color: 'var(--color-ink)',
          }}
        >
          {listing.name}
        </h1>

        {/* Location */}
        {location && (
          <p className="mb-6" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300, color: 'var(--color-muted)' }}>
            {location}
          </p>
        )}

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

        {/* Description */}
        {listing.description && (
          <div className="mb-8" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300, lineHeight: 1.7, color: 'var(--color-ink)' }}>
            {listing.description.split('\n').map((p, i) => (
              p.trim() ? <p key={i} className={i > 0 ? 'mt-4' : ''}>{p}</p> : null
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: vertColor, fontFamily: 'var(--font-body)' }}
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ fontFamily: 'var(--font-body)', border: '1px solid var(--color-border)', color: 'var(--color-ink)', background: 'var(--color-card-bg)' }}
            >
              Get Directions
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
          )}
          <StartTrailButton listing={{ id: listing.id, name: listing.name, slug: listing.slug, region: listing.region, state: listing.state, vertical: listing.vertical, lat: listing.lat, lng: listing.lng }} />
        </div>

        {/* Report issue link */}
        <ReportIssueButton listingId={listing.id} listingName={listing.name} />

        {/* ── Details + Map card ──────────────────────────── */}
        <div className="rounded-xl overflow-hidden mb-10" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
          {/* Map */}
          {hasCoords ? (
            <div className="w-full aspect-[16/7] overflow-hidden">
              <ListingMap
                lat={listing.lat}
                lng={listing.lng}
                name={listing.name}
                color={vertColor}
              />
            </div>
          ) : (
            <div
              className="w-full aspect-[16/7] flex items-center justify-center"
              style={{ background: 'var(--color-surface, #f5f5f0)' }}
            >
              <div className="text-center px-4">
                <svg className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                  Map location not yet available
                </p>
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="p-6">
            <h2
              className="mb-4 text-xs font-semibold tracking-widest uppercase"
              style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.1em' }}
            >
              Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
              {listing.address && (
                <DetailItem label="Address" value={listing.address} />
              )}
              {listing.phone && (
                <DetailItem label="Phone">
                  <a href={`tel:${listing.phone}`} className="hover:underline" style={{ color: vertColor }}>
                    {listing.phone}
                  </a>
                </DetailItem>
              )}
              {websiteUrl && (
                <DetailItem label="Website">
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: vertColor }}>
                    {cleanWebsite(listing.website)}
                  </a>
                </DetailItem>
              )}
              {listing.region && (
                <DetailItem label="Region" value={listing.region} />
              )}
              {listing.state && (
                <DetailItem label="State" value={listing.state} />
              )}
            </div>

            {/* Opening hours */}
            {listing.hours && (
              <OpeningHours hours={listing.hours} />
            )}
          </div>
        </div>

        {/* ── Also listed on [Vertical] ──────────────────── */}
        <div className="flex items-center gap-3 mb-10 py-4 px-5 rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
          <VerticalBadge vertical={listing.vertical} />
          <span className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
            Also listed on
          </span>
          <a
            href={verticalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline"
            style={{ fontFamily: 'var(--font-body)', color: vertColor }}
          >
            {vertLabel} &rarr;
          </a>
        </div>

        {/* ── Claim CTA (if unclaimed) ───────────────────── */}
        {!listing.is_claimed && (
          <div className="text-center py-6 px-5 rounded-lg mb-10" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm mb-2" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
              Own this listing?
            </p>
            <Link
              href={`/claim/${listing.slug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: vertColor, fontFamily: 'var(--font-body)' }}
            >
              Claim this listing
            </Link>
          </div>
        )}

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nearby.map(n => (
                <ListingCard key={n.id} listing={n} />
              ))}
            </div>
          </section>
        )}

        {/* ── More in region ─────────────────────────────── */}
        {listing.region && regionListings.length > 0 && (
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
              More in {listing.region}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {regionListings.map(r => (
                <ListingCard key={r.id} listing={r} />
              ))}
            </div>
          </section>
        )}

        {/* ── Explore this region ────────────────────────── */}
        {listing.region && (
          <Link
            href={regionData ? `/regions/${regionData.slug}` : `/search?region=${encodeURIComponent(listing.region)}`}
            className="block mt-10 py-5 px-6 rounded-lg transition-colors"
            style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase mb-1" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: '10px' }}>
                  Explore Region
                </p>
                <p className="text-base font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}>
                  Explore all of {listing.region}
                </p>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}

        {/* ── Cross-vertical discovery ───────────────────── */}
        {listing.region && crossVerticalListings.length > 0 && (
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
              While you&rsquo;re in {listing.region}, also discover
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {crossVerticalListings.map(c => (
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
        }} />
      )}
    </div>
  )
}

// ── Detail item component ─────────────────────────────────────

function DetailItem({ label, value, children }) {
  return (
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
  )
}
