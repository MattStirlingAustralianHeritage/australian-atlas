import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const metadata = { title: 'Revenue — Admin' }
export const dynamic = 'force-dynamic'

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  collection: 'Collection',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

export default async function RevenuePage() {
  const sb = getSupabaseAdmin()

  // ── Queries ────────────────────────────────────────────────
  const [snapshotsRes, unclaimedRes] = await Promise.all([
    // Last 12 snapshots
    sb
      .from('revenue_snapshots')
      .select('id, snapshot_date, arr, active_subscribers, new_this_week, churned_this_week, expiring_30_days')
      .order('snapshot_date', { ascending: false })
      .limit(12),
    // Top unclaimed high-quality listings
    sb
      .from('listings')
      .select('name, slug, vertical, region, state, quality_score')
      .eq('status', 'active')
      .gte('quality_score', 75)
      .or('is_claimed.is.null,is_claimed.eq.false')
      .order('quality_score', { ascending: false })
      .limit(10),
  ])

  const snapshots = snapshotsRes.data || []
  const unclaimed = unclaimedRes.data || []

  // Latest snapshot for hero numbers
  const latest = snapshots[0] || null
  const previous = snapshots[1] || null

  const currentARR = latest ? Number(latest.arr) || 0 : 0
  const currentSubscribers = latest?.active_subscribers || 0
  const currentMRR = currentARR / 12

  // Deltas
  let subscriberDelta = null
  let arrDelta = null
  if (latest && previous) {
    subscriberDelta = currentSubscribers - (previous.active_subscribers || 0)
    arrDelta = currentARR - (Number(previous.arr) || 0)
  }

  // Latest snapshot's pipeline number
  const expiring30 = latest?.expiring_30_days || 0

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
    heroStat: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '2.75rem',
      fontWeight: 700,
      color: 'var(--color-ink, #2D2A26)',
      margin: 0,
      lineHeight: 1,
    },
    heroLabel: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.75rem',
      color: 'var(--color-muted, #888)',
      margin: '0.5rem 0 0',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    delta: (positive) => ({
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.8rem',
      fontWeight: 500,
      color: positive ? '#166534' : '#991b1b',
      margin: '0.25rem 0 0',
    }),
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
    badge: (color) => ({
      display: 'inline-block',
      fontFamily: 'var(--font-body, system-ui)',
      fontWeight: 600,
      fontSize: '0.65rem',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 8px',
      borderRadius: 100,
      color: '#fff',
      background: color,
    }),
    scoreBadge: {
      display: 'inline-block',
      fontFamily: 'var(--font-body, system-ui)',
      fontWeight: 600,
      fontSize: '0.75rem',
      padding: '2px 10px',
      borderRadius: 100,
      color: '#166534',
      background: '#f0fdf4',
    },
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={styles.heading}>Revenue</h1>
          <p style={styles.subtitle}>
            {latest
              ? `Last snapshot: ${new Date(latest.snapshot_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'No snapshots yet'}
          </p>
        </div>

        {/* Hero stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          <div style={styles.card}>
            <p style={styles.heroStat}>${currentARR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p style={styles.heroLabel}>Annual Recurring Revenue</p>
            {arrDelta !== null && (
              <p style={styles.delta(arrDelta >= 0)}>
                {arrDelta >= 0 ? '+' : '-'}${Math.abs(arrDelta).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs previous week
              </p>
            )}
          </div>
          <div style={styles.card}>
            <p style={styles.heroStat}>{currentSubscribers}</p>
            <p style={styles.heroLabel}>Active Subscribers</p>
            {subscriberDelta !== null && (
              <p style={styles.delta(subscriberDelta >= 0)}>
                {subscriberDelta >= 0 ? '+' : ''}{subscriberDelta} vs previous week
              </p>
            )}
          </div>
          <div style={styles.card}>
            <p style={styles.heroStat}>${currentMRR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p style={styles.heroLabel}>Monthly Recurring Revenue</p>
          </div>
          <div style={{ ...styles.card, borderLeftWidth: 3, borderLeftColor: expiring30 > 0 ? '#f59e0b' : '#4A7C59' }}>
            <p style={{ ...styles.heroStat, fontSize: '2.25rem', color: expiring30 > 0 ? '#92400e' : 'var(--color-ink, #2D2A26)' }}>
              {expiring30}
            </p>
            <p style={styles.heroLabel}>Expiring in 30 days</p>
          </div>
        </div>

        {/* Snapshot history */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Snapshot History</h2>
          {snapshots.length === 0 ? (
            <p style={styles.subtitle}>No snapshots recorded yet. The Revenue Signal Agent runs every Friday at 4 AM AEST.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Date</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Subscribers</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>ARR</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>New</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Churned</th>
                    <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Expiring (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap) => (
                    <tr key={snap.id}>
                      <td style={styles.tableRow}>
                        {new Date(snap.snapshot_date).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>
                        {snap.active_subscribers ?? '\u2014'}
                      </td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>
                        {snap.arr != null ? `$${Number(snap.arr).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '\u2014'}
                      </td>
                      <td style={{ ...styles.tableRow, ...styles.countCell, color: (snap.new_this_week || 0) > 0 ? '#166534' : 'var(--color-muted, #888)' }}>
                        {snap.new_this_week != null ? (snap.new_this_week > 0 ? `+${snap.new_this_week}` : snap.new_this_week) : '\u2014'}
                      </td>
                      <td style={{ ...styles.tableRow, ...styles.countCell, color: (snap.churned_this_week || 0) > 0 ? '#991b1b' : 'var(--color-muted, #888)' }}>
                        {snap.churned_this_week != null ? snap.churned_this_week : '\u2014'}
                      </td>
                      <td style={{ ...styles.tableRow, ...styles.countCell }}>
                        {snap.expiring_30_days != null ? snap.expiring_30_days : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top unclaimed high-quality */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Top Unclaimed by Quality</h2>
          <p style={{ ...styles.subtitle, marginBottom: '1rem' }}>Active listings with quality score &ge; 75 that haven&apos;t been claimed</p>
          {unclaimed.length === 0 ? (
            <p style={styles.subtitle}>No unclaimed high-quality listings found.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
                  <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                  <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Region</th>
                  <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {unclaimed.map((l) => (
                  <tr key={l.slug}>
                    <td style={styles.tableRow}>
                      <a
                        href={`/place/${l.slug}`}
                        style={{ color: '#b8862b', textDecoration: 'none' }}
                      >
                        {l.name}
                      </a>
                    </td>
                    <td style={styles.tableRow}>
                      <span style={styles.badge('#5F8A7E')}>
                        {VERTICAL_LABELS[l.vertical] || l.vertical}
                      </span>
                    </td>
                    <td style={{ ...styles.tableRow, color: 'var(--color-muted, #888)' }}>
                      {l.region || ''}{l.state ? `, ${l.state}` : ''}
                    </td>
                    <td style={{ ...styles.tableRow, textAlign: 'right' }}>
                      <span style={styles.scoreBadge}>{l.quality_score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
