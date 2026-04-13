import { getSupabaseAdmin } from '@/lib/supabase/clients'
import SocialQueueActions, { BulkApproveAllButton } from './SocialQueueActions'

export const metadata = { title: 'Social Queue — Admin' }
export const dynamic = 'force-dynamic'

export default async function SocialQueuePage() {
  const sb = getSupabaseAdmin()

  const { data: pendingItems } = await sb
    .from('content_recycling')
    .select('id, article_title, social_posts, pull_quotes, follow_up_angles, newsletter_excerpt, status, created_at')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })

  const { data: approvedItems } = await sb
    .from('content_recycling')
    .select('id, article_title, social_posts, approved_at')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(20)

  const pending = pendingItems || []
  const approved = approvedItems || []

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Social Queue
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          AI-generated social posts, newsletter excerpts, pull quotes, and follow-up angles from published articles.
        </p>
      </div>

      {/* Tabs: Pending / Approved */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#FCE4B8', textAlign: 'center', minWidth: 120 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{pending.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Pending Review</p>
        </div>
        <div style={{ padding: '14px 20px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center', minWidth: 120 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#166534', margin: 0 }}>{approved.length}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>Approved</p>
        </div>
      </div>

      {pending.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <BulkApproveAllButton ids={pending.map(p => p.id)} />
        </div>
      )}

      {/* Pending articles */}
      {pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', border: '1px dashed var(--color-border, #e5e5e5)', borderRadius: 8, marginBottom: 32 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>No content packages pending review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, marginBottom: 32 }}>
          {pending.map(item => {
            const posts = Array.isArray(item.social_posts) ? item.social_posts : []
            const quotes = Array.isArray(item.pull_quotes) ? item.pull_quotes : []
            const angles = Array.isArray(item.follow_up_angles) ? item.follow_up_angles : []

            return (
              <div key={item.id} style={{ padding: '24px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff' }}>
                {/* Article header */}
                <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 18, color: 'var(--color-ink)', margin: '0 0 16px' }}>
                  {item.article_title}
                </h3>

                {/* Social posts — 3 across */}
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 8px', fontWeight: 600 }}>
                    Social Posts
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                    {posts.map((post, i) => (
                      <div key={i} style={{ padding: '12px 16px', borderRadius: 6, background: '#f8f6f0', border: '1px solid #e8e4da' }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C49A3C', margin: '0 0 6px', fontWeight: 600 }}>
                          {post.angle || `Post ${i + 1}`}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
                          {post.text || post}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Newsletter excerpt */}
                {item.newsletter_excerpt && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 8px', fontWeight: 600 }}>
                      Newsletter Excerpt
                    </p>
                    <div style={{ padding: '12px 16px', borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'var(--color-ink)', margin: 0 }}>
                        {item.newsletter_excerpt}
                      </p>
                    </div>
                  </div>
                )}

                {/* Pull quotes */}
                {quotes.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 8px', fontWeight: 600 }}>
                      Pull Quotes
                    </p>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {quotes.map((q, i) => (
                        <div key={i} style={{ padding: '8px 14px', borderLeft: '3px solid #C49A3C', background: '#faf8f4' }}>
                          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
                            &ldquo;{typeof q === 'string' ? q : q.text || JSON.stringify(q)}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up angles */}
                {angles.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7a5a', margin: '0 0 8px', fontWeight: 600 }}>
                      Follow-up Angles
                    </p>
                    {angles.map((angle, i) => (
                      <div key={i} style={{ padding: '8px 14px', borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb', marginBottom: 6 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 2px' }}>
                          {angle.title}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: 0 }}>
                          {angle.pitch}
                          {angle.interview_subject ? ` — Interview: ${angle.interview_subject}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <SocialQueueActions item={item} />
              </div>
            )
          })}
        </div>
      )}

      {/* Approved section */}
      {approved.length > 0 && (
        <>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 12px' }}>
            Approved
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {approved.map(item => (
              <div key={item.id} style={{ padding: '12px 20px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>
                  {item.article_title}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  {item.approved_at ? new Date(item.approved_at).toLocaleDateString('en-AU') : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
