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

export default function EnrichmentActions({ listing }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(listing.ai_description || '')

  async function handleAction(action, description) {
    setLoading(action)
    setError(null)

    try {
      const body = { id: listing.id, action }
      if (description !== undefined) body.description = description

      const res = await fetch('/api/admin/enrichment-review', {
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
            onClick={() => handleAction('approve', editText.trim())}
            disabled={loading !== null || !editText.trim()}
            style={{
              ...BUTTON_BASE,
              border: '1px solid #4a7c59',
              background: loading === 'approve' ? '#e8e8e8' : '#4a7c59',
              color: loading === 'approve' ? '#888' : '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading === 'approve' ? 'Saving...' : 'Save & Approve'}
          </button>
          <button
            onClick={() => { setEditing(false); setEditText(listing.ai_description || '') }}
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
        {loading === 'approve' ? 'Approving...' : 'Approve'}
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
        Edit & Approve
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


/**
 * Expandable source text viewer for enrichment review.
 * Shows the scraped website content used to generate the AI description.
 */
export function SourceTextToggle({ sourceText, wordCount }) {
  const [open, setOpen] = useState(false)

  if (!sourceText) return null

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 500,
          color: '#666',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
          textDecorationColor: '#ccc',
          textUnderlineOffset: 2,
        }}
      >
        {open ? 'Hide source material' : 'View source material'}
        {wordCount != null && ` (${wordCount} words)`}
      </button>
      {open && (
        <div style={{
          marginTop: 8,
          padding: '12px 14px',
          borderRadius: 6,
          background: '#f0eeea',
          border: '1px solid #e0ddd6',
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: 1.55,
          color: '#444',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {sourceText}
        </div>
      )}
    </div>
  )
}


/**
 * Bulk approve button — used at the top of the review page.
 * Approves all listed IDs sequentially.
 */
export function BulkApproveButton({ listingIds }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  async function handleBulkApprove() {
    if (!confirm(`Approve all ${listingIds.length} descriptions? This will copy each AI description to the listing description.`)) {
      return
    }

    setLoading(true)
    setError(null)
    setProgress(0)

    let completed = 0
    let failed = 0

    for (const id of listingIds) {
      try {
        const res = await fetch('/api/admin/enrichment-review', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'approve' }),
        })

        if (!res.ok) failed++
        else completed++
      } catch {
        failed++
      }

      setProgress(completed + failed)
    }

    setLoading(false)

    if (failed > 0) {
      setError(`${failed} of ${listingIds.length} failed`)
    }

    router.refresh()
  }

  if (listingIds.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleBulkApprove}
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
        {loading ? `Approving ${progress}/${listingIds.length}...` : `Approve All (${listingIds.length})`}
      </button>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44' }}>
          {error}
        </span>
      )}
    </div>
  )
}
