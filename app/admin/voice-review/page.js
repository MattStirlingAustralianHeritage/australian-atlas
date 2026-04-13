import { getSupabaseAdmin } from '@/lib/supabase/clients'
import VoiceReviewActions from './VoiceReviewActions'

export const metadata = { title: 'Voice Review — Admin' }
export const dynamic = 'force-dynamic'

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

function scoreColor(score) {
  if (score < 4) return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
  if (score <= 6) return { bg: '#fffbeb', text: '#d97706', border: '#fde68a' }
  return { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' }
}

export default async function VoiceReviewPage() {
  const sb = getSupabaseAdmin()

  // ── Fetch evaluations needing review ──────────────────────
  const { data: evaluations, error } = await sb
    .from('description_evaluations')
    .select('id, listing_id, evaluated_at, score, issues, rewrite_priority, suggested_rewrite')
    .eq('actioned', false)
    .in('rewrite_priority', ['high', 'medium'])
    .order('score', { ascending: true })

  const evals = evaluations || []

  // ── Fetch listing details for each evaluation ─────────────
  const listingIds = [...new Set(evals.map(e => e.listing_id))]
  let listingsMap = {}

  if (listingIds.length > 0) {
    const { data: listings } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, description')
      .in('id', listingIds)

    if (listings) {
      for (const l of listings) {
        listingsMap[l.id] = l
      }
    }
  }

  // ── Calculate network voice score + trend ─────────────────
  const now = new Date()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentEvals } = await sb
    .from('description_evaluations')
    .select('score, evaluated_at')
    .gte('evaluated_at', fourteenDaysAgo)

  let currentAvg = null
  let previousAvg = null

  if (recentEvals && recentEvals.length > 0) {
    const thisWeek = recentEvals.filter(e => e.evaluated_at >= sevenDaysAgo)
    const lastWeek = recentEvals.filter(e => e.evaluated_at < sevenDaysAgo)

    if (thisWeek.length > 0) {
      currentAvg = Math.round((thisWeek.reduce((a, b) => a + b.score, 0) / thisWeek.length) * 10) / 10
    }
    if (lastWeek.length > 0) {
      previousAvg = Math.round((lastWeek.reduce((a, b) => a + b.score, 0) / lastWeek.length) * 10) / 10
    }
  }

  let trendText = null
  if (currentAvg !== null && previousAvg !== null) {
    const diff = Math.round((currentAvg - previousAvg) * 10) / 10
    if (diff > 0) trendText = `+${diff} from last week`
    else if (diff < 0) trendText = `${diff} from last week`
    else trendText = 'Unchanged'
  }

  // ── Count by priority ─────────────────────────────────────
  const highCount = evals.filter(e => e.rewrite_priority === 'high').length
  const mediumCount = evals.filter(e => e.rewrite_priority === 'medium').length

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
          Voice Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Descriptions flagged for voice inconsistency. Review, accept rewrites, or dismiss.
        </p>
      </div>

      {/* Summary badges */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 24,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Network score */}
        {currentAvg !== null && (
          <div style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: scoreColor(currentAvg).bg,
            border: `1px solid ${scoreColor(currentAvg).border}`,
            textAlign: 'center',
            minWidth: 130,
          }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 400,
              color: scoreColor(currentAvg).text,
              margin: 0,
            }}>
              {currentAvg}/10
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted)',
              margin: '4px 0 0',
            }}>
              Network Score
            </p>
            {trendText && (
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: trendText.startsWith('+') ? '#16a34a' : trendText.startsWith('-') ? '#dc2626' : 'var(--color-muted)',
                margin: '2px 0 0',
              }}>
                {trendText}
              </p>
            )}
          </div>
        )}

        {/* Pending review count */}
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--color-ink)',
            margin: 0,
          }}>
            {evals.length}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-muted)',
            margin: '4px 0 0',
          }}>
            Pending Review
          </p>
        </div>

        {/* High priority */}
        {highCount > 0 && (
          <div style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            textAlign: 'center',
            minWidth: 100,
          }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 400,
              color: '#dc2626',
              margin: 0,
            }}>
              {highCount}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted)',
              margin: '4px 0 0',
            }}>
              High Priority
            </p>
          </div>
        )}

        {/* Medium priority */}
        {mediumCount > 0 && (
          <div style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            textAlign: 'center',
            minWidth: 100,
          }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 400,
              color: '#d97706',
              margin: 0,
            }}>
              {mediumCount}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-muted)',
              margin: '4px 0 0',
            }}>
              Medium Priority
            </p>
          </div>
        )}
      </div>

      {/* Evaluation cards */}
      {evals.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            No descriptions awaiting voice review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {evals.map(evaluation => {
            const listing = listingsMap[evaluation.listing_id] || {}
            const sc = scoreColor(evaluation.score)
            const vertColor = VERT_COLORS[listing.vertical] || '#888'

            return (
              <div
                key={evaluation.id}
                style={{
                  padding: '20px 24px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                }}
              >
                {/* Name, vertical badge, score pill */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 8,
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a
                      href={`/place/${listing.slug || ''}`}
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontWeight: 600,
                        fontSize: 15,
                        color: 'var(--color-ink)',
                        textDecoration: 'none',
                      }}
                    >
                      {listing.name || 'Unknown listing'}
                    </a>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: vertColor,
                      background: vertColor + '18',
                      padding: '2px 8px',
                      borderRadius: 100,
                      whiteSpace: 'nowrap',
                    }}>
                      {VERT_NAMES[listing.vertical] || listing.vertical || ''}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: evaluation.rewrite_priority === 'high' ? '#dc2626' : '#d97706',
                      background: evaluation.rewrite_priority === 'high' ? '#fef2f2' : '#fffbeb',
                      padding: '2px 8px',
                      borderRadius: 100,
                      whiteSpace: 'nowrap',
                    }}>
                      {evaluation.rewrite_priority}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: 13,
                    color: sc.text,
                    background: sc.bg,
                    border: `1px solid ${sc.border}`,
                    padding: '2px 12px',
                    borderRadius: 100,
                    whiteSpace: 'nowrap',
                  }}>
                    {evaluation.score}/10
                  </span>
                </div>

                {/* Current description */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-muted)',
                    margin: '0 0 4px',
                  }}>
                    Current description
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 300,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: listing.description ? 'var(--color-ink)' : '#bbb',
                    margin: 0,
                    fontStyle: listing.description ? 'normal' : 'italic',
                  }}>
                    {listing.description || '(empty)'}
                  </p>
                </div>

                {/* Issues */}
                {evaluation.issues && evaluation.issues.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#dc2626',
                      margin: '0 0 4px',
                    }}>
                      Issues
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--color-muted)',
                    }}>
                      {evaluation.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested rewrite */}
                {evaluation.suggested_rewrite && (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    background: '#f8f6f0',
                    border: '1px solid #e8e4da',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#4A7C59',
                      margin: '0 0 4px',
                    }}>
                      Suggested rewrite
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 400,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: 'var(--color-ink)',
                      margin: 0,
                    }}>
                      {evaluation.suggested_rewrite}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <VoiceReviewActions
                  evaluationId={evaluation.id}
                  suggestedRewrite={evaluation.suggested_rewrite || ''}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
