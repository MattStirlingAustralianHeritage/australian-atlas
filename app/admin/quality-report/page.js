import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const VERTICAL_DISPLAY = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default async function QualityReportPage() {
  const sb = getSupabaseAdmin()

  // Fetch all listings with quality_score and relevant fields
  let allListings = []
  let offset = 0
  const BATCH = 1000

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, vertical, suburb, state, region, status, quality_score')
      .order('id')
      .range(offset, offset + BATCH - 1)

    if (error || !data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH) break
  }

  // Distribution
  const distribution = { '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0 }
  for (const l of allListings) {
    const s = l.quality_score || 0
    if (s < 20) distribution['0-20']++
    else if (s < 40) distribution['20-40']++
    else if (s < 60) distribution['40-60']++
    else if (s < 80) distribution['60-80']++
    else distribution['80-100']++
  }

  // Average by vertical
  const verticalAgg = {}
  for (const l of allListings) {
    const v = l.vertical || 'unknown'
    if (!verticalAgg[v]) verticalAgg[v] = { total: 0, count: 0 }
    verticalAgg[v].total += (l.quality_score || 0)
    verticalAgg[v].count++
  }
  const avgByVertical = Object.entries(verticalAgg)
    .map(([vertical, { total, count }]) => ({ vertical, avg: Math.round(total / count), count }))
    .sort((a, b) => b.avg - a.avg)

  // Average by region (top 15 by count)
  const regionAgg = {}
  for (const l of allListings) {
    const r = l.region || 'Unknown'
    if (!regionAgg[r]) regionAgg[r] = { total: 0, count: 0 }
    regionAgg[r].total += (l.quality_score || 0)
    regionAgg[r].count++
  }
  const avgByRegion = Object.entries(regionAgg)
    .map(([region, { total, count }]) => ({ region, avg: Math.round(total / count), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // Top 20
  const top20 = [...allListings]
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    .slice(0, 20)

  // Bottom 20 active
  const bottom20 = [...allListings]
    .filter(l => l.status === 'active')
    .sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0))
    .slice(0, 20)

  // High-value count
  const highValueCount = allListings.filter(l => (l.quality_score || 0) >= 75).length

  const totalListings = allListings.length
  const overallAvg = totalListings > 0
    ? Math.round(allListings.reduce((s, l) => s + (l.quality_score || 0), 0) / totalListings)
    : 0

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
  }

  function scoreBadge(score) {
    let bg = '#e74c3c'
    if (score >= 75) bg = '#27ae60'
    else if (score >= 50) bg = '#f39c12'
    else if (score >= 25) bg = '#e67e22'
    return {
      display: 'inline-block', fontFamily: 'var(--font-body, system-ui)', fontWeight: 700,
      fontSize: '0.75rem', padding: '2px 8px', borderRadius: '100px',
      color: '#fff', background: bg, minWidth: '36px', textAlign: 'center',
    }
  }

  function barStyle(pct) {
    return {
      height: '20px',
      width: `${Math.max(pct, 1)}%`,
      background: 'var(--color-accent, #C49A3C)',
      borderRadius: '4px',
      transition: 'width 0.3s',
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ marginBottom: '2rem' }}>
          <a href="/admin" style={styles.backLink}>Admin</a>
          <h1 style={styles.heading}>Quality Score Report</h1>
          <p style={styles.subtitle}>Data quality and completeness across all listings</p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={styles.card}>
            <p style={styles.stat}>{totalListings.toLocaleString()}</p>
            <p style={styles.statLabel}>Total Listings</p>
          </div>
          <div style={styles.card}>
            <p style={styles.stat}>{overallAvg}</p>
            <p style={styles.statLabel}>Average Score</p>
          </div>
          <div style={styles.card}>
            <p style={{ ...styles.stat, color: '#27ae60' }}>{highValueCount.toLocaleString()}</p>
            <p style={styles.statLabel}>High Value (75+)</p>
          </div>
          <div style={styles.card}>
            <p style={{ ...styles.stat, color: '#e74c3c' }}>{distribution['0-20'].toLocaleString()}</p>
            <p style={styles.statLabel}>Critical (0-20)</p>
          </div>
        </div>

        {/* Distribution */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Score Distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(distribution).map(([range, count]) => {
              const pct = totalListings > 0 ? (count / totalListings) * 100 : 0
              return (
                <div key={range} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: 'var(--color-ink, #2D2A26)', width: '60px', textAlign: 'right', fontWeight: 600 }}>{range}</span>
                  <div style={{ flex: 1, background: '#f0ede7', borderRadius: '4px', height: '20px', overflow: 'hidden' }}>
                    <div style={barStyle(pct)} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.8rem', color: 'var(--color-muted, #888)', width: '100px' }}>
                    {count.toLocaleString()} ({pct.toFixed(1)}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Average by Vertical */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Average Score by Vertical</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Avg Score</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Listings</th>
              </tr>
            </thead>
            <tbody>
              {avgByVertical.map(v => (
                <tr key={v.vertical}>
                  <td style={styles.tableRow}>{VERTICAL_DISPLAY[v.vertical] || v.vertical}</td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>
                    <span style={scoreBadge(v.avg)}>{v.avg}</span>
                  </td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>{v.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Average by Region */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Average Score by Region (Top 15)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Region</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Avg Score</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Listings</th>
              </tr>
            </thead>
            <tbody>
              {avgByRegion.map(r => (
                <tr key={r.region}>
                  <td style={styles.tableRow}>{r.region}</td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>
                    <span style={scoreBadge(r.avg)}>{r.avg}</span>
                  </td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top 20 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Top 20 Highest Scoring Listings</h2>
          <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.8rem', color: 'var(--color-muted, #888)', margin: '0 0 1rem' }}>Potential interview and feature subjects</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Location</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {top20.map(l => (
                <tr key={l.id}>
                  <td style={styles.tableRow}>{l.name}</td>
                  <td style={styles.tableRow}>{VERTICAL_DISPLAY[l.vertical] || l.vertical}</td>
                  <td style={styles.tableRow}>{[l.suburb, l.state].filter(Boolean).join(', ')}</td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>
                    <span style={scoreBadge(l.quality_score || 0)}>{l.quality_score || 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom 20 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Bottom 20 Lowest Active Listings</h2>
          <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.8rem', color: 'var(--color-muted, #888)', margin: '0 0 1rem' }}>Data quality priorities</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Vertical</th>
                <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Location</th>
                <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {bottom20.map(l => (
                <tr key={l.id}>
                  <td style={styles.tableRow}>{l.name}</td>
                  <td style={styles.tableRow}>{VERTICAL_DISPLAY[l.vertical] || l.vertical}</td>
                  <td style={styles.tableRow}>{[l.suburb, l.state].filter(Boolean).join(', ')}</td>
                  <td style={{ ...styles.tableRow, textAlign: 'right' }}>
                    <span style={scoreBadge(l.quality_score || 0)}>{l.quality_score || 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
