import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'
import RegionMapCard from '@/components/RegionMapCard'

export const revalidate = 3600

const SITE_URL = 'https://australianatlas.com.au'

const VERTICAL_ORDER = ['sba', 'fine_grounds', 'collection', 'craft', 'rest', 'field', 'corner', 'found', 'table']

const VERTICAL_INFO = {
  sba: { name: 'Small Batch', desc: 'Distilleries, wineries and artisan producers', url: 'https://smallbatchatlas.com.au' },
  collection: { name: 'Culture', desc: 'Galleries, museums and cultural collections', url: 'https://collectionatlas.com.au' },
  craft: { name: 'Craft', desc: 'Makers, studios and artisan workshops', url: 'https://craftatlas.com.au' },
  fine_grounds: { name: 'Fine Grounds', desc: 'Specialty coffee roasters and cafes', url: 'https://finegroundsatlas.com.au' },
  rest: { name: 'Rest', desc: 'Boutique stays and unique accommodation', url: 'https://restatlas.com.au' },
  field: { name: 'Field', desc: 'Nature experiences and outdoor places', url: 'https://fieldatlas.com.au' },
  corner: { name: 'Corner', desc: 'Independent shops and curated retail', url: 'https://corneratlas.com.au' },
  found: { name: 'Found', desc: 'Vintage, antique and secondhand finds', url: 'https://foundatlas.com.au' },
  table: { name: 'Table', desc: 'Independent dining and food producers', url: 'https://tableatlas.com.au' },
}

const VERTICAL_JOURNAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/journal',
  collection: 'https://collectionatlas.com.au/journal',
  craft: 'https://craftatlas.com.au/journal',
  fine_grounds: 'https://finegroundsatlas.com.au/journal',
  rest: 'https://restatlas.com.au/journal',
  field: 'https://fieldatlas.com.au/journal',
  corner: 'https://corneratlas.com.au/journal',
  found: 'https://foundatlas.com.au/journal',
  table: 'https://tableatlas.com.au/journal',
}

function articleUrl(article) {
  const v = (article.verticals?.[0]) || article.vertical || 'sba'
  const base = VERTICAL_JOURNAL_URLS[v] || VERTICAL_JOURNAL_URLS.sba
  return `${base}/${article.slug}`
}

const STATE_LABELS = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

export const metadata = {
  title: 'Explore — Australian Atlas',
  description: 'Discover independent Australia. Browse regions, curated collections, and nine directories of makers, producers, stays, and places worth the drive.',
  openGraph: {
    title: 'Explore — Australian Atlas',
    description: 'Discover independent Australia. Browse regions, curated collections, and nine directories of makers, producers, stays, and places worth the drive.',
    url: `${SITE_URL}/explore`,
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
  alternates: { canonical: `${SITE_URL}/explore` },
}

export default async function ExplorePage() {
  const sb = getSupabaseAdmin()

  const [regionsRes, collectionsRes, articlesRes] = await Promise.all([
    sb.from('regions')
      .select('id, name, slug, state, listing_count, center_lat, center_lng, map_zoom')
      .order('listing_count', { ascending: false })
      .limit(12),
    sb.from('collections')
      .select('id, title, slug, description, listing_ids, vertical, region, author')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(6),
    sb.from('articles')
      .select('id, title, slug, excerpt, hero_image_url, author, published_at, verticals, region_tags, vertical')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(4),
  ])

  const regions = regionsRes.data || []
  const collections = collectionsRes.data || []
  const articles = articlesRes.data || []

  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <style>{`
        .explore-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
        .explore-verticals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .explore-articles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }
        .explore-collections { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
        @media (max-width: 768px) {
          .explore-grid { grid-template-columns: repeat(2, 1fr); }
          .explore-verticals { grid-template-columns: 1fr; }
          .explore-articles { grid-template-columns: 1fr; }
          .explore-collections { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .explore-grid { grid-template-columns: 1fr; }
        }
        .explore-article-card:hover { border-color: rgba(184, 134, 43, 0.4); }
        .explore-vertical-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
      `}</style>

      {/* Hero */}
      <div style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '3.5rem 1.5rem 3rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--color-muted)', marginBottom: '0.5rem',
          }}>
            Explore
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
            color: 'var(--color-ink)', lineHeight: 1.15, margin: 0,
          }}>
            Discover independent Australia
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)', marginTop: '0.625rem',
            maxWidth: '36rem', lineHeight: 1.6,
          }}>
            Regions, collections, and nine directories of the places that make a road trip worth the drive.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>

        {/* Featured Regions */}
        <section style={{ marginBottom: '3.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.35rem',
                color: 'var(--color-ink)', margin: 0,
              }}>
                Regions
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                marginTop: '0.25rem',
              }}>
                Browse by region across every state
              </p>
            </div>
            <Link href="/regions" style={{
              fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-accent)', textDecoration: 'none',
            }}>
              All regions &rarr;
            </Link>
          </div>
          <div className="explore-grid" style={{ paddingTop: '8px' }}>
            {regions.slice(0, 9).map(region => (
              <RegionMapCard key={region.id} region={region} />
            ))}
          </div>
        </section>

        {/* Collections */}
        {collections.length > 0 && (
          <section style={{ marginBottom: '3.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.35rem',
                  color: 'var(--color-ink)', margin: 0,
                }}>
                  Collections
                </h2>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                  marginTop: '0.25rem',
                }}>
                  Curated guides assembled by our editors
                </p>
              </div>
              <Link href="/collections" style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                All collections &rarr;
              </Link>
            </div>
            <div className="explore-collections">
              {collections.map(c => (
                <Link key={c.id} href={`/collections/${c.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: '#0f0e0c', borderRadius: 4, padding: '1.5rem',
                    border: '1px solid var(--color-border)',
                    minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '8px', fontWeight: 500,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'rgba(240,236,228,0.45)', marginBottom: '0.5rem',
                    }}>
                      {c.listing_ids?.length || 0} places{c.region ? ` · ${c.region}` : ''}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 400,
                      color: '#f0ece4', lineHeight: 1.3, margin: 0,
                    }}>
                      {c.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Browse by Category */}
        <section style={{ marginBottom: '3.5rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.35rem',
              color: 'var(--color-ink)', margin: 0,
            }}>
              Browse by category
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
              marginTop: '0.25rem',
            }}>
              Nine directories, each dedicated to a corner of Australian culture
            </p>
          </div>
          <div className="explore-verticals">
            {VERTICAL_ORDER.map(key => {
              const info = VERTICAL_INFO[key]
              const vs = VERTICAL_STYLES[key]
              return (
                <div key={key} className="explore-vertical-card" style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1rem 1.25rem', borderRadius: 4,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card-bg, #fff)',
                  transition: 'box-shadow 0.2s',
                }}>
                  <div style={{
                    width: 6, height: 36, borderRadius: 3, flexShrink: 0,
                    background: vs?.text || '#5F5E5A',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 400,
                      color: 'var(--color-ink)',
                    }}>
                      {info.name}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)',
                      marginTop: '2px',
                    }}>
                      {info.desc}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                    <Link href={`/search?vertical=${key}`} style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
                      color: vs?.text || 'var(--color-accent)', textDecoration: 'none',
                    }}>
                      Browse
                    </Link>
                    <a href={info.url} target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 300,
                      color: 'var(--color-muted)', textDecoration: 'none',
                    }}>
                      Site &#x2197;
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Journal */}
        {articles.length > 0 && (
          <section style={{ marginBottom: '3.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.35rem',
                  color: 'var(--color-ink)', margin: 0,
                }}>
                  From the Journal
                </h2>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                  marginTop: '0.25rem',
                }}>
                  Stories from across the network
                </p>
              </div>
              <Link href="/journal" style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                All articles &rarr;
              </Link>
            </div>
            <div className="explore-articles">
              {articles.map(article => (
                <Link key={article.id} href={articleUrl(article)} style={{ textDecoration: 'none' }}>
                  <div className="explore-article-card" style={{
                    borderRadius: 4, overflow: 'hidden',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-card-bg, #fff)',
                    transition: 'border-color 0.2s',
                  }}>
                    {article.hero_image_url && (
                      <div style={{ aspectRatio: '16/9', overflow: 'hidden', background: '#1c1a17' }}>
                        <img src={article.hero_image_url} alt="" style={{
                          width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9,
                        }} />
                      </div>
                    )}
                    <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
                      {article.published_at && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '11px',
                          color: 'var(--color-muted)', marginBottom: '0.375rem',
                        }}>
                          {new Date(article.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 400,
                        color: 'var(--color-ink)', lineHeight: 1.3, margin: 0,
                      }}>
                        {article.title}
                      </h3>
                      {article.excerpt && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: '13px',
                          color: 'var(--color-muted)', lineHeight: 1.6,
                          marginTop: '0.5rem',
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Browse by State */}
        <section>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.35rem',
              color: 'var(--color-ink)', margin: 0,
            }}>
              Browse by state
            </h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {Object.entries(STATE_LABELS).map(([code, label]) => (
              <Link key={code} href={`/regions?state=${code}`} style={{
                display: 'inline-block', padding: '0.5rem 1.25rem',
                border: '1px solid var(--color-border)', borderRadius: 2,
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 400,
                color: 'var(--color-ink)', textDecoration: 'none',
                transition: 'border-color 0.2s',
              }}>
                {label}
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
