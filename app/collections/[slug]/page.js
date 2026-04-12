import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
import ListingCard from '@/components/ListingCard'
import VerticalBadge from '@/components/VerticalBadge'

export const revalidate = 3600

const SITE_URL = 'https://australianatlas.com.au'

const getCollection = cache(async function getCollection(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('collections')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()
  return data
})

export async function generateMetadata({ params }) {
  const { slug } = await params
  const collection = await getCollection(slug)
  if (!collection) return {}

  const description = collection.description
    || `A curated collection of independent places — ${collection.title}.`

  return {
    title: `${collection.title} | Collections | Australian Atlas`,
    description,
    openGraph: {
      title: collection.title,
      description,
      url: `${SITE_URL}/collections/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
      ...(collection.hero_image_url ? { images: [collection.hero_image_url] } : {}),
    },
    alternates: {
      canonical: `${SITE_URL}/collections/${slug}`,
    },
  }
}

export default async function CollectionPage({ params }) {
  const { slug } = await params

  const collection = await getCollection(slug)
  if (!collection) notFound()

  const sb = getSupabaseAdmin()

  // Fetch listings by ID, preserving the order from listing_ids
  let listings = []
  if (collection.listing_ids && collection.listing_ids.length > 0) {
    const { data } = await sb
      .from('listings')
      .select('*')
      .in('id', collection.listing_ids)
      .eq('status', 'active')

    if (data) {
      // Preserve the order from listing_ids
      const listingMap = new Map(data.map(l => [l.id, l]))
      listings = collection.listing_ids
        .map(id => listingMap.get(id))
        .filter(Boolean)
    }
  }

  const locationParts = [collection.region].filter(Boolean)
  const locationLabel = locationParts.join(', ')

  // JSON-LD: ItemList
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: collection.title,
    description: collection.description || '',
    url: `${SITE_URL}/collections/${slug}`,
    numberOfItems: listings.length,
    itemListElement: listings.map((listing, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: listing.name,
      url: `${SITE_URL}/place/${listing.slug}`,
    })),
  }

  // Breadcrumb JSON-LD
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Collections', url: '/collections' },
    { name: collection.title },
  ])

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Hero */}
      <section style={{
        background: '#0f0e0c', padding: '72px 24px 56px',
        borderBottom: '1px solid var(--color-border)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, #f0ece4 1px, transparent 1px)',
          backgroundSize: '16px 16px', opacity: 0.1, pointerEvents: 'none',
        }} />

        <div className="max-w-6xl mx-auto" style={{ position: 'relative' }}>
          {/* Breadcrumb */}
          <nav style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--font-body)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Home</Link>
            <span>/</span>
            <Link href="/collections" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Collections</Link>
            <span>/</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{collection.title}</span>
          </nav>

          <div style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 14,
            fontFamily: 'var(--font-body)',
          }}>
            {locationLabel ? `${locationLabel} \u00B7 ` : ''}Collection
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 400, color: '#fff',
            lineHeight: 1.15, marginBottom: 16,
          }}>
            {collection.title}
          </h1>

          {collection.description && (
            <p style={{
              fontSize: 16, color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.7, maxWidth: 620,
              fontFamily: 'var(--font-body)', marginBottom: 20,
            }}>
              {collection.description}
            </p>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 13, color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-body)', flexWrap: 'wrap',
          }}>
            <span>{listings.length} {listings.length === 1 ? 'place' : 'places'}</span>
            {collection.author && (
              <>
                <span>&middot;</span>
                <span>Curated by {collection.author}</span>
              </>
            )}
            {collection.vertical && (
              <>
                <span>&middot;</span>
                <VerticalBadge vertical={collection.vertical} />
              </>
            )}
            {locationLabel && (
              <>
                <span>&middot;</span>
                <span>{locationLabel}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Listings grid */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48, paddingBottom: 80 }}>

        {listings.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            No listings in this collection yet.
          </div>
        ) : (
          <>
            <style dangerouslySetInnerHTML={{ __html: `
              .collection-listings-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 24px;
              }
              @media (max-width: 1024px) {
                .collection-listings-grid { grid-template-columns: repeat(2, 1fr); }
              }
              @media (max-width: 640px) {
                .collection-listings-grid { grid-template-columns: 1fr; }
              }
            `}} />
            <div className="collection-listings-grid">
              {listings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        )}

        {/* Back to collections */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 48, paddingTop: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 20,
              color: 'var(--color-ink)', marginBottom: 6,
            }}>
              Explore more collections
            </div>
            <div style={{
              fontSize: 13, color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)', lineHeight: 1.5,
            }}>
              Discover more curated guides to independent Australia.
            </div>
          </div>
          <Link
            href="/collections"
            style={{
              display: 'inline-block', padding: '11px 24px',
              border: '1px solid var(--color-border)',
              color: 'var(--color-muted)', textDecoration: 'none',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontFamily: 'var(--font-body)',
              borderRadius: 2,
            }}
          >
            All Collections
          </Link>
        </div>
      </div>
    </div>
  )
}
