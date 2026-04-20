'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'

const STAGE_META = {
  discover: { label: 'Discover', color: '#6B7280', desc: 'New prospects from Google Places, user suggestions, and coverage gaps' },
  verify: { label: 'Verify', color: '#D97706', desc: 'Running quality gates — web presence, address, business activity, vertical fit' },
  curate: { label: 'Curate', color: '#7C3AED', desc: 'Scored and categorised — ready for editorial review' },
  prepare: { label: 'Prepare', color: '#2563EB', desc: 'Enriching with descriptions, images, and metadata' },
  queue: { label: 'Queue', color: '#059669', desc: 'Ready for admin approval — publish to the network' },
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#8B6F4E', fine_grounds: '#8A7055',
  rest: '#5B7B6F', field: '#5A7247', corner: '#6B7280', found: '#9B6B4A', table: '#A0522D',
}

const SOURCE_LABELS = {
  web_search: 'Web', council_suggested: 'Council', user_suggested: 'User',
  coverage_gap: 'Gap', map_coverage_audit: 'Audit', automated_discovery: 'Auto',
  ai_prospector: 'AI',
}

function StageFunnel({ stageCounts }) {
  const stages = ['discover', 'verify', 'curate', 'prepare', 'queue']
  const maxCount = Math.max(...Object.values(stageCounts), 1)

  return (
    <div style={{
      display: 'flex', gap: 2, marginBottom: 32,
      background: 'var(--color-cream, #f5f0e8)', borderRadius: 8,
      padding: 16, border: '1px solid var(--color-border)',
    }}>
      {stages.map((stage, i) => {
        const meta = STAGE_META[stage]
        const count = stageCounts[stage] || 0
        const barHeight = Math.max(8, (count / maxCount) * 60)

        return (
          <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)', color: meta.color, fontWeight: 600,
              marginBottom: 6,
            }}>
              {meta.label}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
              height: 60, marginBottom: 6,
            }}>
              <div style={{
                width: '60%', height: barHeight, borderRadius: 3,
                background: meta.color, opacity: 0.8,
                transition: 'height 0.3s',
              }} />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 22,
              fontWeight: 400, color: 'var(--color-ink)',
            }}>
              {count}
            </div>
            <div style={{
              fontSize: 10, color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)', marginTop: 2,
            }}>
              {meta.desc.split('—')[0].trim()}
            </div>
            {i < stages.length - 1 && (
              <div style={{
                position: 'absolute', right: -8, top: '50%',
                color: 'var(--color-muted)', fontSize: 14,
              }}>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatsRow({ stats }) {
  const items = [
    { label: 'Active Listings', value: stats.totalListings.toLocaleString(), color: '#059669' },
    { label: 'Converted (30d)', value: stats.recentConversions, color: '#2563EB' },
    { label: 'Rejected (30d)', value: stats.recentRejections, color: '#DC2626' },
    { label: 'Disqualified', value: stats.disqualifiedCount.toLocaleString(), color: '#6B7280' },
    { label: 'Wrong Vertical', value: stats.wrongVerticalCount, color: '#D97706' },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
      marginBottom: 32,
    }}>
      {items.map(item => (
        <div key={item.label} style={{
          padding: '14px 16px', borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: 'var(--color-card-bg, #fff)',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            fontFamily: 'var(--font-body)', color: 'var(--color-muted)', marginBottom: 4,
          }}>
            {item.label}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 24,
            fontWeight: 400, color: item.color,
          }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function VerticalBreakdown({ verticalCounts }) {
  const sorted = Object.entries(verticalCounts).sort((a, b) => b[1] - a[1])

  return (
    <div style={{
      padding: 16, borderRadius: 6,
      border: '1px solid var(--color-border)',
      background: 'var(--color-card-bg, #fff)',
      marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        fontFamily: 'var(--font-body)', color: 'var(--color-muted)', marginBottom: 12,
      }}>
        Pipeline by Vertical
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map(([v, count]) => (
          <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: VERTICAL_COLORS[v], flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: 'var(--color-ink)', width: 90,
            }}>
              {VERTICAL_LABELS[v]}
            </span>
            <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 3 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: VERTICAL_COLORS[v],
                width: `${Math.min(100, (count / Math.max(...Object.values(verticalCounts), 1)) * 100)}%`,
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: 'var(--color-muted)', width: 30, textAlign: 'right',
            }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CandidateRow({ candidate, onAction }) {
  const confidence = candidate.confidence ? Math.round(candidate.confidence * 100) : 0
  const gateScore = candidate.gate_results?.score

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 4,
      border: '1px solid var(--color-border)',
      background: 'var(--color-card-bg, #fff)',
      fontSize: 13, fontFamily: 'var(--font-body)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: VERTICAL_COLORS[candidate.vertical] || '#999',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {candidate.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>
          {candidate.region || candidate.state || '—'} &middot; {VERTICAL_LABELS[candidate.vertical] || candidate.vertical}
          {candidate.source && <> &middot; {SOURCE_LABELS[candidate.source] || candidate.source}</>}
        </div>
      </div>
      {candidate.website_url && (
        <a
          href={candidate.website_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--color-accent)', textDecoration: 'none', flexShrink: 0 }}
        >
          site
        </a>
      )}
      <div style={{
        fontSize: 11, color: confidence >= 70 ? '#059669' : confidence >= 40 ? '#D97706' : '#DC2626',
        fontWeight: 600, width: 36, textAlign: 'right', flexShrink: 0,
      }}>
        {confidence}%
      </div>
      {gateScore !== undefined && (
        <div style={{
          fontSize: 10, color: 'var(--color-muted)', width: 28,
          textAlign: 'right', flexShrink: 0,
        }}>
          G{gateScore}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onAction(candidate.id, 'advance')}
          style={{
            padding: '4px 8px', borderRadius: 3, border: '1px solid var(--color-border)',
            background: 'transparent', fontSize: 11, cursor: 'pointer',
            color: '#059669', fontFamily: 'var(--font-body)',
          }}
          title="Advance to next stage"
        >
          &#x2192;
        </button>
        <button
          onClick={() => onAction(candidate.id, 'reject')}
          style={{
            padding: '4px 8px', borderRadius: 3, border: '1px solid var(--color-border)',
            background: 'transparent', fontSize: 11, cursor: 'pointer',
            color: '#DC2626', fontFamily: 'var(--font-body)',
          }}
          title="Reject"
        >
          &#x2715;
        </button>
      </div>
    </div>
  )
}

function PipelineButton({ label, description, onClick }) {
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState(null)

  const handleClick = useCallback(async () => {
    if (state === 'running') return
    setState('running')
    setMessage(null)
    try {
      const result = await onClick()
      setMessage(result)
      setState('done')
      setTimeout(() => { setState('idle'); setMessage(null) }, 4000)
    } catch {
      setMessage('Error')
      setState('idle')
      setTimeout(() => setMessage(null), 3000)
    }
  }, [state, onClick])

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={state === 'running'}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 4,
          border: '1px solid var(--color-border)',
          background: state === 'running' ? 'var(--color-cream, #f5f0e8)' : 'var(--color-card-bg, #fff)',
          fontSize: 12, fontFamily: 'var(--font-body)',
          color: 'var(--color-ink)', fontWeight: 500,
          cursor: state === 'running' ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <div>{state === 'running' ? `${label}...` : label}</div>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
          {message || description}
        </div>
      </button>
    </div>
  )
}

export default function GrowthDashboard({ stageCounts, verticalCounts, candidates, queueCandidates, stats }) {
  const [activeStage, setActiveStage] = useState('queue')
  const [items, setItems] = useState(candidates)
  const [actionFeedback, setActionFeedback] = useState(null)

  const stageOrder = ['discover', 'verify', 'curate', 'prepare', 'queue']
  const filtered = items.filter(c => c.pipeline_stage === activeStage)

  const handleAction = useCallback(async (id, action) => {
    try {
      if (action === 'advance') {
        const candidate = items.find(c => c.id === id)
        if (!candidate) return
        const currentIdx = stageOrder.indexOf(candidate.pipeline_stage)
        if (currentIdx >= stageOrder.length - 1) {
          // Already at queue — redirect to candidate review
          window.location.href = '/admin/candidates'
          return
        }
        const nextStage = stageOrder[currentIdx + 1]

        const res = await fetch(`/api/admin/candidates/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: nextStage }),
        })

        if (res.ok) {
          setItems(prev => prev.map(c =>
            c.id === id ? { ...c, pipeline_stage: nextStage } : c
          ))
          setActionFeedback(`Moved to ${STAGE_META[nextStage].label}`)
          setTimeout(() => setActionFeedback(null), 2000)
        }
      } else if (action === 'reject') {
        const res = await fetch(`/api/admin/candidates/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        })

        if (res.ok) {
          setItems(prev => prev.filter(c => c.id !== id))
          setActionFeedback('Rejected')
          setTimeout(() => setActionFeedback(null), 2000)
        }
      }
    } catch (err) {
      setActionFeedback('Action failed')
      setTimeout(() => setActionFeedback(null), 2000)
    }
  }, [items])

  return (
    <div>
      {/* Stats row */}
      <StatsRow stats={stats} />

      {/* Pipeline funnel */}
      <StageFunnel stageCounts={stageCounts} />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
        {/* Sidebar */}
        <div>
          <VerticalBreakdown verticalCounts={verticalCounts} />

          {/* Pipeline actions */}
          <div style={{
            padding: 16, borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-card-bg, #fff)',
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)', color: 'var(--color-muted)', marginBottom: 12,
            }}>
              Pipeline Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PipelineButton
                label="Run Prospector"
                description="Discover new candidates via Google Places"
                onClick={async () => {
                  const res = await fetch('/api/admin/run-agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: '/api/cron/prospect' }),
                  })
                  return res.ok ? 'Prospector triggered' : 'Failed to start'
                }}
              />
              <PipelineButton
                label="Process Pipeline"
                description="Auto-advance candidates through stages"
                onClick={async () => {
                  const res = await fetch('/api/admin/pipeline/advance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  })
                  if (!res.ok) return 'Failed'
                  const data = await res.json()
                  return `Advanced ${data.advanced.total} candidates`
                }}
              />
            </div>
          </div>

          {/* Quick links */}
          <div style={{
            padding: 16, borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-card-bg, #fff)',
          }}>
            <div style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)', color: 'var(--color-muted)', marginBottom: 12,
            }}>
              Quick Links
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href="/admin/candidates" style={{
                fontSize: 12, fontFamily: 'var(--font-body)',
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                Review queue ({stageCounts.queue || 0}) &rarr;
              </Link>
              <Link href="/admin/agents" style={{
                fontSize: 12, fontFamily: 'var(--font-body)',
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                Agent runs &rarr;
              </Link>
              <Link href="/suggest" style={{
                fontSize: 12, fontFamily: 'var(--font-body)',
                color: 'var(--color-accent)', textDecoration: 'none',
              }}>
                Submit suggestion &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Main content — stage-filtered list */}
        <div>
          {/* Stage tabs */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 16,
            borderBottom: '1px solid var(--color-border)', paddingBottom: 8,
          }}>
            {stageOrder.map(stage => {
              const meta = STAGE_META[stage]
              const count = items.filter(c => c.pipeline_stage === stage).length
              const isActive = stage === activeStage

              return (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  style={{
                    padding: '6px 14px', borderRadius: 4,
                    border: isActive ? `1px solid ${meta.color}` : '1px solid transparent',
                    background: isActive ? `${meta.color}10` : 'transparent',
                    fontSize: 12, fontFamily: 'var(--font-body)',
                    color: isActive ? meta.color : 'var(--color-muted)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {meta.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Action feedback */}
          {actionFeedback && (
            <div style={{
              padding: '8px 14px', marginBottom: 12, borderRadius: 4,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              fontSize: 12, fontFamily: 'var(--font-body)', color: '#166534',
            }}>
              {actionFeedback}
            </div>
          )}

          {/* Stage description */}
          <div style={{
            fontSize: 12, color: 'var(--color-muted)',
            fontFamily: 'var(--font-body)', marginBottom: 12,
          }}>
            {STAGE_META[activeStage].desc}
          </div>

          {/* Candidate list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 0',
                color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 13,
              }}>
                No candidates in this stage.
              </div>
            ) : (
              filtered.map(c => (
                <CandidateRow key={c.id} candidate={c} onAction={handleAction} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
