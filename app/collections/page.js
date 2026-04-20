import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import VerticalBadge, { VERTICAL_STYLES } from '@/components/VerticalBadge'

export const revalidate = 7200

const SITE_URL = 'https://australianatlas.com.au'

const VERTICAL_LABELS = {
  sba: 'Small Batch', fine_grounds: 'Fine Grounds', collection: 'Culture',
  craft: 'Craft', rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_CARD_BG = {
  sba: '#3D2B1F', collection: '#2D3436', craft: '#4A3728',
  fine_grounds: '#2C1810', rest: '#1B2631', field: '#1E3A2F',
  corner: '#3B2F2F', found: '#2F2B26', table: '#3A2E1F',
}

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
    .select('id, title, slug, description, listing_ids, vertical, region, author')
    .eq('published', true)
    .order('created_at', { ascending: false })

  const allCollections = collections || []

  const featured = allCollections[0]
  const rest = allCollections.slice(1)

  const verticalGroups = {}
  const ungrouped = []
  for (const c of rest) {
    if (c.vertical && VERTICAL_LABELS[c.vertical]) {
      if (!verticalGroups[c.vertical]) verticalGroups[c.vertical] = []
      verticalGroups[c.vertical].push(c)
    } else {
      ungrouped.push(c)
    }
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <div className="section-gap" style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-4xl mx-auto text-center" style={{ padding: '0 24px' }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 16,
            fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            Collections
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            marginBottom: 16,
            lineHeight: 1.15,
          }}>
            Curated guides to independent Australia
          </h1>
          <p style={{
            color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.7,
            maxWidth: 540, margin: '0 auto',
            fontFamily: 'var(--font-body)',
          }}>
            Hand-picked groups of listings around a theme, a region, or a vertical &mdash; assembled by our editors from thousands of verified independent places.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 64, paddingBottom: 96 }}>

        {allCollections.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            Collections are coming soon.
          </div>
        ) : (
          <>
            {/* Featured collection — full width */}
            {featured && <FeaturedCollectionCard collection={featured} />}

            {/* Grouped by vertical */}
            {Object.entries(verticalGroups).map(([vertical, items]) => (
              <section key={vertical} style={{ marginTop: 64 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <VerticalBadge vertical={vertical} size="sm" />
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
                    color: 'var(--color-ink)',
                  }}>
                    {VERTICAL_LABELS[vertical]} Collections
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 20,
                }}>
                  {items.map(c => <CollectionCard key={c.id} collection={c} />)}
                </div>
              </section>
            ))}

            {/* Ungrouped */}
            {ungrouped.length > 0 && (
              <section style={{ marginTop: 64 }}>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
                  color: 'var(--color-ink)', marginBottom: 24,
                }}>
                  More Collections
                </h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 20,
                }}>
                  {ungrouped.map(c => <CollectionCard key={c.id} collection={c} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FeaturedCollectionCard({ collection }) {
  const listingCount = collection.listing_ids?.length || 0
  const bg = VERTICAL_CARD_BG[collection.vertical] || '#0f0e0c'

  return (
    <Link href={`/collections/${collection.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .featured-collection-grid { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 768px) { .featured-collection-grid { grid-template-columns: 1fr; } }
      `}} />
      <div
        className="listing-card featured-collection-grid"
        style={{
          borderRadius: 10, overflow: 'hidden',
          border: '0.5px solid var(--color-border)',
          minHeight: 320,
        }}
      >
        {/* Typographic left panel */}
        <div style={{
          background: bg, color: '#FAF8F4',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '3rem 2.5rem', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, #FAF8F4 1px, transparent 1px)',
            backgroundSize: '16px 16px', opacity: 0.06, pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 500,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              opacity: 0.45, margin: '0 0 1.5rem',
            }}>
              Featured Collection
            </p>
            <div style={{
              width: 24, height: 1, background: '#FAF8F4',
              opacity: 0.25, marginBottom: '1.25rem',
            }} />
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 32px)',
              fontWeight: 400, margin: '0 0 0.75rem', lineHeight: 1.2,
            }}>
              {collection.title}
            </h2>
            {collection.description && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                lineHeight: 1.65, opacity: 0.65, margin: '0 0 1.5rem',
              }}>
                {collection.description.length > 160
                  ? collection.description.slice(0, 160).trimEnd() + '\u2026'
                  : collection.description}
              </p>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              fontSize: 12, opacity: 0.45,
              fontFamily: 'var(--font-body)',
            }}>
              <span>{listingCount} places</span>
              {collection.region && <><span>&middot;</span><span>{collection.region}</span></>}
              {collection.author && <><span>&middot;</span><span>{collection.author}</span></>}
            </div>
          </div>
        </div>

        {/* Right panel — abstract pattern */}
        <div style={{
          background: 'var(--color-cream)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', padding: '2rem', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(circle, ${bg}22 1px, transparent 1px)`,
            backgroundSize: '24px 24px', pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 400,
              color: 'var(--color-ink)', opacity: 0.08, lineHeight: 1,
            }}>
              {listingCount}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginTop: 8,
            }}>
              Independent Places
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

function CollectionCard({ collection }) {
  const listingCount = collection.listing_ids?.length || 0
  const bg = VERTICAL_CARD_BG[collection.vertical] || '#0f0e0c'

  return (
    <Link href={`/collections/${collection.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        className="listing-card"
        style={{
          borderRadius: 10, overflow: 'hidden',
          border: '0.5px solid var(--color-border)',
        }}
      >
        {/* Typographic hero */}
        <div style={{
          aspectRatio: '3/2', overflow: 'hidden', position: 'relative',
          background: bg, color: '#FAF8F4',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '1.5rem 1.5rem', textAlign: 'center',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, #FAF8F4 1px, transparent 1px)',
            backgroundSize: '16px 16px', opacity: 0.06, pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 500,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              opacity: 0.4, margin: '0 0 1rem',
            }}>
              {collection.region ? collection.region.toUpperCase() : 'COLLECTION'}
            </p>
            <div style={{
              width: 20, height: 1, background: '#FAF8F4',
              opacity: 0.25, margin: '0 auto 0.75rem',
            }} />
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: 19,
              fontWeight: 400, margin: 0, lineHeight: 1.3,
            }}>
              {collection.title}
            </p>
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 12, color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)',
            }}>
              {listingCount} {listingCount === 1 ? 'place' : 'places'}
            </span>
            {collection.author && (
              <>
                <span style={{ color: 'var(--color-border)', fontSize: 10 }}>&middot;</span>
                <span style={{
                  fontSize: 12, color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)',
                }}>
                  {collection.author}
                </span>
              </>
            )}
          </div>

          {collection.description && (
            <p style={{
              fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6,
              fontFamily: 'var(--font-body)',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
              margin: 0,
            }}>
              {collection.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
