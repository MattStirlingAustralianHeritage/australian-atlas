'use client'

import { useState, useEffect, useCallback } from 'react'

const VERTICALS = [
  'sba', 'collection', 'craft', 'fine_grounds', 'rest',
  'field', 'found', 'corner', 'table', 'portal',
]

const VERTICAL_TOKENS = {
  sba: { bg: '#1a2e1f', text: '#e8f0e9', label: 'Small Batch Atlas' },
  collection: { bg: '#1a2433', text: '#e0e8f0', label: 'Culture Atlas' },
  craft: { bg: '#2a1f14', text: '#f0e8d8', label: 'Craft Atlas' },
  fine_grounds: { bg: '#1f1a14', text: '#f0e8d8', label: 'Fine Grounds Atlas' },
  rest: { bg: '#141a2a', text: '#d8e0f0', label: 'Rest Atlas' },
  field: { bg: '#1a2414', text: '#e0f0d8', label: 'Field Atlas' },
  found: { bg: '#1f1f1a', text: '#e8e8d8', label: 'Found Atlas' },
  corner: { bg: '#241a2a', text: '#e8d8f0', label: 'Corner Atlas' },
  table: { bg: '#1a2a1a', text: '#d8f0d8', label: 'Table Atlas' },
  portal: { bg: '#1a1a1a', text: '#e8e8e8', label: 'Australian Atlas' },
}

const CONFIDENCE_COLORS = {
  HIGH: { bg: 'rgba(22,163,74,0.2)', border: 'rgba(22,163,74,0.4)', text: '#4ade80' },
  MEDIUM: { bg: 'rgba(196,154,60,0.2)', border: 'rgba(196,154,60,0.4)', text: '#C49A3C' },
  LOW: { bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.3)', text: '#f87171' },
}

export default function EditorialPitches() {
  const [pitches, setPitches] = useState({})
  const [loadingVerticals, setLoadingVerticals] = useState(new Set())
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/admin/editorial-pitches')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return

        setPitches(data.pitches || {})

        const existing = data.pitches || {}
        const missing = VERTICALS.filter(v => !existing[v])

        for (const vertical of missing) {
          if (cancelled) break
          setLoadingVerticals(prev => new Set([...prev, vertical]))
          try {
            const genRes = await fetch('/api/admin/editorial-pitches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'generate', vertical }),
            })
            if (genRes.ok) {
              const genData = await genRes.json()
              if (!cancelled) {
                setPitches(prev => ({ ...prev, [vertical]: genData.pitch }))
              }
            }
          } catch {
            // Silent
          } finally {
            if (!cancelled) {
              setLoadingVerticals(prev => {
                const next = new Set(prev)
                next.delete(vertical)
                return next
              })
            }
          }
          if (missing.indexOf(vertical) < missing.length - 1) {
            await new Promise(r => setTimeout(r, 1000))
          }
        }
      } catch {
        // Silent
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const handleAction = useCallback(async (action, vertical, pitchId) => {
    setLoadingVerticals(prev => new Set([...prev, vertical]))
    try {
      const res = await fetch('/api/admin/editorial-pitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, vertical, pitchId }),
      })
      if (res.ok) {
        const data = await res.json()
        setPitches(prev => ({ ...prev, [vertical]: data.pitch }))
      }
    } catch {
      // Silent
    } finally {
      setLoadingVerticals(prev => {
        const next = new Set(prev)
        next.delete(vertical)
        return next
      })
    }
  }, [])

  return (
    <div style={{ padding: '1.25rem 1.5rem 0', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-muted, #6B6760)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          margin: 0,
        }}>
          Editorial Pitches
        </h2>
        {initialLoading && (
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.65rem',
            color: 'var(--color-muted, #6B6760)',
          }}>
            Loading...
          </span>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
      }}>
        {VERTICALS.map(vertical => {
          const pitch = pitches[vertical]
          const isLoading = loadingVerticals.has(vertical)
          const tokens = VERTICAL_TOKENS[vertical]

          return (
            <PitchCard
              key={vertical}
              vertical={vertical}
              tokens={tokens}
              pitch={pitch}
              isLoading={isLoading}
              onApprove={() => handleAction('approve', vertical, pitch?.id)}
              onReject={() => handleAction('reject', vertical, pitch?.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function PitchCard({ vertical, tokens, pitch, isLoading, onApprove, onReject }) {
  const confidence = pitch?.confidence
  const confColors = confidence ? CONFIDENCE_COLORS[confidence] : null
  const verifiedCount = pitch?.verified_facts?.length || 0
  const connectionsCount = pitch?.cross_vertical_connections?.length || 0

  return (
    <div style={{
      background: tokens.bg,
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      minHeight: '220px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Vertical label + confidence badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.25rem 0.65rem',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.1)',
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.6rem',
          fontWeight: 600,
          color: tokens.text,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {tokens.label}
        </span>
        {confColors && (
          <span style={{
            display: 'inline-block',
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            background: confColors.bg,
            border: `1px solid ${confColors.border}`,
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.55rem',
            fontWeight: 700,
            color: confColors.text,
            letterSpacing: '0.06em',
          }}>
            {confidence}
          </span>
        )}
      </div>

      {isLoading ? (
        <LoadingState tokens={tokens} />
      ) : pitch ? (
        <>
          {/* Headline */}
          <h3 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: tokens.text,
            margin: 0,
            lineHeight: 1.3,
          }}>
            {pitch.headline}
          </h3>

          {/* Angle */}
          <p style={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: '0.8rem',
            color: `${tokens.text}cc`,
            margin: 0,
            lineHeight: 1.5,
            flex: 1,
          }}>
            {pitch.angle}
          </p>

          {/* Meta row: venue, read time, grounding stats */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: '0.675rem',
            color: `${tokens.text}88`,
            flexWrap: 'wrap',
          }}>
            {pitch.suggested_venue && (
              <span>{pitch.suggested_venue}</span>
            )}
            {pitch.estimated_read_time && (
              <span>{pitch.estimated_read_time} read</span>
            )}
            {verifiedCount > 0 && (
              <span style={{ color: `${tokens.text}66` }}>
                {verifiedCount} verified fact{verifiedCount !== 1 ? 's' : ''}
              </span>
            )}
            {connectionsCount > 0 && (
              <span style={{ color: `${tokens.text}66` }}>
                {connectionsCount} cross-vertical link{connectionsCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* View brief link */}
          <a
            href={`/admin/editorial/pitch/${pitch.id}`}
            style={{
              display: 'inline-block',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: `${tokens.text}99`,
              textDecoration: 'none',
              marginTop: '0.15rem',
            }}
          >
            View Full Brief &rarr;
          </a>

          {/* Action buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}>
            <button
              onClick={onApprove}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(95,138,126,0.4)',
                background: 'rgba(95,138,126,0.15)',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#a8d4c4',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(95,138,126,0.3)'
                e.currentTarget.style.borderColor = 'rgba(95,138,126,0.6)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(95,138,126,0.15)'
                e.currentTarget.style.borderColor = 'rgba(95,138,126,0.4)'
              }}
            >
              Approve
            </button>
            <button
              onClick={onReject}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(196,96,58,0.3)',
                background: 'rgba(196,96,58,0.1)',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'rgba(196,96,58,0.7)',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(196,96,58,0.2)'
                e.currentTarget.style.borderColor = 'rgba(196,96,58,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(196,96,58,0.1)'
                e.currentTarget.style.borderColor = 'rgba(196,96,58,0.3)'
              }}
            >
              Reject
            </button>
          </div>
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: '0.8rem',
            color: `${tokens.text}66`,
          }}>
            No pitch available
          </span>
        </div>
      )}
    </div>
  )
}

function LoadingState({ tokens }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes editorialPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
      <div style={{
        width: '75%',
        height: '14px',
        borderRadius: '4px',
        background: `${tokens.text}22`,
        animation: 'editorialPulse 1.5s ease-in-out infinite',
      }} />
      <div style={{
        width: '100%',
        height: '10px',
        borderRadius: '4px',
        background: `${tokens.text}15`,
        animation: 'editorialPulse 1.5s ease-in-out infinite 0.2s',
      }} />
      <div style={{
        width: '85%',
        height: '10px',
        borderRadius: '4px',
        background: `${tokens.text}15`,
        animation: 'editorialPulse 1.5s ease-in-out infinite 0.4s',
      }} />
      <span style={{
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontSize: '0.7rem',
        color: `${tokens.text}55`,
        marginTop: '0.25rem',
      }}>
        Selecting candidate &amp; generating grounded pitch...
      </span>
    </div>
  )
}
