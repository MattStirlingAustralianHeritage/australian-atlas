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

export default function ImageCandidateActions({ listingId }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

  async function handleAction(action) {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch('/api/admin/dead-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: listingId, action }),
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
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginRight: 8 }}>
          {error}
        </span>
      )}

      <button
        onClick={() => handleAction('approve')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #4a7c59',
          background: loading === 'approve' ? '#e8e8e8' : '#4a7c59',
          color: loading === 'approve' ? '#888' : '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'approve' ? 'Approving...' : 'Approve as Hero'}
      </button>

      <button
        onClick={() => handleAction('reject')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: loading === 'reject' ? '#e8e8e8' : '#fff',
          color: loading === 'reject' ? '#888' : '#a44',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'reject' ? 'Rejecting...' : 'Reject'}
      </button>
    </div>
  )
}
