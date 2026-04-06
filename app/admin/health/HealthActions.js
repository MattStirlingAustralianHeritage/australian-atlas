'use client'

import { useState } from 'react'

export default function HealthActions({ orphanedCount }) {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [result, setResult] = useState(null)

  const runBackfill = async () => {
    if (status === 'running') return
    setStatus('running')
    setResult(null)

    try {
      const res = await fetch('/api/admin/backfill-verticals', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setResult({ error: data.error || 'Backfill failed' })
        setStatus('error')
        return
      }

      setResult(data)
      setStatus('done')
    } catch (err) {
      setResult({ error: err.message })
      setStatus('error')
    }
  }

  if (orphanedCount === 0 && status === 'idle') return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {status === 'done' && result && (
        <span style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem',
          color: '#4A7C59', fontWeight: 500,
        }}>
          {result.succeeded} synced{result.failed > 0 ? `, ${result.failed} failed` : ''}
        </span>
      )}

      {status === 'error' && result && (
        <span style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: '0.75rem',
          color: '#CC4444', fontWeight: 500,
        }}>
          {result.error}
        </span>
      )}

      <button
        onClick={runBackfill}
        disabled={status === 'running'}
        style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '5px 14px',
          borderRadius: 6,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: status === 'running' ? 'var(--color-cream, #FAF8F5)' : '#fff',
          color: 'var(--color-ink, #2D2A26)',
          cursor: status === 'running' ? 'default' : 'pointer',
          opacity: status === 'running' ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {status === 'running' && (
          <span style={{
            display: 'inline-block', width: 10, height: 10,
            border: '1.5px solid var(--color-border, #e5e5e5)',
            borderTopColor: 'var(--color-ink, #2D2A26)',
            borderRadius: '50%',
            animation: 'healthSpinner 0.6s linear infinite',
          }} />
        )}
        {status === 'running' ? 'Syncing...' : status === 'done' ? 'Run again' : 'Sync to verticals'}
      </button>

      <style>{`@keyframes healthSpinner { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
