'use client'

import { useState } from 'react'

export default function InterviewPreview({ interview }) {
  const { id, subject, questions = [], answers = [], published } = interview
  const [expanded, setExpanded] = useState(false)
  const [isPublished, setIsPublished] = useState(published)
  const [toggling, setToggling] = useState(false)

  const pairs = questions.map((q, i) => ({
    question: q,
    answer: answers[i] || '',
  }))

  const visiblePairs = expanded ? pairs : pairs.slice(0, 3)
  const hasMore = pairs.length > 3

  async function handleTogglePublish() {
    setToggling(true)
    try {
      const res = await fetch('/api/admin/interviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, published: !isPublished }),
      })
      if (res.ok) {
        setIsPublished(!isPublished)
      }
    } catch (err) {
      console.error('Toggle publish error:', err)
    } finally {
      setToggling(false)
    }
  }

  if (pairs.length === 0) {
    return (
      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid var(--color-border, #e5e5e5)',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 13,
          color: 'var(--color-muted)', fontStyle: 'italic', margin: 0,
        }}>
          No questions recorded.
        </p>
        <div style={{ marginTop: 10 }}>
          <PublishButton
            isPublished={isPublished}
            toggling={toggling}
            onClick={handleTogglePublish}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px 20px 16px',
      borderTop: '1px solid var(--color-border, #e5e5e5)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visiblePairs.map((pair, i) => (
          <div key={i}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              fontWeight: 600, color: 'var(--color-ink)',
              margin: '0 0 3px', lineHeight: 1.5,
            }}>
              {pair.question}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              fontWeight: 400, color: 'var(--color-muted)',
              margin: 0, lineHeight: 1.5,
            }}>
              {pair.answer || '(no answer)'}
            </p>
          </div>
        ))}
      </div>

      {/* Actions row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 14, flexWrap: 'wrap',
      }}>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '5px 14px', borderRadius: 4,
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff', fontFamily: 'var(--font-body)',
              fontSize: 12, fontWeight: 500,
              color: 'var(--color-ink)', cursor: 'pointer',
            }}
          >
            {expanded ? 'Show less' : `Show all ${pairs.length} questions`}
          </button>
        )}

        <PublishButton
          isPublished={isPublished}
          toggling={toggling}
          onClick={handleTogglePublish}
        />
      </div>
    </div>
  )
}

function PublishButton({ isPublished, toggling, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={toggling}
      style={{
        padding: '5px 14px', borderRadius: 4, border: 'none',
        background: isPublished ? '#fef2f2' : '#f0fdf4',
        color: isPublished ? '#991b1b' : '#166534',
        fontFamily: 'var(--font-body)', fontSize: 12,
        fontWeight: 600, cursor: toggling ? 'wait' : 'pointer',
        letterSpacing: '0.02em',
      }}
    >
      {toggling
        ? 'Updating...'
        : isPublished ? 'Unpublish' : 'Publish'
      }
    </button>
  )
}
