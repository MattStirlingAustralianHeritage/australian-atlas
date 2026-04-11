'use client'

import { useState, useEffect, useCallback } from 'react'

const SEVERITIES = ['bug', 'cosmetic', 'suggestion']
const STATUSES = ['open', 'in_progress', 'done']
const FILTER_TABS = ['all', 'open', 'in_progress', 'done']

const SEVERITY_STYLES = {
  bug:        { bg: 'rgba(196,96,58,0.10)',  color: '#C4603A', label: 'Bug' },
  cosmetic:   { bg: 'rgba(212,160,57,0.10)', color: '#B8860B', label: 'Cosmetic' },
  suggestion: { bg: 'rgba(70,130,180,0.10)', color: '#4682B4', label: 'Suggestion' },
}

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
}

function timeAgo(dateStr) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function AdminNotesPage() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Form state
  const [noteText, setNoteText] = useState('')
  const [noteUrl, setNoteUrl] = useState('')
  const [noteSeverity, setNoteSeverity] = useState('bug')

  const fetchNotes = useCallback(async () => {
    try {
      const qs = filter !== 'all' ? `?status=${filter}` : ''
      const res = await fetch(`/api/admin/notes${qs}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setNotes(data.notes || [])
    } catch (err) {
      console.error('Fetch notes error:', err)
      setError('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchNotes()
  }, [fetchNotes])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!noteText.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: noteText.trim(),
          url: noteUrl.trim() || undefined,
          severity: noteSeverity,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create note')
      }

      setNoteText('')
      setNoteUrl('')
      setNoteSeverity('bug')
      fetchNotes()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(noteId, newStatus) {
    try {
      const res = await fetch(`/api/admin/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update')

      setNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, status: newStatus, updated_at: new Date().toISOString() }
          : n
      ))
    } catch (err) {
      console.error('Status update error:', err)
      setError('Failed to update status')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-cream, #FAF8F5)',
      padding: '2rem 1.5rem 4rem',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontWeight: 400,
            fontSize: 28,
            color: 'var(--color-ink, #2D2A26)',
            marginBottom: 4,
          }}>
            Notes &amp; Bug Reports
          </h1>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontWeight: 300,
            fontSize: 14,
            color: 'var(--color-muted, #6B6760)',
          }}>
            Track bugs, cosmetic issues, and feature suggestions across the network.
          </p>
        </div>

        {/* Submit Form */}
        <form onSubmit={handleSubmit} style={{
          background: '#fff',
          borderRadius: 14,
          border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Describe the bug, issue, or suggestion..."
            required
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 8,
              border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.875rem',
              color: 'var(--color-ink, #2D2A26)',
              background: 'var(--color-cream, #FAF8F5)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-sage, #5F8A7E)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))'}
          />

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'var(--color-muted, #6B6760)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                marginBottom: 4,
              }}>
                Affected URL
              </label>
              <input
                type="text"
                value={noteUrl}
                onChange={e => setNoteUrl(e.target.value)}
                placeholder="Which page is affected?"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
                  fontFamily: 'var(--font-body, system-ui)',
                  fontSize: '0.825rem',
                  color: 'var(--color-ink, #2D2A26)',
                  background: 'var(--color-cream, #FAF8F5)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--color-sage, #5F8A7E)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border, rgba(28,26,23,0.12))'}
              />
            </div>

            <div style={{ flex: '0 0 auto' }}>
              <label style={{
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'var(--color-muted, #6B6760)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                marginBottom: 4,
              }}>
                Severity
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                {SEVERITIES.map(s => {
                  const active = noteSeverity === s
                  const sev = SEVERITY_STYLES[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNoteSeverity(s)}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: 6,
                        border: active
                          ? `1.5px solid ${sev.color}`
                          : '1.5px solid var(--color-border, rgba(28,26,23,0.12))',
                        background: active ? sev.bg : '#fff',
                        fontFamily: 'var(--font-body, system-ui)',
                        fontSize: '0.75rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? sev.color : 'var(--color-muted, #6B6760)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {sev.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !noteText.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 8,
                border: 'none',
                background: submitting ? 'rgba(95,138,126,0.5)' : 'var(--color-sage, #5F8A7E)',
                color: '#fff',
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
                flex: '0 0 auto',
              }}
            >
              {submitting ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </form>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '0.625rem 1rem',
            marginBottom: '1rem',
            borderRadius: 8,
            background: 'rgba(196,96,58,0.08)',
            border: '1px solid rgba(196,96,58,0.2)',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.8rem',
            color: '#C4603A',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#C4603A',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                padding: '0 4px',
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: '1rem',
          borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.12))',
          paddingBottom: 0,
        }}>
          {FILTER_TABS.map(tab => {
            const active = filter === tab
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px 8px 0 0',
                  border: 'none',
                  borderBottom: active
                    ? '2px solid var(--color-sage, #5F8A7E)'
                    : '2px solid transparent',
                  background: active ? 'rgba(95,138,126,0.06)' : 'transparent',
                  fontFamily: 'var(--font-body, system-ui)',
                  fontSize: '0.8rem',
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? 'var(--color-sage, #5F8A7E)'
                    : 'var(--color-muted, #6B6760)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {STATUS_LABELS[tab] || 'All'}
              </button>
            )
          })}
        </div>

        {/* Notes List */}
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.85rem',
            color: 'var(--color-muted, #6B6760)',
          }}>
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: '#fff',
            borderRadius: 14,
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
          }}>
            <p style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: '1.1rem',
              color: 'var(--color-ink, #2D2A26)',
              marginBottom: 4,
            }}>
              No notes yet
            </p>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.825rem',
              color: 'var(--color-muted, #6B6760)',
            }}>
              {filter === 'all'
                ? 'Add a bug report or suggestion above to get started.'
                : `No ${STATUS_LABELS[filter]?.toLowerCase() || filter} notes.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {notes.map(n => (
              <NoteCard key={n.id} note={n} onStatusChange={handleStatusChange}
                onNoteUpdated={(updated) => setNotes(prev => prev.map(x => x.id === updated.id ? updated : x))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteCard({ note, onStatusChange, onNoteUpdated }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(note.note)
  const [saving, setSaving] = useState(false)
  const sev = SEVERITY_STYLES[note.severity] || SEVERITY_STYLES.bug
  const isDone = note.status === 'done'

  async function handleSaveEdit() {
    const trimmed = editText.trim()
    if (!trimmed || trimmed === note.note) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed }),
      })
      if (res.ok) {
        const data = await res.json()
        onNoteUpdated?.(data.note)
      }
    } catch {} finally {
      setSaving(false)
      setEditing(false)
    }
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
      padding: '1rem 1.25rem',
      opacity: isDone ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Top row: severity badge + timestamp */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
      }}>
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 4,
          background: sev.bg,
          color: sev.color,
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.675rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {sev.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!editing && (
            <button
              onClick={() => { setEditText(note.note); setEditing(true) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                fontFamily: 'var(--font-body, system-ui)', fontSize: '0.65rem',
                color: 'var(--color-muted, #6B6760)', opacity: 0.6,
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
            >
              Edit
            </button>
          )}
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.7rem',
            color: 'var(--color-muted, #6B6760)',
          }}>
            {timeAgo(note.created_at)}
          </span>
        </div>
      </div>

      {/* Note text — editable or static */}
      {editing ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
              border: '2px solid var(--color-sage, #5F8A7E)',
              fontFamily: 'var(--font-body, system-ui)', fontSize: '0.875rem',
              color: 'var(--color-ink, #2D2A26)', lineHeight: 1.5,
              resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={handleSaveEdit} disabled={saving}
              style={{
                padding: '3px 12px', borderRadius: 4, border: 'none',
                background: 'var(--color-sage, #5F8A7E)', color: '#fff',
                fontFamily: 'var(--font-body, system-ui)', fontSize: '0.7rem',
                fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{
                padding: '3px 10px', borderRadius: 4,
                border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
                background: '#fff', color: 'var(--color-muted, #6B6760)',
                fontFamily: 'var(--font-body, system-ui)', fontSize: '0.7rem',
                cursor: 'pointer',
              }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.875rem',
          color: 'var(--color-ink, #2D2A26)',
          lineHeight: 1.5,
          margin: '0 0 0.5rem',
          textDecoration: isDone ? 'line-through' : 'none',
          whiteSpace: 'pre-wrap',
        }}>
          {note.note}
        </p>
      )}

      {/* URL link */}
      {note.url && (
        <a
          href={note.url.startsWith('http') ? note.url : `https://${note.url}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.75rem',
            color: 'var(--color-sage, #5F8A7E)',
            textDecoration: 'none',
            display: 'inline-block',
            marginBottom: '0.625rem',
            wordBreak: 'break-all',
          }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
        >
          {note.url}
        </a>
      )}

      {/* Status controls */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderTop: '1px solid var(--color-border, rgba(28,26,23,0.08))',
        paddingTop: '0.625rem',
        marginTop: note.url ? 0 : '0.125rem',
      }}>
        {STATUSES.map(s => {
          const active = note.status === s
          return (
            <button
              key={s}
              onClick={() => { if (!active) onStatusChange(note.id, s) }}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: 6,
                border: active
                  ? '1px solid var(--color-sage, #5F8A7E)'
                  : '1px solid var(--color-border, rgba(28,26,23,0.12))',
                background: active ? 'rgba(95,138,126,0.10)' : 'transparent',
                fontFamily: 'var(--font-body, system-ui)',
                fontSize: '0.7rem',
                fontWeight: active ? 600 : 400,
                color: active
                  ? 'var(--color-sage, #5F8A7E)'
                  : 'var(--color-muted, #6B6760)',
                cursor: active ? 'default' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
