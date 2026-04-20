import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

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

function articleUrl(a) {
  const v = (a.verticals?.[0]) || a.vertical || 'sba'
  return `${VERTICAL_JOURNAL_URLS[v] || VERTICAL_JOURNAL_URLS.sba}/${a.slug}`
}

export async function RelatedCollections({ region, vertical, limit = 3, excludeSlug }) {
  const sb = getSupabaseAdmin()
  let query = sb
    .from('collections')
    .select('id, title, slug, description, listing_ids, region')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(limit + (excludeSlug ? 1 : 0))

  if (region) query = query.ilike('region', `%${region}%`)
  else if (vertical) query = query.eq('vertical', vertical)

  let { data: collections } = await query
  if (!collections || collections.length === 0) return null

  if (excludeSlug) {
    collections = collections.filter(c => c.slug !== excludeSlug).slice(0, limit)
    if (collections.length === 0) return null
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '2rem', marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.15rem',
          color: 'var(--color-ink)', margin: 0,
        }}>
          {region ? `Collections from ${region}` : 'Related Collections'}
        </h3>
        <Link href="/collections" style={{
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
          color: 'var(--color-accent)', textDecoration: 'none',
        }}>
          All collections &rarr;
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {collections.map(c => (
          <Link key={c.id} href={`/collections/${c.slug}`} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.875rem 1.125rem', borderRadius: 3,
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg, #fff)',
              transition: 'border-color 0.2s',
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 400,
                  color: 'var(--color-ink)', lineHeight: 1.3,
                }}>
                  {c.title}
                </div>
                {c.description && (
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '12px',
                    color: 'var(--color-muted)', marginTop: '2px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '40ch',
                  }}>
                    {c.description}
                  </div>
                )}
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '11px',
                color: 'var(--color-muted)', flexShrink: 0,
              }}>
                {c.listing_ids?.length || 0} places
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export async function RelatedArticles({ regionName, vertical, limit = 3 }) {
  const sb = getSupabaseAdmin()
  let query = sb
    .from('articles')
    .select('id, title, slug, excerpt, published_at, hero_image_url, vertical, verticals')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (regionName) query = query.contains('region_tags', [regionName])
  else if (vertical) query = query.contains('verticals', [vertical])

  const { data: articles } = await query
  if (!articles || articles.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '2rem', marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.15rem',
          color: 'var(--color-ink)', margin: 0,
        }}>
          {regionName ? `From the Journal` : 'Related Articles'}
        </h3>
        <Link href="/journal" style={{
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
          color: 'var(--color-accent)', textDecoration: 'none',
        }}>
          All articles &rarr;
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {articles.map(a => (
          <Link key={a.id} href={articleUrl(a)} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '0.875rem 1.125rem', borderRadius: 3,
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg, #fff)',
              transition: 'border-color 0.2s',
            }}>
              {a.hero_image_url && (
                <div style={{
                  width: 56, height: 56, borderRadius: 3, overflow: 'hidden',
                  flexShrink: 0, background: '#1c1a17',
                }}>
                  <img src={a.hero_image_url} alt="" style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 400,
                  color: 'var(--color-ink)', lineHeight: 1.3,
                }}>
                  {a.title}
                </div>
                {a.published_at && (
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '11px',
                    color: 'var(--color-muted)', marginTop: '3px',
                  }}>
                    {new Date(a.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
