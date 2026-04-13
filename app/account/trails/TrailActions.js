'use client'

import { useState } from 'react'
import Link from 'next/link'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'link', label: 'Link only' },
  { value: 'public', label: 'Public' },
]

export default function TrailActions({ trailId, shortCode, slug, visibility, onDelete }) {
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [currentVisibility, setCurrentVisibility] = useState(visibility)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)

  const shareUrl = `https://australianatlas.com.au/t/${shortCode}`
  const viewHref = slug ? `/trails/${slug}` : `/t/${shortCode}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/trails/${trailId}`, { method: 'DELETE' })
      if (res.ok) {
        if (onDelete) onDelete()
      } else {
        console.error('Delete failed')
        setDeleting(false)
        setConfirmDelete(false)
      }
    } catch (err) {
      console.error('Delete error:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleVisibilityChange(newVisibility) {
    if (newVisibility === currentVisibility) return
    setUpdatingVisibility(true)
    try {
      const res = await fetch(`/api/trails/${trailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVisibility }),
      })
      if (res.ok) {
        setCurrentVisibility(newVisibility)
      }
    } catch (err) {
      console.error('Visibility update error:', err)
    }
    setUpdatingVisibility(false)
  }

  const buttonBase = {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: '#fff',
    fontFamily: 'var(--font-body)',
    fontSize: '0.78rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    textDecoration: 'none',
    color: 'var(--color-ink)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      {/* View */}
      <Link href={viewHref} style={buttonBase}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        View
      </Link>

      {/* Share / Copy link */}
      <button onClick={handleCopy} style={{
        ...buttonBase,
        background: copied ? '#dcfce7' : '#fff',
        borderColor: copied ? '#86efac' : 'var(--color-border)',
        color: copied ? '#166534' : 'var(--color-ink)',
      }}>
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </>
        )}
      </button>

      {/* Visibility selector */}
      <select
        value={currentVisibility}
        onChange={(e) => handleVisibilityChange(e.target.value)}
        disabled={updatingVisibility}
        style={{
          padding: '0.4rem 0.5rem',
          borderRadius: '6px',
          border: '1px solid var(--color-border)',
          background: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '0.78rem',
          color: 'var(--color-ink)',
          cursor: updatingVisibility ? 'wait' : 'pointer',
          opacity: updatingVisibility ? 0.6 : 1,
        }}
      >
        {VISIBILITY_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Delete */}
      {!confirmDelete ? (
        <button onClick={handleDelete} style={{
          ...buttonBase,
          color: 'var(--color-muted)',
          marginLeft: 'auto',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete
        </button>
      ) : (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: '#dc2626',
          }}>
            Delete this trail?
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              ...buttonBase,
              background: '#fef2f2',
              borderColor: '#fca5a5',
              color: '#dc2626',
              opacity: deleting ? 0.6 : 1,
              cursor: deleting ? 'wait' : 'pointer',
            }}
          >
            {deleting ? 'Deleting...' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{
              ...buttonBase,
              color: 'var(--color-muted)',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
