import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

export const revalidate = 3600

/**
 * Generate metadata for SEO pages — title + description from DB.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()
  const { data: page } = await sb
    .from('seo_pages')
    .select('meta_title, meta_description, title')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!page) return { title: 'Not Found' }

  return {
    title: page.meta_title || page.title,
    description: page.meta_description,
    openGraph: {
      title: page.meta_title || page.title,
      description: page.meta_description,
      type: 'website',
      siteName: 'Australian Atlas',
    },
  }
}

/**
 * Generate static params for published SEO pages.
 */
export async function generateStaticParams() {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('seo_pages')
    .select('slug')
    .eq('status', 'published')

  return (data || []).map(p => ({ slug: p.slug }))
}

const VERT_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Collection Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export default async function SeoPage({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()

  // Fetch the page
  const { data: page } = await sb
    .from('seo_pages')
    .select('id, slug, title, query, location, category, content, listing_ids, status, quality_score, published_at, meta_title, meta_description')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!page) notFound()

  // Fetch the listings referenced
  let listings = []
  if (page.listing_ids && page.listing_ids.length > 0) {
    const { data } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, region, state, suburb, lat, lng, hero_image_url, description, is_featured, editors_pick, ${LISTING_REGION_SELECT}`)
      .in('id', page.listing_ids)
      .eq('status', 'active')

    listings = data || []
  }

  // Find region for CTAs
  const regionName = page.location || getListingRegion(listings[0])?.name || ''
  const { data: regionData } = await sb
    .from('regions')
    .select('slug')
    .ilike('name', `%${regionName}%`)
    .limit(1)
    .single()

  // Split content into paragraphs
  const paragraphs = (page.content || '').split('\n\n').filter(p => p.trim())

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: page.title,
    description: page.meta_description,
    numberOfItems: listings.length,
    itemListElement: listings.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: l.name,
        url: `https://australianatlas.com.au/place/${l.slug}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: l.suburb || getListingRegion(l)?.name,
          addressRegion: l.state,
          addressCountry: 'AU',
        },
        ...(l.lat && l.lng ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: l.lat,
            longitude: l.lng,
          },
        } : {}),
      },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {/* Breadcrumb */}
        <nav style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--color-muted)',
          marginBottom: 24,
        }}>
          <Link href="/" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Home</Link>
          <span style={{ margin: '0 6px' }}>/</span>
          <Link href="/explore" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>Explore</Link>
          <span style={{ margin: '0 6px' }}>/</span>
          <span style={{ color: 'var(--color-ink)' }}>{page.title}</span>
        </nav>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 36,
          lineHeight: 1.2,
          color: 'var(--color-ink)',
          marginBottom: 8,
        }}>
          {page.title}
        </h1>

        {page.location && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 14,
            color: 'var(--color-muted)',
            marginBottom: 32,
          }}>
            {page.location}{page.category ? ` · ${page.category}` : ''}
          </p>
        )}

        {/* Editorial content — opening paragraphs */}
        {paragraphs.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 17,
              lineHeight: 1.7,
              color: 'var(--color-ink)',
              marginBottom: 20,
            }}>
              {paragraphs[0]}
            </p>
          </div>
        )}

        {/* Listing cards — 3-column grid */}
        {listings.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
            marginBottom: 40,
          }}>
            {listings.map(listing => (
              <Link
                key={listing.id}
                href={`/place/${listing.slug}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}>
                  {/* Image */}
                  {listing.hero_image_url ? (
                    <div style={{
                      width: '100%',
                      height: 180,
                      background: `url(${listing.hero_image_url}) center/cover`,
                    }} />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: 180,
                      background: '#2d2a24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontStyle: 'italic',
                        fontSize: 16,
                        color: '#d4a843',
                      }}>
                        {listing.name}
                      </span>
                    </div>
                  )}

                  <div style={{ padding: '14px 16px' }}>
                    {/* Vertical badge */}
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: VERT_COLORS[listing.vertical] || '#888',
                      marginBottom: 4,
                      display: 'block',
                    }}>
                      {VERT_LABELS[listing.vertical] || listing.vertical}
                    </span>

                    <h3 style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 16,
                      color: 'var(--color-ink)',
                      margin: '0 0 4px',
                      lineHeight: 1.3,
                    }}>
                      {listing.name}
                    </h3>

                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: 12,
                      color: 'var(--color-muted)',
                      margin: 0,
                    }}>
                      {listing.suburb || getListingRegion(listing)?.name}{listing.state ? `, ${listing.state}` : ''}
                    </p>

                    {listing.editors_pick && (
                      <span style={{
                        display: 'inline-block',
                        marginTop: 8,
                        fontFamily: 'var(--font-body)',
                        fontWeight: 600,
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#C49A3C',
                        background: '#C49A3C18',
                        padding: '2px 8px',
                        borderRadius: 100,
                      }}>
                        Atlas Select
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Remaining editorial paragraphs (listing intros + closing) */}
        {paragraphs.length > 1 && (
          <div style={{ marginBottom: 40 }}>
            {paragraphs.slice(1).map((p, i) => (
              <p
                key={i}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 16,
                  lineHeight: 1.7,
                  color: 'var(--color-ink)',
                  marginBottom: 16,
                }}
              >
                {p}
              </p>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid var(--color-border, #e5e5e5)',
        }}>
          {regionData?.slug && (
            <Link
              href={`/regions/${regionData.slug}`}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 500,
                padding: '10px 20px',
                borderRadius: 6,
                background: 'var(--color-ink, #2d2a24)',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Explore more in {regionName}
            </Link>
          )}
          <Link
            href={`/trails/builder${regionName ? `?region=${encodeURIComponent(regionName)}` : ''}`}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              padding: '10px 20px',
              borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              color: 'var(--color-ink)',
              textDecoration: 'none',
            }}
          >
            Build a trail here
          </Link>
        </div>
      </div>
    </>
  )
}
