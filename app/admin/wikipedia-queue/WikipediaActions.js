'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BUTTON_BASE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 500,
  padding: '6px 16px',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
}

export default function WikipediaActions({ opportunity }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

  async function handleAction(action) {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch('/api/admin/wikipedia-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: opportunity.id, action }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Action failed')
        return
      }

      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginRight: 8 }}>{error}</span>
      )}
      <button
        onClick={() => handleAction('submitted')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #1e40af',
          background: loading === 'submitted' ? '#e8e8e8' : '#1e40af',
          color: loading === 'submitted' ? '#888' : '#fff',
        }}
      >
        {loading === 'submitted' ? 'Marking...' : 'Mark as Submitted'}
      </button>
      <button
        onClick={() => handleAction('dismiss')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: loading === 'dismiss' ? '#e8e8e8' : '#fff',
          color: loading === 'dismiss' ? '#888' : '#a44',
        }}
      >
        {loading === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
      </button>
    </div>
  )
}
