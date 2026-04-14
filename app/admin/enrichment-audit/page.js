import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Enrichment Audit — Admin' }

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const RISK_COLORS = {
  high: '#c0392b',
  medium: '#e67e22',
  low: '#27ae60',
  unaudited: '#999',
}

const RISK_BG = {
  high: '#c0392b18',
  medium: '#e67e2218',
  low: '#27ae6018',
  unaudited: '#99999918',
}

export default async function EnrichmentAuditPage() {
  const sb = getSupabaseAdmin()

  // ── Summary counts (targeted queries) ──────────────────────────────

  const [
    { count: totalEnriched },
    { count: pendingReview },
    { count: approvedCount },
    { count: rejectedCount },
    { count: highRisk },
    { count: mediumRisk },
    { count: lowRisk },
    { count: unaudited },
  ] = await Promise.all([
    sb.from('listings').select('id', { count: 'exact', head: true }).not('ai_description', 'is', null),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'pending_review'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'approved'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'rejected'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_risk_level', 'high'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_risk_level', 'medium'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_risk_level', 'low'),
    sb.from('listings').select('id', { count: 'exact', head: true }).eq('enrichment_risk_level', 'unaudited'),
  ])

  // ── Average confidence ─────────────────────────────────────────────

  const { data: confRows } = await sb
    .from('listings')
    .select('enrichment_confidence')
    .not('enrichment_confidence', 'is', null)

  const avgConfidence = confRows && confRows.length > 0
    ? Math.round(confRows.reduce((sum, r) => sum + (r.enrichment_confidence || 0), 0) / confRows.length)
    : 0

  // ── Risk breakdown by vertical ─────────────────────────────────────

  const { data: verticalRows } = await sb
    .from('listings')
    .select('vertical, enrichment_risk_level, enrichment_confidence, enrichment_source_word_count')
    .not('ai_description', 'is', null)

  const verticalAgg = {}
  for (const r of (verticalRows || [])) {
    const v = r.vertical || 'unknown'
    if (!verticalAgg[v]) verticalAgg[v] = { total: 0, high: 0, medium: 0, low: 0, confSum: 0, confCount: 0, noSource: 0 }
    verticalAgg[v].total++
    if (r.enrichment_risk_level === 'high') verticalAgg[v].high++
    else if (r.enrichment_risk_level === 'medium') verticalAgg[v].medium++
    else if (r.enrichment_risk_level === 'low') verticalAgg[v].low++
    if (r.enrichment_confidence != null) {
      verticalAgg[v].confSum += r.enrichment_confidence
      verticalAgg[v].confCount++
    }
    if (!r.enrichment_source_word_count || r.enrichment_source_word_count === 0) {
      verticalAgg[v].noSource++
    }
  }

  const verticalBreakdown = Object.entries(verticalAgg)
    .map(([vertical, d]) => ({
      vertical,
      ...d,
      avgConf: d.confCount > 0 ? Math.round(d.confSum / d.confCount) : null,
    }))
    .sort((a, b) => b.high - a.high || b.total - a.total)

  // ── Top 10 highest-risk descriptions ───────────────────────────────

  const { data: riskListings } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, ai_description, enrichment_confidence, enrichment_risk_level, enrichment_grounding_result')
    .eq('enrichment_risk_level', 'high')
    .not('ai_description', 'is', null)
    .order('enrichment_confidence', { ascending: true, nullsFirst: false })
    .limit(10)

  const topRisk = riskListings || []

  // ── Source quality distribution ────────────────────────────────────

  const { data: sourceRows } = await sb
    .from('listings')
    .select('enrichment_source_word_count')
    .not('ai_description', 'is', null)

  let noSource = 0
  let thin = 0
  let adequate = 0
  let good = 0
  for (const r of (sourceRows || [])) {
    const wc = r.enrichment_source_word_count
    if (!wc || wc === 0) noSource++
    else if (wc < 150) thin++
    else if (wc <= 300) adequate++
    else good++
  }
  const sourceTotal = (sourceRows || []).length

  // ── Styles ─────────────────────────────────────────────────────────

  const s = {
    page: {
      minHeight: '100vh',
      background: '#FFFDF7',
      padding: '2rem 1.5rem',
      fontFamily: 'var(--font-body, system-ui)',
    },
    container: {
      maxWidth: '1100px',
      margin: '0 auto',
    },
    heading: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '1.75rem',
      fontWeight: 400,
      color: '#1a1a1a',
      margin: '0 0 4px',
    },
    subtitle: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.85rem',
      fontWeight: 300,
      color: '#888',
      margin: 0,
    },
    backLink: {
      textDecoration: 'none',
      color: '#888',
      fontSize: '0.7rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      fontFamily: 'var(--font-body, system-ui)',
    },
    card: {
      background: '#fff',
      borderRadius: '10px',
      border: '1px solid #e5e5e5',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    },
    sectionTitle: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '1.1rem',
      fontWeight: 600,
      color: '#1a1a1a',
      margin: '0 0 1rem',
    },
    stat: {
      fontFamily: 'var(--font-display, Georgia)',
      fontSize: '1.75rem',
      fontWeight: 400,
      color: '#1a1a1a',
      margin: 0,
      lineHeight: 1,
    },
    statLabel: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.65rem',
      fontWeight: 500,
      color: '#888',
      margin: '6px 0 0',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    th: {
      fontFamily: 'var(--font-body, system-ui)',
      fontWeight: 600,
      color: '#888',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontSize: '0.65rem',
      padding: '0 8px 8px',
      borderBottom: '1px solid #e5e5e5',
      whiteSpace: 'nowrap',
    },
    td: {
      fontFamily: 'var(--font-body, system-ui)',
      fontSize: '0.82rem',
      color: '#1a1a1a',
      padding: '8px',
      borderBottom: '1px solid #f0f0f0',
    },
  }

  function statCard(value, label, opts = {}) {
    return (
      <div style={{
        padding: '14px 18px',
        borderRadius: 8,
        background: opts.bg || '#FCE4B8',
        border: opts.border || 'none',
        textAlign: 'center',
        minWidth: 0,
      }}>
        <p style={{ ...s.stat, color: opts.color || '#1a1a1a' }}>
          {value != null ? value.toLocaleString() : '—'}
        </p>
        <p style={s.statLabel}>{label}</p>
      </div>
    )
  }

  function vertBadge(vertical) {
    const color = VERT_COLORS[vertical] || '#888'
    return (
      <span style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontWeight: 600,
        fontSize: '0.6rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color,
        background: color + '18',
        padding: '2px 8px',
        borderRadius: 100,
        whiteSpace: 'nowrap',
      }}>
        {VERT_NAMES[vertical] || vertical}
      </span>
    )
  }

  function confBadge(score) {
    if (score == null) return <span style={{ color: '#bbb', fontSize: '0.8rem' }}>—</span>
    let bg = '#c0392b'
    if (score >= 80) bg = '#27ae60'
    else if (score >= 60) bg = '#e67e22'
    else if (score >= 40) bg = '#f39c12'
    return (
      <span style={{
        display: 'inline-block',
        fontFamily: 'var(--font-body, system-ui)',
        fontWeight: 700,
        fontSize: '0.72rem',
        padding: '2px 8px',
        borderRadius: 100,
        color: '#fff',
        background: bg,
        minWidth: 32,
        textAlign: 'center',
      }}>
        {score}
      </span>
    )
  }

  function sourceBar(count, total, color) {
    const pct = total > 0 ? (count / total) * 100 : 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, background: '#f0ede7', borderRadius: 4, height: 18, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(pct, 0.5)}%`, background: color, borderRadius: 4 }} />
        </div>
        <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#888', minWidth: 80, textAlign: 'right' }}>
          {count.toLocaleString()} ({pct.toFixed(1)}%)
        </span>
      </div>
    )
  }

  // ── Parse grounding result ─────────────────────────────────────────

  function parseGrounding(raw) {
    if (!raw) return { issues: [], verdict: null }
    const obj = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return {} } })() : raw
    return {
      issues: Array.isArray(obj.issues) ? obj.issues : [],
      verdict: obj.verdict || null,
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <a href="/admin" style={s.backLink}>Admin</a>
          <h1 style={s.heading}>Enrichment Audit</h1>
          <p style={s.subtitle}>Pipeline health and hallucination risk analysis</p>
        </div>

        {/* Summary cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '10px',
          marginBottom: '1.5rem',
        }}>
          {statCard(totalEnriched || 0, 'AI Descriptions')}
          {statCard(pendingReview || 0, 'Pending Review', { bg: '#FCE4B8' })}
          {statCard(approvedCount || 0, 'Approved', { bg: '#27ae6018', color: '#27ae60' })}
          {statCard(rejectedCount || 0, 'Rejected', { bg: '#c0392b18', color: '#c0392b' })}
          {statCard(avgConfidence, 'Avg Confidence', { bg: '#C49A3C18', color: '#C49A3C' })}
          {statCard(highRisk || 0, 'High Risk', { bg: RISK_BG.high, color: RISK_COLORS.high, border: `1px solid ${RISK_COLORS.high}30` })}
          {statCard(mediumRisk || 0, 'Medium Risk', { bg: RISK_BG.medium, color: RISK_COLORS.medium, border: `1px solid ${RISK_COLORS.medium}30` })}
          {statCard(lowRisk || 0, 'Low Risk', { bg: RISK_BG.low, color: RISK_COLORS.low, border: `1px solid ${RISK_COLORS.low}30` })}
          {statCard(unaudited || 0, 'Unaudited', { bg: RISK_BG.unaudited, color: '#666', border: '1px solid #ccc' })}
        </div>

        {/* Risk breakdown by vertical */}
        <div style={s.card}>
          <h2 style={s.sectionTitle}>Risk Breakdown by Vertical</h2>
          {verticalBreakdown.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: '#bbb', fontStyle: 'italic' }}>
              No enriched listings found.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, textAlign: 'left' }}>Vertical</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Enriched</th>
                    <th style={{ ...s.th, textAlign: 'right', color: RISK_COLORS.high }}>High</th>
                    <th style={{ ...s.th, textAlign: 'right', color: RISK_COLORS.medium }}>Medium</th>
                    <th style={{ ...s.th, textAlign: 'right', color: RISK_COLORS.low }}>Low</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Avg Conf</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>No Source</th>
                  </tr>
                </thead>
                <tbody>
                  {verticalBreakdown.map(v => (
                    <tr key={v.vertical}>
                      <td style={s.td}>{vertBadge(v.vertical)}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{v.total.toLocaleString()}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: v.high > 0 ? RISK_COLORS.high : '#ccc', fontWeight: v.high > 0 ? 600 : 400 }}>
                        {v.high}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: v.medium > 0 ? RISK_COLORS.medium : '#ccc', fontWeight: v.medium > 0 ? 600 : 400 }}>
                        {v.medium}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: v.low > 0 ? RISK_COLORS.low : '#ccc' }}>
                        {v.low}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        {confBadge(v.avgConf)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: v.noSource > 0 ? '#c0392b' : '#ccc', fontWeight: v.noSource > 0 ? 600 : 400 }}>
                        {v.noSource}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top 10 highest-risk descriptions */}
        <div style={s.card}>
          <h2 style={s.sectionTitle}>Top 10 Highest-Risk Descriptions</h2>
          {topRisk.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.85rem', color: '#bbb', fontStyle: 'italic' }}>
              No high-risk descriptions found.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {topRisk.map(listing => {
                const { issues, verdict } = parseGrounding(listing.enrichment_grounding_result)
                return (
                  <div
                    key={listing.id}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 8,
                      border: `1px solid ${RISK_COLORS.high}30`,
                      background: '#fff',
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <a
                          href={`/place/${listing.slug}`}
                          style={{
                            fontFamily: 'var(--font-body, system-ui)',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            color: '#1a1a1a',
                            textDecoration: 'none',
                          }}
                        >
                          {listing.name}
                        </a>
                        {vertBadge(listing.vertical)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {listing.region && (
                          <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem', color: '#888' }}>
                            {listing.region}{listing.state ? `, ${listing.state}` : ''}
                          </span>
                        )}
                        {confBadge(listing.enrichment_confidence)}
                      </div>
                    </div>

                    {/* AI description */}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: '#fdf6f5',
                      border: '1px solid #f0dcd9',
                      marginBottom: 10,
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-body, system-ui)',
                        fontWeight: 500,
                        fontSize: '0.6rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: RISK_COLORS.high,
                        margin: '0 0 4px',
                      }}>
                        AI Description
                      </p>
                      <p style={{
                        fontFamily: 'var(--font-body, system-ui)',
                        fontWeight: 400,
                        fontSize: '0.82rem',
                        lineHeight: 1.6,
                        color: '#1a1a1a',
                        margin: 0,
                      }}>
                        {listing.ai_description || '(empty)'}
                      </p>
                    </div>

                    {/* Grounding issues & verdict */}
                    {(issues.length > 0 || verdict) && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 6,
                        background: '#faf8f5',
                        border: '1px solid #e8e4da',
                      }}>
                        {verdict && (
                          <p style={{
                            fontFamily: 'var(--font-body, system-ui)',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            color: '#1a1a1a',
                            margin: '0 0 6px',
                          }}>
                            Verdict: <span style={{ color: RISK_COLORS.high }}>{verdict}</span>
                          </p>
                        )}
                        {issues.length > 0 && (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {issues.map((issue, i) => (
                              <li
                                key={i}
                                style={{
                                  fontFamily: 'var(--font-body, system-ui)',
                                  fontSize: '0.78rem',
                                  lineHeight: 1.5,
                                  color: '#555',
                                  marginBottom: 2,
                                }}
                              >
                                {typeof issue === 'string' ? issue : JSON.stringify(issue)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* View link */}
                    <div style={{ marginTop: 8, textAlign: 'right' }}>
                      <a
                        href={`/place/${listing.slug}`}
                        style={{
                          fontFamily: 'var(--font-body, system-ui)',
                          fontSize: '0.7rem',
                          color: '#C49A3C',
                          textDecoration: 'none',
                          fontWeight: 500,
                          letterSpacing: '0.04em',
                        }}
                      >
                        View listing &rarr;
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Source quality distribution */}
        <div style={s.card}>
          <h2 style={s.sectionTitle}>Source Quality Distribution</h2>
          <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#888', margin: '0 0 14px' }}>
            Word count of scraped source text used for AI description generation
          </p>

          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#c0392b', fontWeight: 600 }}>
                No source text
              </span>
            </div>
            {sourceBar(noSource, sourceTotal, '#c0392b')}
          </div>

          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#e67e22', fontWeight: 600 }}>
                Thin (&lt; 150 words)
              </span>
            </div>
            {sourceBar(thin, sourceTotal, '#e67e22')}
          </div>

          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#C49A3C', fontWeight: 600 }}>
                Adequate (150 -- 300 words)
              </span>
            </div>
            {sourceBar(adequate, sourceTotal, '#C49A3C')}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: '0.78rem', color: '#27ae60', fontWeight: 600 }}>
                Good (300+ words)
              </span>
            </div>
            {sourceBar(good, sourceTotal, '#27ae60')}
          </div>
        </div>

      </div>
    </div>
  )
}
