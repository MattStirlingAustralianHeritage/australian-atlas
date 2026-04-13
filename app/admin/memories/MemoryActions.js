'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MemoryActions({ memoryId }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null) // 'approve' | 'reject' | 'pullquote'

  async function handleAction(action) {
    setLoading(action)
    try {
      const res = await fetch('/api/admin/memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memoryId, action }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch (err) {
      console.error(`Failed to ${action} memory:`, err)
    }
    setLoading(null)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={() => handleAction('approve')}
        disabled={loading !== null}
        style={{
          padding: '0.4rem 0.9rem',
          borderRadius: 6,
          border: 'none',
          background: loading === 'approve' ? '#86efac' : '#22c55e',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: loading !== null ? 'wait' : 'pointer',
          opacity: loading !== null && loading !== 'approve' ? 0.5 : 1,
        }}
      >
        {loading === 'approve' ? 'Approving...' : 'Approve'}
      </button>

      <button
        onClick={() => handleAction('reject')}
        disabled={loading !== null}
        style={{
          padding: '0.4rem 0.9rem',
          borderRadius: 6,
          border: '1px solid #fca5a5',
          background: '#fff',
          color: '#dc2626',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: loading !== null ? 'wait' : 'pointer',
          opacity: loading !== null && loading !== 'reject' ? 0.5 : 1,
        }}
      >
        {loading === 'reject' ? 'Rejecting...' : 'Reject'}
      </button>

      <button
        onClick={() => handleAction('pullquote')}
        disabled={loading !== null}
        style={{
          padding: '0.4rem 0.9rem',
          borderRadius: 6,
          border: '1px solid #fcd34d',
          background: '#fffbeb',
          color: '#92400e',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: loading !== null ? 'wait' : 'pointer',
          opacity: loading !== null && loading !== 'pullquote' ? 0.5 : 1,
        }}
      >
        {loading === 'pullquote' ? 'Flagging...' : 'Pull Quote'}
      </button>
    </div>
  )
}
