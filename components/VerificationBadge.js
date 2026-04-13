'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Floating verification badge — bottom-left corner of listing pages.
 * Visible only to admin users (controlled by server-side `isAdmin` prop gate).
 *
 * Shows:
 *  - Current listing verification status (green check or grey circle)
 *  - Network verification progress counter: "X / Y verified"
 *  - One-click verify button (green arrow) when unverified
 *
 * On click: sets verified=true, verified_at=now(), verification_source='editorial_review'
 */
export default function VerificationBadge({ listingId, listingName, initialVerified }) {
  const [verified, setVerified] = useState(initialVerified)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState(null)
  const [justVerified, setJustVerified] = useState(false)

  // Fetch network verification stats on mount
  useEffect(() => {
    fetch('/api/admin/verify/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data) })
      .catch(() => {})
  }, [])

  const handleVerify = useCallback(async () => {
    if (verified || saving) return
    setSaving(true)

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      })

      if (res.ok) {
        setVerified(true)
        setJustVerified(true)
        // Update local stats counter
        if (stats) {
          setStats(prev => prev ? { ...prev, verified: prev.verified + 1 } : prev)
        }
        // Brief flash animation, then settle
        setTimeout(() => setJustVerified(false), 1500)
      }
    } catch {
      // Silently fail — badge is ambient, not critical
    } finally {
      setSaving(false)
    }
  }, [listingId, verified, saving, stats])

  const verifiedColor = '#2D7A3A'
  const unverifiedColor = '#9CA3AF'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '1.25rem',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: verified ? 'rgba(45, 122, 58, 0.06)' : 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${verified ? 'rgba(45, 122, 58, 0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
        borderRadius: '10px',
        padding: '0.5rem 0.75rem',
        fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.3s ease',
        transform: justVerified ? 'scale(1.04)' : 'scale(1)',
        maxWidth: '280px',
      }}
    >
      {/* Status indicator */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: verified ? verifiedColor : unverifiedColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.3s ease',
        }}
      >
        {verified ? (
          // Checkmark
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7.5L5.5 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          // Empty circle indicator
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.6)',
          }} />
        )}
      </div>

      {/* Text info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: verified ? verifiedColor : '#374151',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {verified ? 'Verified' : 'Unverified'}
        </div>
        {stats && (
          <div style={{
            fontSize: '10px',
            color: '#9CA3AF',
            lineHeight: 1.3,
            fontWeight: 400,
            letterSpacing: '0.01em',
          }}>
            {stats.verified.toLocaleString()} / {stats.total.toLocaleString()} verified
          </div>
        )}
      </div>

      {/* Verify button — only shown when unverified */}
      {!verified && (
        <button
          onClick={handleVerify}
          disabled={saving}
          title={`Verify "${listingName}"`}
          style={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            border: 'none',
            background: saving ? '#86EFAC' : verifiedColor,
            color: '#fff',
            cursor: saving ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            opacity: saving ? 0.7 : 1,
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {saving ? (
            // Spinner
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'vb-spin 0.6s linear infinite' }}>
              <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
              <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            // Checkmark arrow
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}

      <style>{`
        @keyframes vb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
