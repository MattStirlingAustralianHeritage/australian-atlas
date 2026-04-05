'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

function EditableField({ value, field, candidateId, onSaved, multiline, placeholder, style }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === (value || '').trim()) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed || null }),
      })
      if (res.ok) {
        const { candidate } = await res.json()
        onSaved?.(candidate)
      }
    } catch (err) {
      console.error('Auto-save failed:', err)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, field, candidateId, onSaved])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); save() }
    e.stopPropagation()
  }

  if (editing) {
    const baseStyle = {
      fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
      border: '1px solid var(--color-sage)', borderRadius: 4,
      padding: '4px 8px', background: '#FAFAF6', outline: 'none',
      width: '100%', boxSizing: 'border-box', ...style,
    }
    if (multiline) {
      return (
        <textarea ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save} onKeyDown={handleKeyDown} rows={3}
          style={{ ...baseStyle, resize: 'vertical', lineHeight: 1.5, fontSize: 13 }} />
      )
    }
    return (
      <input ref={ref} type="text" value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={save} onKeyDown={handleKeyDown} style={baseStyle} />
    )
  }

  const display = value || placeholder || 'Click to add...'
  const isEmpty = !value
  return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{
        cursor: 'pointer', borderBottom: '1px dashed transparent',
        transition: 'border-color 0.15s',
        color: isEmpty ? 'var(--color-muted)' : undefined,
        fontStyle: isEmpty ? 'italic' : undefined,
        opacity: saving ? 0.5 : 1, ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderBottomColor = 'var(--color-sage)' }}
      onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}>
      {display}
    </span>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 10,
      fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#fff',
      border: '1px solid var(--color-border)', color: 'var(--color-ink)',
      boxShadow: '0 1px 0 rgba(0,0,0,0.06)', lineHeight: '16px',
    }}>
      {children}
    </kbd>
  )
}

function CandidateCard({ candidate, isFocused, index, onApprove, onReject, onUpdate, focusDescRefs }) {
  const [flash, setFlash] = useState(null)
  const [exiting, setExiting] = useState(false)
  const cardRef = useRef(null)
  const confidence = candidate.confidence || 0
  const confidencePercent = Math.round(confidence * 100)
  const verticalColor = VERTICAL_COLORS[candidate.vertical] || 'var(--color-muted)'
  let borderColor = 'var(--color-border)'
  if (confidence > 0.85) borderColor = '#4A7C59'
  else if (confidence < 0.60) borderColor = '#C49A3C'

  const handleAction = async (action) => {
    if (flash) return
    setFlash(action === 'approve' ? 'approve' : 'reject')
    try {
      const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = await res.json()
        console.error(`${action} failed:`, d.error)
        setFlash(null)
        return
      }
      setTimeout(() => {
        setExiting(true)
        setTimeout(() => {
          if (action === 'approve') onApprove(candidate.id)
          else onReject(candidate.id)
        }, 500)
      }, 400)
    } catch (err) {
      console.error(`${action} error:`, err)
      setFlash(null)
    }
  }

  useEffect(() => {
    focusDescRefs.current[index] = () => {
      const el = cardRef.current?.querySelector('[data-field="description"]')
      if (el) el.click()
    }
  }, [index, focusDescRefs])

  const flashBg = flash === 'approve' ? 'rgba(74, 124, 89, 0.12)' : flash === 'reject' ? 'rgba(204, 68, 68, 0.12)' : 'transparent'

  return (
    <div ref={cardRef} style={{
      position: 'relative',
      border: isFocused ? '2px solid var(--color-sage)' : '1px solid var(--color-border)',
      borderLeftWidth: 4, borderLeftColor: borderColor,
      borderRadius: 12, background: '#fff', overflow: 'hidden',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      opacity: exiting ? 0 : 1, maxHeight: exiting ? 0 : 800,
      marginBottom: exiting ? 0 : 16,
      transform: exiting ? 'translateY(-8px)' : 'translateY(0)',
      boxShadow: isFocused ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, background: flashBg,
        transition: 'background 0.3s ease', pointerEvents: 'none', zIndex: 1, borderRadius: 12,
      }} />
      <div style={{ padding: '20px 24px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {candidate.vertical && (
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#fff', background: verticalColor,
                padding: '3px 10px', borderRadius: 100,
              }}>
                {VERTICAL_NAMES[candidate.vertical] || candidate.vertical}
              </span>
            )}
            {candidate.region && (
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--color-muted)' }}>
                {candidate.region}
              </span>
            )}
            {candidate.source && (
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                color: 'var(--color-muted)', opacity: 0.6,
                background: 'var(--color-cream)', padding: '2px 8px', borderRadius: 100,
              }}>
                {candidate.source.replace(/_/g, ' ')}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11,
              color: confidence > 0.85 ? '#4A7C59' : confidence < 0.60 ? '#C49A3C' : 'var(--color-muted)',
            }}>
              {confidencePercent}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button data-action="approve" onClick={() => handleAction('approve')} disabled={!!flash}
              title="Approve (Y or Right Arrow)"
              style={{
                width: 44, height: 44, borderRadius: '50%', background: '#4A7C59',
                border: 'none', cursor: flash ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 2px 6px rgba(74,124,89,0.3)', opacity: flash ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!flash) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(74,124,89,0.4)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(74,124,89,0.3)' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10.5L8 14.5L16 6.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button data-action="reject" onClick={() => handleAction('reject')} disabled={!!flash}
              title="Reject (N or Left Arrow)"
              style={{
                width: 44, height: 44, borderRadius: '50%', background: '#CC4444',
                border: 'none', cursor: flash ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 2px 6px rgba(204,68,68,0.3)', opacity: flash ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!flash) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(204,68,68,0.4)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(204,68,68,0.3)' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 6L14 14M14 6L6 14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <EditableField value={candidate.name} field="name" candidateId={candidate.id}
            onSaved={onUpdate} placeholder="Venue name"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', lineHeight: 1.3 }} />
        </div>

        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', fontWeight: 500, flexShrink: 0 }}>URL</span>
          <EditableField value={candidate.website_url} field="website_url" candidateId={candidate.id}
            onSaved={onUpdate} placeholder="No website"
            style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-sage)' }} />
          {candidate.website_url && (
            <a href={candidate.website_url} target="_blank" rel="noopener noreferrer" title="Open in new tab"
              style={{ flexShrink: 0, color: 'var(--color-sage)', opacity: 0.7, lineHeight: 1 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M5 1H2C1.45 1 1 1.45 1 2V10C1 10.55 1.45 11 2 11H10C10.55 11 11 10.55 11 10V7M7 1H11V5M11 1L5.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}
        </div>

        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', fontWeight: 500, flexShrink: 0 }}>Region</span>
          <EditableField value={candidate.region} field="region" candidateId={candidate.id}
            onSaved={onUpdate} placeholder="No region"
            style={{ fontFamily: 'var(--font-body)', fontSize: 13 }} />
        </div>

        <div style={{ marginBottom: 10 }} data-field="description">
          <EditableField value={candidate.description} field="description" candidateId={candidate.id}
            onSaved={onUpdate} multiline placeholder="Add a description..."
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.5 }} />
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>Notes</span>
          </div>
          <EditableField value={candidate.notes} field="notes" candidateId={candidate.id}
            onSaved={onUpdate} multiline placeholder="Internal notes..."
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }} />
        </div>

        {candidate.source_detail && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', opacity: 0.5, lineHeight: 1.4 }}>
            {candidate.source_detail}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CandidateReviewQueue({ initialCandidates = [] }) {
  const [candidates, setCandidates] = useState(initialCandidates)
  const [focusIndex, setFocusIndex] = useState(0)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const focusDescRefs = useRef({})
  const totalReviewed = approved + rejected
  const totalQueue = candidates.length + totalReviewed

  useEffect(() => {
    if (focusIndex >= candidates.length && candidates.length > 0) {
      setFocusIndex(candidates.length - 1)
    }
  }, [candidates.length, focusIndex])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if (candidates.length === 0) return
      switch (e.key) {
        case 'ArrowRight': case 'y': case 'Y': {
          e.preventDefault()
          const btn = document.querySelector('[data-candidate-index="' + focusIndex + '"] [data-action="approve"]')
          if (btn) btn.click()
          break
        }
        case 'ArrowLeft': case 'n': case 'N': {
          e.preventDefault()
          const btn = document.querySelector('[data-candidate-index="' + focusIndex + '"] [data-action="reject"]')
          if (btn) btn.click()
          break
        }
        case 'ArrowUp': { e.preventDefault(); setFocusIndex(i => Math.max(0, i - 1)); break }
        case 'ArrowDown': { e.preventDefault(); setFocusIndex(i => Math.min(candidates.length - 1, i + 1)); break }
        case 'e': case 'E': {
          e.preventDefault()
          if (focusDescRefs.current[focusIndex]) focusDescRefs.current[focusIndex]()
          break
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [focusIndex, candidates.length])

  useEffect(() => {
    const el = document.querySelector('[data-candidate-index="' + focusIndex + '"]')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusIndex])

  const handleApprove = useCallback((id) => {
    setCandidates(prev => prev.filter(c => c.id !== id))
    setApproved(a => a + 1)
  }, [])
  const handleReject = useCallback((id) => {
    setCandidates(prev => prev.filter(c => c.id !== id))
    setRejected(r => r + 1)
  }, [])
  const handleUpdate = useCallback((updated) => {
    setCandidates(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
  }, [])

  const progressPct = totalQueue > 0 ? (totalReviewed / totalQueue) * 100 : 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Keyboard hints bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '10px 16px', marginBottom: 20,
        background: 'var(--color-cream)', borderRadius: 8,
        fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
        fontWeight: 400, flexWrap: 'wrap',
      }}>
        <span><Kbd>Y</Kbd> / <Kbd>{'\u2192'}</Kbd> approve</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span><Kbd>N</Kbd> / <Kbd>{'\u2190'}</Kbd> reject</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span><Kbd>E</Kbd> edit</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span><Kbd>{'\u2191'}</Kbd> <Kbd>{'\u2193'}</Kbd> navigate</span>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>
            {totalReviewed} of {totalQueue} reviewed
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            <span style={{ color: '#4A7C59' }}>{approved} approved</span>
            {' / '}
            <span style={{ color: '#CC4444' }}>{rejected} rejected</span>
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: 'var(--color-sage)', borderRadius: 2,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Card queue */}
      {candidates.length > 0 ? (
        <div>
          {candidates.map((candidate, i) => (
            <div key={candidate.id} data-candidate-index={i} onClick={() => setFocusIndex(i)}>
              <CandidateCard candidate={candidate} isFocused={i === focusIndex} index={i}
                onApprove={handleApprove} onReject={handleReject} onUpdate={handleUpdate}
                focusDescRefs={focusDescRefs} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--color-cream)', borderRadius: 12 }}>
          <div style={{ marginBottom: 16 }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.6 }}>
              <circle cx="24" cy="24" r="20" stroke="var(--color-sage)" strokeWidth="2"/>
              <path d="M15 24.5L21 30.5L33 18.5" stroke="var(--color-sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {totalReviewed > 0 ? (
            <>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8 }}>
                All caught up.
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                {totalReviewed} candidates reviewed — {approved} approved, {rejected} rejected.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8 }}>
                No pending candidates
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Run a discovery script to populate the candidate queue.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
