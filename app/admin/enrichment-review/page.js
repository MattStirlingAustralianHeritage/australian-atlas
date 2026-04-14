import { getSupabaseAdmin } from '@/lib/supabase/clients'
import EnrichmentActions, { BulkApproveButton, SourceTextToggle } from './EnrichmentActions'

export const metadata = { title: 'Enrichment Review — Admin' }
export const dynamic = 'force-dynamic'

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERT_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const RISK_TABS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High Risk' },
  { key: 'medium', label: 'Medium Risk' },
  { key: 'low', label: 'Low Risk' },
  { key: 'unaudited', label: 'Unaudited' },
]

function getConfidencePill(confidence, riskLevel) {
  if (riskLevel === 'unaudited' || confidence == null) {
    return { bg: '#888', label: '? Unaudited' }
  }
  if (confidence < 60) {
    return { bg: '#c44', label: `\u26A0 ${confidence}%` }
  }
  if (confidence < 90) {
    return { bg: '#c90', label: `\u26A1 ${confidence}%` }
  }
  return { bg: '#4a7c59', label: `\u2713 ${confidence}%` }
}

function getSourceQuality(wordCount) {
  if (wordCount == null) return null
  if (wordCount < 150) {
    return { color: '#c44', label: `Thin source (${wordCount} words)` }
  }
  if (wordCount <= 300) {
    return { color: '#c90', label: `Adequate (${wordCount} words)` }
  }
  return { color: '#4a7c59', label: `Good source (${wordCount} words)` }
}

export default async function EnrichmentReviewPage({ searchParams }) {
  const sp = await searchParams
  const riskFilter = sp?.risk || 'all'

  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  const { data: listings, error } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, description, ai_description, hero_image_url, website, enrichment_source_text, enrichment_confidence, enrichment_risk_level, enrichment_grounding_result, enrichment_source_word_count')
    .eq('enrichment_status', 'pending_review')
    .order('enrichment_confidence', { ascending: true, nullsFirst: false })
    .order('name')

  const allItems = listings || []

  // Count per risk level for tab badges
  const riskCounts = { all: allItems.length, high: 0, medium: 0, low: 0, unaudited: 0 }
  for (const l of allItems) {
    const r = l.enrichment_risk_level || 'unaudited'
    if (riskCounts[r] !== undefined) riskCounts[r]++
  }

  // Apply filter
  const items = riskFilter === 'all'
    ? allItems
    : allItems.filter(l => (l.enrichment_risk_level || 'unaudited') === riskFilter)

  const ids = items.map(l => l.id)

  // Group by vertical for summary badges
  const byVertical = {}
  for (const l of items) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

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
          Enrichment Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          AI-generated descriptions awaiting approval. Review each and approve, edit, or reject.
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
        <div style={{
          padding: '14px 20px',
          borderRadius: 8,
          background: '#FCE4B8',
          textAlign: 'center',
          minWidth: 120,
        }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
            {allItems.length}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Pending Review
          </p>
        </div>
        {Object.entries(byVertical).map(([vert, arr]) => (
          <div key={vert} style={{
            padding: '14px 20px',
            borderRadius: 8,
            background: (VERT_COLORS[vert] || '#888') + '18',
            border: `1px solid ${VERT_COLORS[vert] || '#888'}30`,
            textAlign: 'center',
            minWidth: 100,
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: VERT_COLORS[vert] || '#888', margin: 0 }}>
              {arr.length}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              {VERT_NAMES[vert] || vert}
            </p>
          </div>
        ))}
      </div>

      {/* Risk filter tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        borderBottom: '1px solid #e5e0d8',
        paddingBottom: 0,
      }}>
        {RISK_TABS.map(tab => {
          const isActive = riskFilter === tab.key
          const count = riskCounts[tab.key] || 0
          return (
            <a
              key={tab.key}
              href={tab.key === 'all' ? '/admin/enrichment-review' : `/admin/enrichment-review?risk=${tab.key}`}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-ink)' : 'var(--color-muted, #888)',
                textDecoration: 'none',
                padding: '8px 14px',
                borderBottom: isActive ? '2px solid var(--color-ink)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
              <span style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 500,
                background: isActive ? '#e8e4da' : '#f0eeea',
                color: isActive ? 'var(--color-ink)' : '#999',
                padding: '1px 6px',
                borderRadius: 100,
              }}>
                {count}
              </span>
            </a>
          )
        })}
      </div>

      {/* Bulk approve */}
      {items.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <BulkApproveButton listingIds={ids} />
        </div>
      )}

      {/* Listing cards */}
      {items.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 0',
          border: '1px dashed var(--color-border, #e5e5e5)',
          borderRadius: 8,
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            {riskFilter === 'all'
              ? 'No descriptions awaiting review.'
              : `No ${riskFilter}-risk descriptions awaiting review.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(listing => {
            const pill = getConfidencePill(listing.enrichment_confidence, listing.enrichment_risk_level)
            const sourceQuality = getSourceQuality(listing.enrichment_source_word_count)
            const groundingResult = listing.enrichment_grounding_result
            const issues = groundingResult?.issues || []

            return (
              <div
                key={listing.id}
                style={{
                  padding: '20px 24px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff',
                }}
              >
                {/* Name, vertical badge, confidence pill, region */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {listing.hero_image_url && (
                      <img
                        src={listing.hero_image_url}
                        alt=""
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 15,
                      color: 'var(--color-ink)',
                    }}>
                      {listing.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: VERT_COLORS[listing.vertical] || '#888',
                      background: (VERT_COLORS[listing.vertical] || '#888') + '18',
                      padding: '2px 8px',
                      borderRadius: 100,
                      whiteSpace: 'nowrap',
                    }}>
                      {VERT_NAMES[listing.vertical] || listing.vertical}
                    </span>
                    {/* Confidence pill */}
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 10,
                      color: '#fff',
                      background: pill.bg,
                      padding: '2px 8px',
                      borderRadius: 100,
                      whiteSpace: 'nowrap',
                    }}>
                      {pill.label}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 400,
                    fontSize: 12,
                    color: 'var(--color-muted)',
                  }}>
                    {listing.region ? `${listing.region}, ` : ''}{listing.state}
                  </span>
                </div>

                {/* Source quality indicator */}
                {sourceQuality && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 500,
                      color: sourceQuality.color,
                    }}>
                      {sourceQuality.label}
                    </span>
                    {listing.website && (
                      <a
                        href={listing.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 11,
                          color: '#888',
                          marginLeft: 10,
                          textDecoration: 'underline',
                          textDecorationColor: '#ccc',
                          textUnderlineOffset: 2,
                        }}
                      >
                        source site
                      </a>
                    )}
                  </div>
                )}

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

                {/* AI description */}
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
                    Proposed AI description
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 400,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--color-ink)',
                    margin: 0,
                  }}>
                    {listing.ai_description}
                  </p>
                </div>

                {/* Grounding issues */}
                {issues.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: '#fdf0ef',
                    border: '1px solid #f0ccc8',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#c44',
                      margin: '0 0 6px',
                    }}>
                      Grounding issues
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: 18,
                      listStyle: 'disc',
                    }}>
                      {issues.map((issue, i) => (
                        <li key={i} style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: '#8a3030',
                          marginBottom: 2,
                        }}>
                          {typeof issue === 'string' ? issue : issue.message || issue.claim || JSON.stringify(issue)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source text expandable */}
                <SourceTextToggle
                  sourceText={listing.enrichment_source_text}
                  wordCount={listing.enrichment_source_word_count}
                />

                {/* Actions */}
                <EnrichmentActions listing={listing} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
