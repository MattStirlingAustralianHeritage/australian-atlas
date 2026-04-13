import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ErrorActions from './ErrorActions'

export const metadata = { title: 'Error Monitoring — Admin' }
export const dynamic = 'force-dynamic'

export default async function ErrorsPage() {
  const sb = getSupabaseAdmin()

  const { data: errors, error: fetchError } = await sb
    .from('client_errors')
    .select('id, route, error_message, error_stack, user_agent, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (fetchError) {
    return (
      <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink)',
        }}>
          Error Monitoring
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14, color: '#991b1b',
          marginTop: 12,
        }}>
          Failed to load errors: {fetchError.message}
        </p>
      </div>
    )
  }

  const rows = errors || []

  // Compute summary stats
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

  const last24h = rows.filter(e => new Date(e.created_at).getTime() > oneDayAgo).length
  const last7d = rows.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo).length

  // Group by route for summary
  const routeCounts = {}
  for (const e of rows) {
    const r = e.route || '(unknown)'
    routeCounts[r] = (routeCounts[r] || 0) + 1
  }

  const sortedRoutes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])
  const mostCommonRoute = sortedRoutes.length > 0 ? sortedRoutes[0] : null

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
            color: 'var(--color-ink)', margin: 0,
          }}>
            Error Monitoring
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)',
            margin: '4px 0 0',
          }}>
            Client-side error reports from across the Atlas network.
          </p>
        </div>
        <ErrorActions />
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <SummaryCard label="Last 24 hours" value={last24h} color={last24h > 10 ? '#991b1b' : '#166534'} />
        <SummaryCard label="Last 7 days" value={last7d} color={last7d > 50 ? '#991b1b' : '#92400e'} />
        {mostCommonRoute && (
          <div style={{
            flex: '1 1 200px', padding: '14px 18px',
            background: '#fff', border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: 8,
          }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--color-muted)', margin: '0 0 4px',
            }}>
              Most common route
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
              color: 'var(--color-ink)', margin: 0,
            }}>
              {mostCommonRoute[0]}{' '}
              <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: 12 }}>
                ({mostCommonRoute[1]} errors)
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Route breakdown */}
      {sortedRoutes.length > 1 && (
        <div style={{
          marginBottom: 24, padding: '14px 18px',
          background: '#fff', border: '1px solid var(--color-border, #e5e5e5)',
          borderRadius: 8,
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-muted)', margin: '0 0 10px',
          }}>
            Errors by route
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sortedRoutes.map(([route, count]) => (
              <span key={route} style={{
                padding: '4px 10px', borderRadius: 4,
                background: '#f9fafb', border: '1px solid var(--color-border, #e5e5e5)',
                fontFamily: 'var(--font-body)', fontSize: 12,
                color: 'var(--color-ink)',
              }}>
                <span style={{ fontWeight: 500 }}>{route}</span>{' '}
                <span style={{ color: 'var(--color-muted)' }}>({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error table */}
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
            No errors recorded.
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14,
            color: 'var(--color-muted)',
          }}>
            Client errors will appear here when they are reported.
          </p>
        </div>
      ) : (
        <ErrorTable errors={rows} />
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      flex: '0 0 auto', padding: '14px 18px',
      background: '#fff', border: '1px solid var(--color-border, #e5e5e5)',
      borderRadius: 8, minWidth: 120,
    }}>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--color-muted)', margin: '0 0 4px',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700,
        color, margin: 0,
      }}>
        {value}
      </p>
    </div>
  )
}

function ErrorTable({ errors }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--color-border, #e5e5e5)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'var(--font-body)', fontSize: 12,
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border, #e5e5e5)' }}>
            <th style={thStyle}>Timestamp</th>
            <th style={thStyle}>Route</th>
            <th style={thStyle}>Error Message</th>
            <th style={{ ...thStyle, width: 60 }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {errors.map(err => (
            <ErrorRow key={err.id} error={err} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorRow({ error }) {
  const truncated = error.error_message && error.error_message.length > 100
    ? error.error_message.slice(0, 100) + '...'
    : error.error_message || '(no message)'

  const timestamp = new Date(error.created_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  // This is a server component, so we render the expandable details via the
  // client ErrorActions component's ErrorDetailRow. For the server table,
  // we use the <details> HTML element for zero-JS expansion.
  return (
    <>
      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
        <td style={tdStyle}>
          <span style={{ whiteSpace: 'nowrap' }}>{timestamp}</span>
        </td>
        <td style={tdStyle}>
          <span style={{
            padding: '2px 6px', borderRadius: 3, background: '#f3f4f6',
            fontSize: 11, fontFamily: 'monospace',
          }}>
            {error.route || '--'}
          </span>
        </td>
        <td style={{ ...tdStyle, maxWidth: 400 }}>
          <span style={{ color: '#991b1b' }}>{truncated}</span>
        </td>
        <td style={tdStyle}>
          <details>
            <summary style={{
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 11, color: 'var(--color-muted)', fontWeight: 500,
              listStyle: 'none',
            }}>
              Expand
            </summary>
            <div style={{
              marginTop: 8, padding: 12, background: '#f9fafb',
              borderRadius: 6, fontSize: 11,
            }}>
              <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--color-ink)' }}>
                Full message:
              </p>
              <p style={{ margin: '0 0 10px', color: '#991b1b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {error.error_message || '(no message)'}
              </p>

              {error.error_stack && (
                <>
                  <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--color-ink)' }}>
                    Stack trace:
                  </p>
                  <pre style={{
                    margin: 0, padding: 8, background: '#1f2937', color: '#e5e7eb',
                    borderRadius: 4, fontSize: 10, overflow: 'auto',
                    maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {error.error_stack}
                  </pre>
                </>
              )}

              {error.user_agent && (
                <p style={{
                  margin: '10px 0 0', fontSize: 10,
                  color: 'var(--color-muted)', wordBreak: 'break-word',
                }}>
                  UA: {error.user_agent}
                </p>
              )}
            </div>
          </details>
        </td>
      </tr>
    </>
  )
}

const thStyle = {
  textAlign: 'left', padding: '8px 12px', fontWeight: 500,
  color: 'var(--color-muted)', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const tdStyle = {
  padding: '8px 12px', color: 'var(--color-ink)', verticalAlign: 'top',
}
