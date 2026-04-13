import { getSupabaseAdmin } from '@/lib/supabase/clients'
import SeoContentActions, { BulkPublishButton } from './SeoContentActions'

export const metadata = { title: 'SEO Content — Admin' }
export const dynamic = 'force-dynamic'

export default async function SeoContentPage() {
  const sb = getSupabaseAdmin()

  // Fetch draft and published pages
  const { data: drafts } = await sb
    .from('seo_pages')
    .select('id, slug, title, query, location, category, listing_ids, quality_score, content, meta_title, meta_description, status, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  const { data: published } = await sb
    .from('seo_pages')
    .select('id, slug, title, query, location, category, listing_ids, published_at, quality_score')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  const draftItems = drafts || []
  const publishedItems = published || []
  const draftIds = draftItems.map(p => p.id)

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          SEO Content Pages
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          AI-generated regional guide pages targeting high-intent search queries. Review and publish.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
            {draftItems.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Drafts
          </p>
        </div>
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#166534', margin: 0 }}>
            {publishedItems.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Published
          </p>
        </div>
      </div>

      {/* Bulk publish */}
      {draftItems.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <BulkPublishButton pageIds={draftIds} />
        </div>
      )}

      {/* Draft pages */}
      <h2 style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-muted)',
        margin: '0 0 16px',
      }}>
        Drafts
      </h2>

      {draftItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
          marginBottom: 32,
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            No draft pages. The SEO agent runs weekly to generate new content.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
          {draftItems.map(page => (
            <div
              key={page.id}
              style={{
                padding: '20px 24px',
                borderRadius: 8,
                border: '1px solid var(--color-border, #e5e5e5)',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: 16,
                    color: 'var(--color-ink)',
                    margin: '0 0 4px',
                  }}>
                    {page.title}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--color-muted)',
                    margin: 0,
                  }}>
                    Target query: <strong>{page.query}</strong>
                    {page.location ? ` · ${page.location}` : ''}
                    {page.category ? ` · ${page.category}` : ''}
                    {` · ${page.listing_ids?.length || 0} listings`}
                    {` · ${page.quality_score || 0} words`}
                  </p>
                </div>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--color-muted)',
                }}>
                  /seo/{page.slug}
                </span>
              </div>

              {/* Content preview */}
              <div style={{
                padding: '12px 16px',
                borderRadius: 6,
                background: '#f8f6f0',
                border: '1px solid #e8e4da',
                marginBottom: 12,
                maxHeight: 200,
                overflow: 'auto',
              }}>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--color-ink)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>
                  {page.content}
                </p>
              </div>

              {/* Meta preview */}
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                marginBottom: 12,
              }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 4px' }}>
                  Meta Preview
                </p>
                <p style={{ fontFamily: 'sans-serif', fontSize: 14, color: '#1a0dab', margin: '0 0 2px', fontWeight: 500 }}>
                  {page.meta_title}
                </p>
                <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#4d5156', margin: 0 }}>
                  {page.meta_description}
                </p>
              </div>

              <SeoContentActions page={page} />
            </div>
          ))}
        </div>
      )}

      {/* Published pages */}
      {publishedItems.length > 0 && (
        <>
          <h2 style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 14,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-muted)',
            margin: '0 0 16px',
          }}>
            Published
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {publishedItems.map(page => (
              <div
                key={page.id}
                style={{
                  padding: '12px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
                    {page.title}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginLeft: 12 }}>
                    {page.listing_ids?.length || 0} listings
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                    Published {page.published_at ? new Date(page.published_at).toLocaleDateString('en-AU') : ''}
                  </span>
                  <a
                    href={`/seo/${page.slug}`}
                    target="_blank"
                    rel="noopener"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '4px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--color-border, #e5e5e5)',
                      color: 'var(--color-ink)',
                      textDecoration: 'none',
                    }}
                  >
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
