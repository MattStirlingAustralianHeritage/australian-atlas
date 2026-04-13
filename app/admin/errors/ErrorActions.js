'use client'

import { useState } from 'react'

export default function ErrorActions() {
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState(null)

  async function handleClearOld() {
    if (!confirm('Delete all client errors older than 30 days?')) return

    setClearing(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/errors?older_than=30d', {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to clear errors')
      }
      const data = await res.json()
      setResult(`Cleared ${data.deleted || 0} old errors.`)
      // Reload the page to reflect changes
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setResult(`Error: ${err.message}`)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {result && (
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 12,
          color: result.startsWith('Error') ? '#991b1b' : '#166534',
        }}>
          {result}
        </span>
      )}
      <button
        onClick={handleClearOld}
        disabled={clearing}
        style={{
          padding: '8px 16px', borderRadius: 6,
          border: '1px solid #e5d5d5', background: '#fff',
          color: '#991b1b', fontFamily: 'var(--font-body)',
          fontSize: 12, fontWeight: 600,
          cursor: clearing ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {clearing ? 'Clearing...' : 'Clear old errors'}
      </button>
    </div>
  )
}
