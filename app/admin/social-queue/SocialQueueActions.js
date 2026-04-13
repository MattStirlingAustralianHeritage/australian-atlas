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

export default function SocialQueueActions({ item }) {
  const router = useRouter()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  async function handleAction(action) {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch('/api/admin/social-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action }),
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

  async function handleCopy(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const posts = Array.isArray(item.social_posts) ? item.social_posts : []

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--color-border, #e5e5e5)' }}>
      {error && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44', marginRight: 8 }}>{error}</span>
      )}

      <button
        onClick={() => handleAction('approve')}
        disabled={loading !== null}
        style={{
          ...BUTTON_BASE,
          border: '1px solid #4a7c59',
          background: loading === 'approve' ? '#e8e8e8' : '#4a7c59',
          color: loading === 'approve' ? '#888' : '#fff',
        }}
      >
        {loading === 'approve' ? 'Approving...' : 'Approve All'}
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

      {/* Copy buttons for each post */}
      {posts.map((post, i) => {
        const text = post.text || post
        const label = `post${i}`
        return (
          <button
            key={i}
            onClick={() => handleCopy(text, label)}
            style={{
              ...BUTTON_BASE,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: copied === label ? '#f0fdf4' : '#fff',
              color: copied === label ? '#166534' : 'var(--color-muted)',
            }}
          >
            {copied === label ? 'Copied' : `Copy Post ${i + 1}`}
          </button>
        )
      })}

      {item.newsletter_excerpt && (
        <button
          onClick={() => handleCopy(item.newsletter_excerpt, 'newsletter')}
          style={{
            ...BUTTON_BASE,
            border: '1px solid var(--color-border, #e5e5e5)',
            background: copied === 'newsletter' ? '#f0fdf4' : '#fff',
            color: copied === 'newsletter' ? '#166534' : 'var(--color-muted)',
          }}
        >
          {copied === 'newsletter' ? 'Copied' : 'Copy Newsletter'}
        </button>
      )}
    </div>
  )
}


export function BulkApproveAllButton({ ids }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  async function handleBulk() {
    if (!confirm(`Approve all ${ids.length} content packages?`)) return

    setLoading(true)
    setError(null)
    setProgress(0)

    let completed = 0
    let failed = 0

    for (const id of ids) {
      try {
        const res = await fetch('/api/admin/social-queue', {
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
    if (failed > 0) setError(`${failed} of ${ids.length} failed`)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleBulk}
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
        {loading ? `Approving ${progress}/${ids.length}...` : `Approve All (${ids.length})`}
      </button>
      {error && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c44' }}>{error}</span>}
    </div>
  )
}
