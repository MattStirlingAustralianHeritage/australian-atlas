import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ClusterActions from './ClusterActions'
import InsightReport from './InsightReport'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Clusters — Admin' }

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERT_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export default async function ClustersPage() {
  const sb = getSupabaseAdmin()

  let clusters = []
  let totalListings = 0
  let latestInsight = null

  try {
    const [clustersRes, countRes, insightRes] = await Promise.all([
      sb.from('listing_clusters')
        .select('id, label, description, is_editorially_interesting, collection_id, member_count, geographic_summary, vertical_distribution, representative_listings')
        .order('member_count', { ascending: false }),
      sb.from('listings')
        .select('id', { count: 'exact', head: true })
        .not('cluster_id', 'is', null),
      sb.from('corpus_insights')
        .select('id, created_at, insight_text, text, content')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    if (!clustersRes.error && clustersRes.data) clusters = clustersRes.data
    if (!countRes.error) totalListings = countRes.count || 0
    if (!insightRes.error && insightRes.data) latestInsight = insightRes.data
  } catch (err) {
    console.error('[admin/clusters] Query error:', err.message)
  }

  const avgSize = clusters.length > 0
    ? Math.round(totalListings / clusters.length)
    : 0

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={styles.heading}>The Independent Australia Corpus</h1>
          <p style={styles.subtitle}>
            50 natural clusters identified through semantic analysis of {totalListings.toLocaleString()} independent Australian listings.
          </p>
        </div>

        {/* Summary stats */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{totalListings.toLocaleString()}</p>
            <p style={styles.statLabel}>Listings Clustered</p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{clusters.length}</p>
            <p style={styles.statLabel}>Clusters</p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{avgSize}</p>
            <p style={styles.statLabel}>Avg Cluster Size</p>
          </div>
          <div style={styles.statCard}>
            {latestInsight ? (
              <a href="#insight-report" style={{ textDecoration: 'none' }}>
                <p style={{ ...styles.statNumber, color: '#b8862b' }}>View</p>
                <p style={styles.statLabel}>Latest Insight</p>
              </a>
            ) : (
              <>
                <p style={{ ...styles.statNumber, color: 'var(--color-muted, #888)' }}>&mdash;</p>
                <p style={styles.statLabel}>No Insight Yet</p>
              </>
            )}
          </div>
        </div>

        {/* Cluster grid */}
        <div style={styles.clusterGrid}>
          {clusters.map(cluster => {
            const geo = cluster.geographic_summary || {}
            const states = geo.states || {}
            const topStates = Object.entries(states)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)

            const verticals = cluster.vertical_distribution || {}
            const reps = (cluster.representative_listings || []).slice(0, 5)

            return (
              <div key={cluster.id} style={styles.card}>
                {/* Label + member count */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <ClusterActions
                    cluster={{
                      id: cluster.id,
                      label: cluster.label,
                      description: cluster.description,
                      is_editorially_interesting: cluster.is_editorially_interesting,
                      collection_id: cluster.collection_id,
                    }}
                  />
                  <span style={styles.memberBadge}>
                    {cluster.member_count}
                  </span>
                </div>

                {/* Description */}
                {cluster.description && (
                  <p style={styles.description}>{cluster.description}</p>
                )}

                {/* Geographic distribution */}
                {topStates.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {topStates.map(([state, count]) => (
                      <span key={state} style={styles.statePill}>
                        {state} {count}
                      </span>
                    ))}
                  </div>
                )}

                {/* Vertical distribution */}
                {Object.keys(verticals).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                    {Object.entries(verticals).map(([vert, count]) => (
                      <span
                        key={vert}
                        style={{
                          ...styles.vertPill,
                          background: (VERT_COLORS[vert] || '#888') + '18',
                          color: VERT_COLORS[vert] || '#888',
                          borderColor: (VERT_COLORS[vert] || '#888') + '30',
                        }}
                      >
                        {VERT_LABELS[vert] || vert} {count}
                      </span>
                    ))}
                  </div>
                )}

                {/* Representative listings */}
                {reps.length > 0 && (
                  <div style={styles.repsSection}>
                    <p style={styles.repsTitle}>Top listings</p>
                    <ul style={styles.repsList}>
                      {reps.map((rep, i) => (
                        <li key={rep.id || i} style={styles.repItem}>
                          <span style={styles.repName}>
                            {rep.slug ? (
                              <a href={`/place/${rep.slug}`} style={styles.repLink}>
                                {rep.name}
                              </a>
                            ) : (
                              rep.name
                            )}
                          </span>
                          {rep.vertical && (
                            <span
                              style={{
                                ...styles.repVertBadge,
                                background: (VERT_COLORS[rep.vertical] || '#888') + '18',
                                color: VERT_COLORS[rep.vertical] || '#888',
                              }}
                            >
                              {VERT_LABELS[rep.vertical] || rep.vertical}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Collection link */}
                {cluster.collection_id && (
                  <div style={{ marginTop: 12 }}>
                    <a href={`/collections`} style={styles.collectionLink}>
                      View collection &rarr;
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {clusters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ fontFamily: 'var(--font-body, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)' }}>
              No clusters found. Run the clustering pipeline to populate this view.
            </p>
          </div>
        )}

        {/* Insight report */}
        {latestInsight && (
          <div id="insight-report" style={{ marginTop: '3rem' }}>
            <InsightReport insight={latestInsight} />
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-cream, #FAF8F5)',
    padding: '3rem 1.5rem',
  },
  container: { maxWidth: '1200px', margin: '0 auto' },
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
    lineHeight: 1.5,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: '2.5rem',
  },
  statCard: {
    padding: '16px 20px',
    borderRadius: 8,
    background: '#fff',
    border: '1px solid var(--color-border, #e5e5e5)',
    textAlign: 'center',
  },
  statNumber: {
    fontFamily: 'var(--font-display, Georgia)',
    fontSize: 28,
    fontWeight: 400,
    color: 'var(--color-ink, #2D2A26)',
    margin: 0,
  },
  statLabel: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-muted, #888)',
    margin: '4px 0 0',
  },
  clusterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 8,
    border: '1px solid var(--color-border, #e5e5e5)',
    padding: '20px',
  },
  memberBadge: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-muted, #888)',
    background: 'var(--color-cream, #FAF8F5)',
    padding: '2px 10px',
    borderRadius: 100,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  description: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 13,
    color: 'var(--color-muted, #888)',
    lineHeight: 1.5,
    margin: '0 0 12px',
  },
  statePill: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--color-ink, #2D2A26)',
    background: '#f4f2ee',
    padding: '2px 8px',
    borderRadius: 100,
    whiteSpace: 'nowrap',
  },
  vertPill: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 10,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 100,
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  repsSection: {
    borderTop: '1px solid var(--color-border, #e5e5e5)',
    paddingTop: 10,
  },
  repsTitle: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-muted, #888)',
    margin: '0 0 6px',
  },
  repsList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  repItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  repName: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    color: 'var(--color-ink, #2D2A26)',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '70%',
  },
  repLink: {
    color: 'var(--color-ink, #2D2A26)',
    textDecoration: 'none',
    borderBottom: '1px solid var(--color-border, #e5e5e5)',
  },
  repVertBadge: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 9,
    fontWeight: 500,
    padding: '1px 6px',
    borderRadius: 100,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  collectionLink: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: 12,
    fontWeight: 500,
    color: '#b8862b',
    textDecoration: 'none',
  },
}
