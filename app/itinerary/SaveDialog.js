'use client'

import { useState } from 'react'

export default function SaveDialog({ result, title, onClose }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = result.shortCode ? `${origin}/t/${result.shortCode}` : ''
  const viewUrl = result.slug ? `/trails/${result.slug}` : shareUrl

  function copy() {
    if (!shareUrl) return
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="ie-modal-backdrop" onClick={onClose}>
      <div className="ie-modal" onClick={(e) => e.stopPropagation()}>
        {result.error ? (
          <>
            <p className="ie-eyebrow" style={{ color: 'var(--color-accent)', marginBottom: 12 }}>Couldn’t save</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-ink)', marginBottom: 10 }}>Let’s try that again</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 24 }}>{result.error}</p>
            <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>Back to my trip</button>
          </>
        ) : (
          <>
            <p className="ie-eyebrow" style={{ color: 'var(--color-sage)', marginBottom: 12 }}>Saved</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 8 }}>
              “{title}” is ready
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14.5, color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 22 }}>
              Share the link with anyone — no account needed to open it.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, padding: '11px 13px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--color-ink)', minWidth: 0 }}
              />
              <button onClick={copy} className="btn btn-sage btn-sm" style={{ whiteSpace: 'nowrap' }}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>

            <a href={viewUrl} className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
              View your trip →
            </a>
            <button onClick={onClose} style={{ display: 'block', width: '100%', marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Keep editing
            </button>
          </>
        )}
      </div>
    </div>
  )
}
