'use client'

import { useState } from 'react'

export default function BackfillButton() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleRun() {
    if (running) return
    setRunning(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/admin/quality-backfill', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Backfill failed')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err.message || 'Network error')
    }

    setRunning(false)
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border, #e5e5e5)',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: result ? '1rem' : 0 }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--color-ink, #2D2A26)',
            margin: 0,
          }}>
            Quality Score Backfill
          </h2>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.8rem',
            color: 'var(--color-muted, #888)',
            margin: '0.25rem 0 0',
          }}>
            Recalculate quality scores for all active listings using the standardised rubric
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: running ? 'var(--color-muted, #888)' : 'var(--color-ink, #2D2A26)',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: running ? 'wait' : 'pointer',
            fontFamily: 'var(--font-body, system-ui)',
            whiteSpace: 'nowrap',
            opacity: running ? 0.7 : 1,
          }}
        >
          {running ? 'Running...' : 'Run Backfill'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#fef2f2',
          color: '#c53030',
          fontSize: '0.85rem',
          fontFamily: 'var(--font-body, system-ui)',
        }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-body, system-ui)', color: 'var(--color-ink, #2D2A26)' }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#f0fff4',
            color: '#276749',
            marginBottom: '1rem',
            fontWeight: 500,
          }}>
            Backfill complete: {result.updated.toLocaleString()} listings updated in {result.elapsedSeconds}s
            {result.errors > 0 && ` (${result.errors} errors)`}
          </div>

          {/* Distribution from backfill result */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.8rem', margin: '0 0 0.5rem', color: 'var(--color-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Updated Distribution
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {Object.entries(result.distribution).map(([range, count]) => {
                const pct = result.totalScored > 0 ? (count / result.totalScored) * 100 : 0
                return (
                  <div key={range} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '55px', textAlign: 'right', fontWeight: 600, fontSize: '0.8rem' }}>{range}</span>
                    <div style={{ flex: 1, background: '#f0ede7', borderRadius: '4px', height: '16px', overflow: 'hidden' }}>
                      <div style={{
                        height: '16px',
                        width: `${Math.max(pct, 1)}%`,
                        background: 'var(--color-accent, #C49A3C)',
                        borderRadius: '4px',
                      }} />
                    </div>
                    <span style={{ width: '90px', fontSize: '0.75rem', color: 'var(--color-muted, #888)' }}>
                      {count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted, #888)', margin: 0 }}>
            Reload the page to see updated scores in the report below.
          </p>
        </div>
      )}
    </div>
  )
}
