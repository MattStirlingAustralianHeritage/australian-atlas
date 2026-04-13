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

export default function SeoContentActions({ page }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(page.content || '')

  async function handleAction(action, content) {
    setLoading(action)
    setError(null)

    try {
      const body = { id: page.id, action }
      if (content !== undefined) body.content = content

      const res = await fetch('/api/admin/seo-content', {
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
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          rows={8}
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
            onClick={() => handleAction('publish', editContent.trim())}
            disabled={loading !== null || !editContent.trim()}
            style={{
              ...BUTTON_BASE,
              border: '1px solid #4a7c59',
              background: loading === 'publish' ? '#e8e8e8' : '#4a7c59',
              color: loading === 'publish' ? '#888' : '#fff',
            }}
          >
            {loading === 'publish' ? 'Publishing...' : 'Save & Publish'}
          </button>
          <button
            onClick={() => { setEditing(false); setEditContent(page.content || '') }}
            disabled={loading !== null}
            style={{
              ...BUTTON_BASE,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff',
              color: 'var(--color-muted)',
            }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginTop: 6 }}>{error}</p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginRight: 8 }}>{error}</span>
      )}
      <button
        onClick={() => handleAction('publish')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #4a7c59',
          background: loading === 'publish' ? '#e8e8e8' : '#4a7c59',
          color: loading === 'publish' ? '#888' : '#fff',
        }}
      >
        {loading === 'publish' ? 'Publishing...' : 'Publish'}
      </button>
      <button
        onClick={() => setEditing(true)}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #C49A3C',
          background: '#fff',
          color: '#C49A3C',
        }}
      >
        Edit & Publish
      </button>
      <button
        onClick={() => handleAction('reject')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid var(--color-border, #e5e5e5)',
          background: loading === 'reject' ? '#e8e8e8' : '#fff',
          color: loading === 'reject' ? '#888' : '#a44',
        }}
      >
        {loading === 'reject' ? 'Rejecting...' : 'Reject'}
      </button>
    </div>
  )
}


export function BulkPublishButton({ pageIds }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  async function handleBulkPublish() {
    if (!confirm(`Publish all ${pageIds.length} draft pages?`)) return

    setLoading(true)
    setError(null)
    setProgress(0)

    let completed = 0
    let failed = 0

    for (const id of pageIds) {
      try {
        const res = await fetch('/api/admin/seo-content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'publish' }),
        })
        if (!res.ok) failed++
        else completed++
      } catch {
        failed++
      }
      setProgress(completed + failed)
    }

    setLoading(false)
    if (failed > 0) setError(`${failed} of ${pageIds.length} failed`)
    router.refresh()
  }

  if (pageIds.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleBulkPublish}
        disabled={loading}
        style={{
          ...BUTTON_BASE,
          padding: '8px 20px',
          border: '1px solid #4a7c59',
          background: loading ? '#e8e8e8' : '#4a7c59',
          color: loading ? '#888' : '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? `Publishing ${progress}/${pageIds.length}...` : `Publish All (${pageIds.length})`}
      </button>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44' }}>{error}</span>
      )}
    </div>
  )
}
