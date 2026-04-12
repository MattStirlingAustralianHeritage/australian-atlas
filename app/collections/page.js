import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import VerticalBadge from '@/components/VerticalBadge'

export const revalidate = 3600

const SITE_URL = 'https://australianatlas.com.au'

export const metadata = {
  title: 'Collections | Australian Atlas',
  description: 'Curated guides to independent Australia. Hand-picked collections of the best makers, producers, stays, and places across every state.',
  openGraph: {
    title: 'Collections | Australian Atlas',
    description: 'Curated guides to independent Australia. Hand-picked collections of the best makers, producers, stays, and places across every state.',
    url: `${SITE_URL}/collections`,
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
  alternates: {
    canonical: `${SITE_URL}/collections`,
  },
}

export default async function CollectionsPage() {
  const sb = getSupabaseAdmin()

  const { data: collections } = await sb
    .from('collections')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })

  const allCollections = collections || []

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-4xl mx-auto text-center" style={{ padding: '64px 24px 56px' }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 12,
            fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            Collections
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            marginBottom: 12,
            lineHeight: 1.2,
          }}>
            Curated guides to independent Australia
          </h1>
          <p style={{
            color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.6,
            maxWidth: 520, margin: '0 auto',
            fontFamily: 'var(--font-body)',
          }}>
            Hand-picked groups of listings around a theme, a region, or a vertical &mdash; assembled by our editors from thousands of verified independent places.
          </p>
        </div>
      </div>

      {/* Collections grid */}
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 48, paddingBottom: 80 }}>

        {allCollections.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            Collections are coming soon.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
            gap: 24,
          }}>
            {allCollections.map(collection => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CollectionCard({ collection }) {
  const listingCount = collection.listing_ids?.length || 0
  const description = collection.description
    ? (collection.description.length > 100
      ? collection.description.slice(0, 100).trimEnd() + '...'
      : collection.description)
    : null

  const locationParts = [collection.region].filter(Boolean)
  const locationLabel = locationParts.join(', ')

  return (
    <Link href={`/collections/${collection.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        className="collection-card"
        style={{
          background: 'var(--color-card-bg)',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Typographic hero */}
        <div style={{
          aspectRatio: '16/9', overflow: 'hidden', position: 'relative',
          background: '#0f0e0c', color: '#f0ece4',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '1.5rem 1.25rem', textAlign: 'center',
        }}>
          {/* Dot grid */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, #f0ece4 1px, transparent 1px)',
            backgroundSize: '16px 16px', opacity: 0.1, pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 500,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              opacity: 0.55, margin: '0 0 1rem',
            }}>
              COLLECTION
            </p>
            <div style={{
              width: 20, height: 1, background: '#f0ece4',
              opacity: 0.35, margin: '0 auto 0.75rem',
            }} />
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: 17,
              fontWeight: 400, margin: 0, lineHeight: 1.3,
            }}>
              {collection.title}
            </p>
            {locationLabel && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 400,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                opacity: 0.45, margin: '1rem 0 0',
              }}>
                {locationLabel.toUpperCase()}
              </p>
            )}
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: '20px 22px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 8, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 11, color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)',
            }}>
              {listingCount} {listingCount === 1 ? 'place' : 'places'}
            </span>
            {locationLabel && (
              <>
                <span style={{ color: 'var(--color-border)', fontSize: 10 }}>&middot;</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--color-sage)',
                  fontFamily: 'var(--font-body)',
                }}>
                  {locationLabel}
                </span>
              </>
            )}
            {collection.vertical && (
              <>
                <span style={{ color: 'var(--color-border)', fontSize: 10 }}>&middot;</span>
                <VerticalBadge vertical={collection.vertical} />
              </>
            )}
          </div>

          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
            color: 'var(--color-ink)', marginBottom: 8, lineHeight: 1.3,
          }}>
            {collection.title}
          </h2>

          {description && (
            <p style={{
              fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.65,
              fontFamily: 'var(--font-body)',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {description}
            </p>
          )}

          {collection.author && (
            <p style={{
              marginTop: 12, fontSize: 11,
              color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
            }}>
              Curated by {collection.author}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
