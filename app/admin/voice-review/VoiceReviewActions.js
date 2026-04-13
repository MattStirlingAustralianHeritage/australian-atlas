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

export default function VoiceReviewActions({ evaluationId, suggestedRewrite }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(suggestedRewrite)

  async function handleAction(action, description) {
    setLoading(action)
    setError(null)

    try {
      const body = { evaluationId, action }
      if (description !== undefined) body.description = description

      const res = await fetch('/api/admin/voice-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  if (editing) {
    return (
      <div style={{ marginTop: 12 }}>
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: 6,
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => handleAction('accept', editText.trim())}
            disabled={loading !== null || !editText.trim()}
            style={{
              ...BUTTON_BASE,
              border: '1px solid #4a7c59',
              background: loading === 'accept' ? '#e8e8e8' : '#4a7c59',
              color: loading === 'accept' ? '#888' : '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading === 'accept' ? 'Saving...' : 'Save & Accept'}
          </button>
          <button
            onClick={() => { setEditing(false); setEditText(suggestedRewrite) }}
            disabled={loading !== null}
            style={{
              ...BUTTON_BASE,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff',
              color: 'var(--color-muted, #888)',
            }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginTop: 6 }}>
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginRight: 8 }}>
          {error}
        </span>
      )}

      <button
        onClick={() => handleAction('accept')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #4a7c59',
          background: loading === 'accept' ? '#e8e8e8' : '#4a7c59',
          color: loading === 'accept' ? '#888' : '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'accept' ? 'Accepting...' : 'Accept Rewrite'}
      </button>

      <button
        onClick={() => setEditing(true)}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #C49A3C',
          background: '#fff',
          color: '#C49A3C',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        Edit & Accept
      </button>

      <button
        onClick={() => handleAction('dismiss')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: loading === 'dismiss' ? '#e8e8e8' : '#fff',
          color: loading === 'dismiss' ? '#888' : 'var(--color-muted, #888)',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
      </button>
    </div>
  )
}
