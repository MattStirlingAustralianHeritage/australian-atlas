import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

export default async function InsightsPage() {
  // Auth handled by middleware — no page-level check needed

  // ── Queries ────────────────────────────────────────────────────────
  const sb = getSupabaseAdmin()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let searchRows = []
  let trailRows = []

  try {
    // Supabase JS doesn't support GROUP BY, so we fetch raw rows and aggregate in JS
    const [searchRes, trailRes] = await Promise.all([
      sb.from('search_logs').select('query_text, result_count').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(5000),
      sb.from('trail_logs').select('prompt_text, region_detected').gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(5000),
    ])
    if (!searchRes.error && searchRes.data) searchRows = searchRes.data
    if (!trailRes.error && trailRes.data) trailRows = trailRes.data
  } catch (err) {
    console.error('[admin/insights] Query error:', err.message)
    // Continue with empty state rather than crashing
  }

  // ── Aggregate search data ──────────────────────────────────────────
  const searchCounts = {}
  const zeroResultCounts = {}
  for (const row of (searchRows || [])) {
    const q = (row.query_text || '').toLowerCase().trim()
    if (!q) continue
    searchCounts[q] = (searchCounts[q] || 0) + 1
    if (row.result_count === 0) {
      zeroResultCounts[q] = (zeroResultCounts[q] || 0) + 1
    }
  }

  const topSearchList = Object.entries(searchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  const zeroResultList = Object.entries(zeroResultCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  // ── Aggregate trail data ───────────────────────────────────────────
  const trailCounts = {}
  const regionCounts = {}
  for (const row of (trailRows || [])) {
    const p = (row.prompt_text || '').toLowerCase().trim()
    if (p) trailCounts[p] = (trailCounts[p] || 0) + 1
    const r = (row.region_detected || '').trim()
    if (r) regionCounts[r] = (regionCounts[r] || 0) + 1
  }

  const topTrailList = Object.entries(trailCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  const topRegionList = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  // ── Styles (matching Atlas admin pattern) ──────────────────────────
  const styles = {
    page: {
      minHeight: '100vh',
      background: 'var(--color-cream, #FAF8F5)',
      padding: '3rem 1.5rem',
    },
    container: { maxWidth: '960px', margin: '0 auto' },
    heading: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '1.75rem',
      fontWeight: 600,
      color: 'var(--color-ink, #2D2A26)',
      margin: '0 0 0.25rem',
    },
    subtitle: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.9rem',
      color: 'var(--color-muted, #888)',
      margin: 0,
    },
    card: {
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border, #e5e5e5)',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    },
    sectionTitle: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '1.1rem',
      fontWeight: 600,
      color: 'var(--color-ink, #2D2A26)',
      margin: '0 0 1rem',
    },
    backLink: {
      textDecoration: 'none',
      color: 'var(--color-muted, #8B8578)',
      fontSize: '0.75rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    tableHeader: {
      fontWeight: 600,
      color: 'var(--color-muted, #888)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontSize: '0.7rem',
      paddingBottom: '0.5rem',
      borderBottom: '1px solid var(--color-border, #e5e5e5)',
    },
    tableRow: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.85rem',
      color: 'var(--color-ink, #2D2A26)',
      padding: '0.5rem 0',
      borderBottom: '1px solid var(--color-border, #e5e5e5)',
    },
    countCell: {
      fontVariantNumeric: 'tabular-nums',
      textAlign: 'right',
      color: 'var(--color-muted, #888)',
      fontSize: '0.85rem',
    },
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/admin" style={styles.backLink}>Admin</Link>
          <h1 style={{ ...styles.heading, marginTop: '0.25rem' }}>Search Insights</h1>
          <p style={styles.subtitle}>Last 7 days &middot; {(searchRows || []).length} searches &middot; {(trailRows || []).length} trail prompts</p>
        </div>

        {/* Grid: two columns on wider screens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>

          {/* Top 20 Search Queries */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Top 20 Search Queries</h2>
            {topSearchList.length === 0 ? (
              <p style={styles.subtitle}>No search data yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Query</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topSearchList.map(([query, count]) => (
                    <tr key={query}>
                      <td style={styles.tableRow}>{query}</td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top 20 Trail Prompts */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Top 20 Trail Prompts</h2>
            {topTrailList.length === 0 ? (
              <p style={styles.subtitle}>No trail data yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Prompt</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topTrailList.map(([prompt, count]) => (
                    <tr key={prompt}>
                      <td style={styles.tableRow}>{prompt}</td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Zero-Result Searches */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Zero-Result Searches</h2>
            {zeroResultList.length === 0 ? (
              <p style={styles.subtitle}>No zero-result searches in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Query</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroResultList.map(([query, count]) => (
                    <tr key={query}>
                      <td style={styles.tableRow}>{query}</td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Most Requested Regions */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Most Requested Regions</h2>
            {topRegionList.length === 0 ? (
              <p style={styles.subtitle}>No region data yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Region</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topRegionList.map(([region, count]) => (
                    <tr key={region}>
                      <td style={styles.tableRow}>{region}</td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
