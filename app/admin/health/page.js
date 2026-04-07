import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HealthActions from './HealthActions'

export const dynamic = 'force-dynamic'

const VERTICAL_DISPLAY = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default async function HealthPage() {
  const sb = getSupabaseAdmin()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Run all queries in parallel
  const [
    totalActiveRes,
    orphanedRes,
    recentCandidatesRes,
    recentConvertedRes,
    verticalBreakdownRes,
  ] = await Promise.all([
    // Total active listings
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    // Orphaned candidate-sourced listings
    sb.from('listings').select('id, name, vertical, region, created_at', { count: 'exact' }).like('source_id', 'candidate-%').eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    // Candidates reviewed in last 7 days
    sb.from('listing_candidates').select('id, status', { count: 'exact' }).gte('reviewed_at', sevenDaysAgo),
    // Candidates converted in last 30 days
    sb.from('listing_candidates').select('id, vertical, name, reviewed_at').eq('status', 'converted').gte('reviewed_at', thirtyDaysAgo).order('reviewed_at', { ascending: false }).limit(20),
    // Listings per vertical
    sb.from('listings').select('vertical').eq('status', 'active'),
  ])

  const totalActive = totalActiveRes.count || 0
  const orphanedListings = orphanedRes.data || []
  const orphanedCount = orphanedRes.count || 0
  const recentCandidates = recentCandidatesRes.data || []
  const recentConverted = recentConvertedRes.data || []

  // Aggregate recent candidate statuses
  const reviewStats = { converted: 0, rejected: 0, total: recentCandidates.length }
  for (const c of recentCandidates) {
    if (c.status === 'converted') reviewStats.converted++
    if (c.status === 'rejected') reviewStats.rejected++
  }

  // Aggregate vertical breakdown
  const verticalCounts = {}
  for (const row of (verticalBreakdownRes.data || [])) {
    verticalCounts[row.vertical] = (verticalCounts[row.vertical] || 0) + 1
  }
  const verticalList = Object.entries(verticalCounts)
    .sort((a, b) => b[1] - a[1])

  const styles = {
    page: { minHeight: '100vh', background: 'var(--color-cream, #FAF8F5)', padding: '3rem 1.5rem' },
    container: { maxWidth: '960px', margin: '0 auto' },
    heading: { fontFamily: 'var(--font-display, Georgia)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0 0 0.25rem' },
    subtitle: { fontFamily: 'var(--font-body, system-ui)', fontSize: '0.9rem', color: 'var(--color-muted, #888)', margin: 0 },
    backLink: { textDecoration: 'none', color: 'var(--color-muted, #8B8578)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' },
    card: { background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #e5e5e5)', padding: '1.25rem', marginBottom: '1.5rem' },
    sectionTitle: { fontFamily: 'var(--font-display, Georgia)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0 0 1rem' },
    stat: { fontFamily: 'var(--font-display, Georgia)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1 },
    statLabel: { fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem', color: 'var(--color-muted, #888)', margin: '0.25rem 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' },
    tableHeader: { fontWeight: 600, color: 'var(--color-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border, #e5e5e5)' },
    tableRow: { fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: 'var(--color-ink, #2D2A26)', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border, #e5e5e5)' },
    badge: (color) => ({
      display: 'inline-block', fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: '0.65rem',
      letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 100,
      color: '#fff', background: color,
    }),
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={styles.heading}>Approval Health</h1>
          <p style={styles.subtitle}>Pipeline status and sync integrity</p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={styles.card}>
            <p style={styles.stat}>{totalActive.toLocaleString()}</p>
            <p style={styles.statLabel}>Active Listings</p>
          </div>
          <div style={{ ...styles.card, borderLeftWidth: 3, borderLeftColor: orphanedCount > 0 ? '#C49A3C' : '#4A7C59' }}>
            <p style={{ ...styles.stat, color: orphanedCount > 0 ? '#C49A3C' : '#4A7C59' }}>{orphanedCount}</p>
            <p style={styles.statLabel}>Orphaned (no vertical)</p>
          </div>
          <div style={styles.card}>
            <p style={styles.stat}>{reviewStats.converted}</p>
            <p style={styles.statLabel}>Approved (7d)</p>
          </div>
          <div style={styles.card}>
            <p style={styles.stat}>{reviewStats.rejected}</p>
            <p style={styles.statLabel}>Rejected (7d)</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>

          {/* Orphaned listings + fix button */}
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Orphaned Listings</h2>
              <HealthActions orphanedCount={orphanedCount} />
            </div>
            {orphanedCount === 0 ? (
              <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: '#4A7C59', margin: 0 }}>
                All candidate-sourced listings are synced to their verticals.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Region</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanedListings.map(l => (
                    <tr key={l.id}>
                      <td style={styles.tableRow}>{l.name}</td>
                      <td style={styles.tableRow}>
                        <span style={styles.badge('#5F8A7E')}>{VERTICAL_DISPLAY[l.vertical] || l.vertical}</span>
                      </td>
                      <td style={{ ...styles.tableRow, color: 'var(--color-muted, #888)' }}>{l.region || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent approvals */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Recent Approvals (30d)</h2>
            {recentConverted.length === 0 ? (
              <p style={styles.subtitle}>No candidates approved recently.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConverted.map(c => (
                    <tr key={c.id}>
                      <td style={styles.tableRow}>{c.name}</td>
                      <td style={styles.tableRow}>
                        <span style={styles.badge('#5F8A7E')}>{VERTICAL_DISPLAY[c.vertical] || c.vertical}</span>
                      </td>
                      <td style={{ ...styles.tableRow, textAlign: 'right', color: 'var(--color-muted, #888)', fontSize: '0.8rem' }}>
                        {new Date(c.reviewed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Vertical breakdown */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Listings by Vertical</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                  <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {verticalList.map(([v, count]) => (
                  <tr key={v}>
                    <td style={styles.tableRow}>{VERTICAL_DISPLAY[v] || v}</td>
                    <td style={{ ...styles.tableRow, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
