'use client'

import { useState } from 'react'

export default function PlaceMemories({ listingId, initialMemories = [] }) {
  const [memories, setMemories] = useState(initialMemories)
  const [formOpen, setFormOpen] = useState(false)
  const [memory, setMemory] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!memory.trim() || memory.length > 300) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          memory: memory.trim(),
          author_name: authorName.trim() || null,
        }),
      })

      if (res.ok) {
        setSubmitted(true)
        setMemory('')
        setAuthorName('')
        setFormOpen(false)
      }
    } catch (err) {
      console.error('Failed to submit memory:', err)
    }
    setSubmitting(false)
  }

  const hasMemories = memories.length > 0

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.35rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 1.25rem',
      }}>
        People's memories of this place
      </h2>

      {/* Memories list */}
      {hasMemories && (
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          {memories.map(m => (
            <blockquote
              key={m.id}
              style={{
                margin: 0,
                padding: '1rem 1.25rem',
                borderLeft: '3px solid #d97706',
                background: '#fffbf0',
                borderRadius: '0 8px 8px 0',
              }}
            >
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                fontStyle: 'italic',
                color: 'var(--color-ink)',
                margin: '0 0 0.5rem',
                lineHeight: 1.6,
              }}>
                {m.memory}
              </p>
              <footer style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--color-muted)',
              }}>
                — {m.author_name || 'Anonymous'}
              </footer>
            </blockquote>
          ))}
        </div>
      )}

      {/* Success message */}
      {submitted && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          marginBottom: '1rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: '#166534',
            margin: 0,
          }}>
            Thank you! Your memory will appear after review.
          </p>
        </div>
      )}

      {/* Prompt or form toggle */}
      {!formOpen && !submitted && (
        <button
          onClick={() => setFormOpen(true)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: '#d97706',
            background: 'none',
            border: '1px solid #d97706',
            borderRadius: 8,
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#d97706'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = '#d97706'
          }}
        >
          {hasMemories ? 'Share a memory' : 'Be the first to share a memory of this place'}
        </button>
      )}

      {/* Memory form */}
      {formOpen && (
        <form onSubmit={handleSubmit} style={{ marginTop: '0.5rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              maxLength={300}
              placeholder="Share your memory of this place..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                color: 'var(--color-ink)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              color: memory.length > 280 ? '#dc2626' : 'var(--color-muted)',
              margin: '0.25rem 0 0',
              textAlign: 'right',
            }}>
              {memory.length}/300
            </p>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name (optional)"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--color-ink)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="submit"
              disabled={submitting || !memory.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 8,
                border: 'none',
                background: memory.trim() ? '#d97706' : '#ccc',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: submitting || !memory.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit memory'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false)
                setMemory('')
                setAuthorName('')
              }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: '#fff',
                color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
