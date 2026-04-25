import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/jsonLd'
import ListingCard from '@/components/ListingCard'
import VerticalBadge from '@/components/VerticalBadge'
import { RelatedCollections, RelatedArticles } from '@/components/RelatedContent'
import { LISTING_REGION_SELECT } from '@/lib/regions'

export const revalidate = 7200

const SITE_URL = 'https://australianatlas.com.au'

const getCollection = cache(async function getCollection(slug) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('collections')
    .select('id, title, slug, description, hero_image_url, listing_ids, vertical, region, author')
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
      .select(`id, name, slug, vertical, region, state, hero_image_url, source_id, is_featured, is_claimed, editors_pick, ${LISTING_REGION_SELECT}`)
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

  // Resolve region slug for linking
  let regionSlug = null
  if (collection.region) {
    const { data: regionRow } = await sb
      .from('regions')
      .select('slug')
      .eq('name', collection.region)
      .single()
    if (regionRow) regionSlug = regionRow.slug
  }

  const locationParts = [collection.region].filter(Boolean)
  const locationLabel = locationParts.join(', ')

  const itemListJsonLd = collectionJsonLd(collection, listings)

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
        background: '#0f0e0c', padding: '96px 24px 72px',
        borderBottom: '1px solid var(--color-border)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, #FAF8F4 1px, transparent 1px)',
          backgroundSize: '16px 16px', opacity: 0.06, pointerEvents: 'none',
        }} />

        <div className="max-w-6xl mx-auto" style={{ position: 'relative' }}>
          <nav style={{
            fontSize: 11, color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-body)', marginBottom: 32,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Home</Link>
            <span>/</span>
            <Link href="/collections" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Collections</Link>
            <span>/</span>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>{collection.title}</span>
          </nav>

          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', marginBottom: 16,
            fontFamily: 'var(--font-body)', fontWeight: 500,
          }}>
            {locationLabel ? `${locationLabel} \u00B7 ` : ''}Collection
          </p>

          <div style={{
            width: 24, height: 1, background: '#FAF8F4',
            opacity: 0.2, marginBottom: 20,
          }} />

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 400, color: '#FAF8F4',
            lineHeight: 1.1, marginBottom: 20,
          }}>
            {collection.title}
          </h1>

          {collection.description && (
            <p style={{
              fontSize: 17, color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.75, maxWidth: 620,
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              marginBottom: 24,
            }}>
              {collection.description}
            </p>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 12, color: 'rgba(255,255,255,0.35)',
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
                <VerticalBadge vertical={collection.vertical} size="sm" />
              </>
            )}
            {locationLabel && (
              <>
                <span>&middot;</span>
                {regionSlug ? (
                  <Link href={`/regions/${regionSlug}`} style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
                    {locationLabel} &#x2197;
                  </Link>
                ) : (
                  <span>{locationLabel}</span>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Listings grid */}
      <div className="max-w-6xl mx-auto px-6 section-gap">

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
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
              }
              @media (max-width: 1024px) {
                .collection-listings-grid { grid-template-columns: repeat(3, 1fr); }
              }
              @media (max-width: 768px) {
                .collection-listings-grid { grid-template-columns: repeat(2, 1fr); }
              }
              @media (max-width: 480px) {
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

        <RelatedCollections region={collection.region} vertical={collection.vertical} limit={3} excludeSlug={slug} />
        <RelatedArticles regionName={collection.region} vertical={collection.vertical} limit={3} />

        <div style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 64, paddingTop: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: 22,
              color: 'var(--color-ink)', marginBottom: 6,
            }}>
              Explore more collections
            </p>
            <p style={{
              fontSize: 14, color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)', lineHeight: 1.6, margin: 0,
            }}>
              Curated guides to independent Australia.
            </p>
          </div>
          <Link
            href="/collections"
            style={{
              display: 'inline-block', padding: '12px 28px',
              border: '1px solid var(--color-border)',
              color: 'var(--color-ink)', textDecoration: 'none',
              fontSize: 13, fontWeight: 500,
              fontFamily: 'var(--font-body)',
              borderRadius: 100,
              transition: 'border-color 0.2s',
            }}
          >
            All Collections &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
