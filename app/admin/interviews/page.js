import { getSupabaseAdmin } from '@/lib/supabase/clients'
import InterviewPreview from './InterviewPreview'

export const metadata = { title: 'Interviews — Admin' }
export const dynamic = 'force-dynamic'

function formatDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export default async function InterviewsPage() {
  const sb = getSupabaseAdmin()

  const { data: interviews, error } = await sb
    .from('interviews')
    .select(`
      id, subject, slug, listing_id, author, published, published_at,
      created_at, questions, answers,
      listings ( name, vertical )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink)',
        }}>
          Interviews
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, color: '#991b1b',
          marginTop: 12,
        }}>
          Failed to load interviews: {error.message}
        </p>
      </div>
    )
  }

  const rows = interviews || []

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
            color: 'var(--color-ink)', margin: 0,
          }}>
            Interviews
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)',
            margin: '4px 0 0',
          }}>
            Manage interview content across the Atlas network.
          </p>
        </div>
        <button
          disabled
          style={{
            padding: '10px 20px', background: 'var(--color-border, #e5e5e5)',
            color: 'var(--color-muted)', border: 'none', borderRadius: 6,
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: 'not-allowed', letterSpacing: '0.03em', opacity: 0.7,
          }}
        >
          Add Interview
        </button>
      </div>

      {/* Interview list */}
      {rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: '#fff', borderRadius: 8,
          border: '1px solid var(--color-border, #e5e5e5)',
        }}>
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: 20,
            color: 'var(--color-ink)', marginBottom: 8,
          }}>
            No interviews recorded yet.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14,
            color: 'var(--color-muted)',
          }}>
            Interviews will appear here once they are created.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(interview => {
            const listing = interview.listings
            const questionCount = Array.isArray(interview.questions) ? interview.questions.length : 0
            const verticalKey = listing?.vertical
            const verticalColor = VERTICAL_COLORS[verticalKey] || '#888'

            return (
              <div
                key={interview.id}
                style={{
                  background: '#fff',
                  border: '1px solid var(--color-border, #e5e5e5)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* Row header */}
                <div style={{
                  padding: '16px 20px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 16,
                  alignItems: 'start',
                }}>
                  <div style={{ minWidth: 0 }}>
                    {/* Subject */}
                    <h3 style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15,
                      color: 'var(--color-ink)', margin: '0 0 4px',
                    }}>
                      {interview.subject || 'Untitled Interview'}
                    </h3>

                    {/* Listing + vertical badge */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 6, flexWrap: 'wrap',
                    }}>
                      {listing?.name && (
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: 13,
                          color: 'var(--color-muted)',
                        }}>
                          {listing.name}
                        </span>
                      )}
                      {verticalKey && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 10,
                          fontWeight: 700, fontFamily: 'var(--font-body)',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: '#fff', background: verticalColor,
                        }}>
                          {verticalKey}
                        </span>
                      )}
                    </div>

                    {/* Meta row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      flexWrap: 'wrap',
                    }}>
                      {interview.author && (
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--color-muted)',
                        }}>
                          by {interview.author}
                        </span>
                      )}

                      {/* Published dot */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontFamily: 'var(--font-body)', fontSize: 11,
                        color: interview.published ? '#166534' : 'var(--color-muted)',
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: interview.published ? '#22c55e' : '#d1d5db',
                          flexShrink: 0,
                        }} />
                        {interview.published ? 'Published' : 'Draft'}
                      </span>

                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: 11,
                        color: 'var(--color-muted)',
                      }}>
                        {questionCount} question{questionCount !== 1 ? 's' : ''}
                      </span>

                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: 11,
                        color: 'var(--color-muted)',
                      }}>
                        {formatDate(interview.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expandable Q&A preview */}
                <InterviewPreview interview={{
                  id: interview.id,
                  subject: interview.subject,
                  questions: interview.questions || [],
                  answers: interview.answers || [],
                  published: interview.published,
                }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
