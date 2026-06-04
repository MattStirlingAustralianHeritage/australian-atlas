'use client'

import { useState, useRef, useEffect } from 'react'

// "Drop a URL, get it sorted into a vertical." Pill button that expands into
// a single URL box; on submit it POSTs to /api/admin/candidates/classify,
// which fetches the page, asks Claude which vertical it belongs to, and
// inserts a pending candidate. onCreated splices it into the queue (and
// switches the filter to its vertical) exactly like the manual add form.

const inputStyle = {
  flex: 1, minWidth: 0, boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8,
  padding: '9px 12px',
}

export default function SuggestUrlPill({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { verticalName, confidence }
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  const close = () => {
    setUrl('')
    setError(null)
    setResult(null)
    setSubmitting(false)
    setOpen(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!url.trim()) { setError('Paste a URL first'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/candidates/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not sort that URL')
        setSubmitting(false)
        return
      }

      // Splice the new candidate into the queue + jump to its vertical.
      onCreated?.(data.candidate)

      const c = data.classification || {}
      setResult({
        verticalName: c.verticalName || data.candidate?.vertical || 'a vertical',
        confidence: typeof c.confidence === 'number' ? Math.round(c.confidence * 100) : null,
      })
      setUrl('') // ready for the next paste
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'var(--color-sage)', background: 'var(--color-cream)',
            border: '1px solid var(--color-sage)', borderRadius: 100,
            padding: '6px 14px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            transition: 'all 0.15s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 9.5L9.5 6.5M7 4.5l.7-.7a2.5 2.5 0 0 1 3.5 3.5l-.7.7M9 11.5l-.7.7a2.5 2.5 0 0 1-3.5-3.5l.7-.7"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sort a URL
        </button>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: 12, padding: '14px 16px',
      background: 'var(--color-cream)', borderRadius: 12,
      border: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
        }}>
          Drop a URL — we&rsquo;ll sort it into a vertical
        </span>
        <button
          onClick={close}
          aria-label="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
          }}
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (error) setError(null) }}
          placeholder="https://www.commonfolkcoffee.com.au/"
          disabled={submitting}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em',
            color: '#fff', background: submitting ? '#8a9a86' : 'var(--color-sage)',
            border: 'none', borderRadius: 8, padding: '9px 18px',
            cursor: submitting ? 'default' : 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          {submitting ? (
            <>
              <div style={{
                width: 13, height: 13,
                border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'candidateSpinner 0.6s linear infinite',
              }} />
              Sorting…
            </>
          ) : 'Sort'}
        </button>
      </form>

      {(result || error) && (
        <div style={{ marginTop: 8 }}>
          {result && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'var(--color-sage)',
            }}>
              → Sorted into {result.verticalName}
              {result.confidence != null ? ` (${result.confidence}% match)` : ''} — added to the queue.
            </span>
          )}
          {error && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: '#CC4444',
            }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
