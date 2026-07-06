import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { VERTICAL_STYLES } from '@/lib/verticalStyles'
import RegionMapCard from '@/components/RegionMapCard'
import { isVerticalPublic } from '@/lib/verticalUrl'
import { dateLocale, ogLocale } from '@/lib/i18n/config'

export const revalidate = 3600

const SITE_URL = 'https://www.australianatlas.com.au'

// Curated explore ordering (sba + coffee lead), filtered through the go-live
// gate so gated verticals (e.g. Way) drop out of the grid and count until launch.
const VERTICAL_ORDER = ['sba', 'fine_grounds', 'collection', 'craft', 'rest', 'field', 'corner', 'found', 'table', 'way']
const PUBLIC_VERTICAL_ORDER = VERTICAL_ORDER.filter(isVerticalPublic)

const COUNT_WORDS = { 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' }
const countWord = COUNT_WORDS[PUBLIC_VERTICAL_ORDER.length] || String(PUBLIC_VERTICAL_ORDER.length)
const CountWord = countWord.charAt(0).toUpperCase() + countWord.slice(1)
const EXPLORE_DESCRIPTION = `Discover independent Australia. Browse regions, curated collections, and ${countWord} directories of makers, producers, stays, and places worth the drive.`

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
  way: { name: 'Way', desc: 'Guided walks, tours and adventure experiences', url: 'https://wayatlas.com.au' },
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
  way: 'https://wayatlas.com.au/journal',
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

const EXPLORE_DESCRIPTION_KO = `독립적인 오스트레일리아를 발견하세요. 지역, 큐레이션 컬렉션, 그리고 메이커·생산자·숙소·찾아갈 가치가 있는 장소들의 ${PUBLIC_VERTICAL_ORDER.length}개 디렉터리를 둘러보세요.`

const EXPLORE_DESCRIPTION_ZH = `发现独立的澳大利亚。浏览各个地区、精选合集，以及 ${PUBLIC_VERTICAL_ORDER.length} 个汇集匠人、生产者、住宿与值得驱车前往之地的目录。`

export async function generateMetadata() {
  const locale = await getLocale()
  const title = {
    en: 'Explore — Australian Atlas',
    ko: '둘러보기 — 오스트레일리안 아틀라스',
    zh: '探索 — Australian Atlas',
  }[locale] || 'Explore — Australian Atlas'
  const description = {
    en: EXPLORE_DESCRIPTION,
    ko: EXPLORE_DESCRIPTION_KO,
    zh: EXPLORE_DESCRIPTION_ZH,
  }[locale] || EXPLORE_DESCRIPTION
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/explore`,
      siteName: 'Australian Atlas',
      locale: ogLocale(locale),
      type: 'website',
    },
    alternates: { canonical: `${SITE_URL}/explore` },
  }
}

export default async function ExplorePage() {
  const sb = getSupabaseAdmin()
  const t = await getTranslations('explore')
  const locale = await getLocale()

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
          <p className="section-dateline" style={{ marginBottom: '14px' }}>
            {t('kicker')}
          </p>
          <h1 className="masthead-title" style={{ margin: 0 }}>
            {t('heroTitle')}
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            color: 'var(--color-muted)', marginTop: '0.625rem',
            maxWidth: '36rem', lineHeight: 1.6,
          }}>
            {t('heroSubtitle', { count: countWord })}
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
                {t('regionsTitle')}
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                marginTop: '0.25rem',
              }}>
                {t('regionsSubtitle')}
              </p>
            </div>
            <Link href="/regions" style={{
              fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-accent)', textDecoration: 'none',
            }}>
              {t('allRegions')} &rarr;
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
                  {t('collectionsTitle')}
                </h2>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                  marginTop: '0.25rem',
                }}>
                  {t('collectionsSubtitle')}
                </p>
              </div>
              <Link href="/collections" style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                {t('allCollections')} &rarr;
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
                      {t('countPlaces', { count: c.listing_ids?.length || 0 })}{c.region ? ` · ${c.region}` : ''}
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
              {t('categoryTitle')}
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
              marginTop: '0.25rem',
            }}>
              {t('categorySubtitle', { count: PUBLIC_VERTICAL_ORDER.length, countWord: CountWord })}
            </p>
          </div>
          <div className="explore-verticals">
            {PUBLIC_VERTICAL_ORDER.map(key => {
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
                      {t(`vertical_${key}_name`)}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)',
                      marginTop: '2px',
                    }}>
                      {t(`vertical_${key}_desc`)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                    <Link href={`/search?vertical=${key}`} style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
                      color: vs?.text || 'var(--color-accent)', textDecoration: 'none',
                    }}>
                      {t('browse')}
                    </Link>
                    <a href={info.url} target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 300,
                      color: 'var(--color-muted)', textDecoration: 'none',
                    }}>
                      {t('site')} &#x2197;
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
                  {t('journalTitle')}
                </h2>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-muted)',
                  marginTop: '0.25rem',
                }}>
                  {t('journalSubtitle')}
                </p>
              </div>
              <Link href="/journal" style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                {t('allArticles')} &rarr;
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
                          {new Date(article.published_at).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' })}
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
              {t('stateTitle')}
            </h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {Object.keys(STATE_LABELS).map((code) => (
              <Link key={code} href={`/regions?state=${code}`} style={{
                display: 'inline-block', padding: '0.5rem 1.25rem',
                border: '1px solid var(--color-border)', borderRadius: 2,
                fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 400,
                color: 'var(--color-ink)', textDecoration: 'none',
                transition: 'border-color 0.2s',
              }}>
                {t(`state_${code}`)}
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
