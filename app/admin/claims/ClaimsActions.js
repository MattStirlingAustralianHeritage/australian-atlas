'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClaimsActions({ claimId, vertical, sourceClaimId, usingPortalTable }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null) // 'approve' | 'reject' | null
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [error, setError] = useState(null)

  async function handleAction(action) {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId,
          vertical,
          sourceClaimId,
          usingPortalTable,
          action,
          admin_notes: notes || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Action failed')
        return
      }

      // Refresh the page to show updated state
      router.refresh()
    } catch (err) {
      setError('Network error — please try again')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      {showNotes && (
        <div style={{ marginBottom: 8 }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Admin notes (optional)..."
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border, #e5e5e5)',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 12,
              color: 'var(--color-ink, #2D2A26)',
              resize: 'vertical',
              minHeight: 48,
            }}
          />
        </div>
      )}

      {error && (
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 12,
          color: '#c44',
          margin: '0 0 8px',
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => handleAction('approve')}
          disabled={loading !== null}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #4a7c59',
            background: loading === 'approve' ? '#e8e8e8' : '#4a7c59',
            color: loading === 'approve' ? '#888' : '#fff',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 12,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading === 'approve' ? 'Approving...' : 'Approve'}
        </button>

        <button
          onClick={() => {
            if (!showNotes) {
              setShowNotes(true)
              return
            }
            handleAction('reject')
          }}
          disabled={loading !== null}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--color-border, #e5e5e5)',
            background: loading === 'reject' ? '#e8e8e8' : '#fff',
            color: loading === 'reject' ? '#888' : '#a44',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 12,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading === 'reject' ? 'Rejecting...' : showNotes ? 'Confirm Reject' : 'Reject'}
        </button>

        {!showNotes && (
          <button
            onClick={() => setShowNotes(true)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-muted, #888)',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + note
          </button>
        )}
      </div>
    </div>
  )
}
