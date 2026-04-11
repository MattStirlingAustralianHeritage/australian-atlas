'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

// ─── Editable wrapper ─────────────────────────────────────
// Wraps a child element. In edit mode, replaces it with an input/textarea.

function InlineField({ value, field, multiline, onChange, editing, style }) {
  const ref = useRef(null)

  useEffect(() => {
    if (editing && ref.current) ref.current.focus()
  }, [editing])

  if (!editing) return null

  const baseStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '6px 10px', borderRadius: 6,
    border: '2px solid var(--color-sage, #5F8A7E)',
    fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
    color: 'var(--color-ink)', lineHeight: 'inherit',
    background: 'rgba(255,255,255,0.95)', outline: 'none',
    ...style,
  }

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value || ''}
        onChange={e => onChange(field, e.target.value)}
        rows={6}
        style={{ ...baseStyle, resize: 'vertical', minHeight: 120 }}
      />
    )
  }

  return (
    <input
      ref={ref}
      type="text"
      value={value || ''}
      onChange={e => onChange(field, e.target.value)}
      style={baseStyle}
    />
  )
}

// ─── Main component ───────────────────────────────────────
// Completely invisible to non-admin users. On mount, checks admin status
// via API. If not authorised, renders null — no DOM elements at all.

export default function InlineListingEditor({ listing }) {
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null) // 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState(null)

  // Gate: check admin / inline_edit_access on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/check')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.isAdmin) setCanEdit(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Render nothing for non-admin users — zero DOM presence
  if (!canEdit) return null

  const startEdit = useCallback(() => {
    setDraft({
      name: listing.name,
      description: listing.description,
      address: listing.address,
      website: listing.website,
      phone: listing.phone,
      region: listing.region,
      state: listing.state,
    })
    setEditing(true)
    setSaveResult(null)
    setErrorMsg(null)
  }, [listing])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraft(null)
    setSaveResult(null)
    setErrorMsg(null)
  }, [])

  const updateField = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!draft || saving) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Save failed')
        setSaveResult('error')
        return
      }

      // Update the page DOM with new values (avoids full page reload)
      setSaveResult('success')
      setEditing(false)
      setDraft(null)

      // Brief "Saved" confirmation, then reload to reflect changes cleanly
      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (err) {
      setErrorMsg(err.message || 'Network error')
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }, [draft, saving, listing.id])

  // Escape key cancels editing
  useEffect(() => {
    if (!editing) return
    const handler = (e) => { if (e.key === 'Escape') cancelEdit() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editing, cancelEdit])

  return (
    <>
      {/* ── Floating edit button (bottom-right, always visible when not editing) ── */}
      {!editing && (
        <button
          onClick={startEdit}
          aria-label="Edit listing"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10,
            border: 'none', cursor: 'pointer',
            background: 'var(--color-sage, #5F8A7E)', color: '#fff',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.03em',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.22)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Edit Listing
        </button>
      )}

      {/* ── "Saved" confirmation ── */}
      {saveResult === 'success' && !editing && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 10,
          background: '#2e7d32', color: '#fff',
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        }}>
          Saved &#10003;
        </div>
      )}

      {/* ── Edit overlay ── */}
      {editing && draft && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9998, pointerEvents: 'none',
        }}>
          {/* Top bar with save/cancel */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px',
            background: 'var(--color-ink, #2D2A26)',
            color: '#fff',
            fontFamily: 'var(--font-body, system-ui)',
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>
              Editing: {listing.name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {errorMsg && (
                <span style={{ fontSize: 12, color: '#ff8a80', marginRight: 8 }}>
                  {errorMsg}
                </span>
              )}
              <button onClick={cancelEdit} style={{
                padding: '6px 16px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
                color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'var(--font-body, system-ui)',
              }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '6px 16px', borderRadius: 6,
                border: 'none', background: 'var(--color-sage, #5F8A7E)',
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'var(--font-body, system-ui)', letterSpacing: '0.03em',
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Inline fields — positioned to overlay the actual page content */}
          <div style={{
            position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
            overflow: 'auto', pointerEvents: 'auto',
            background: 'rgba(250,248,245,0.92)',
            backdropFilter: 'blur(2px)',
          }}>
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 120px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <FieldGroup label="Name">
                  <InlineField value={draft.name} field="name" editing={true} onChange={updateField}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400 }} />
                </FieldGroup>

                <FieldGroup label="Description">
                  <InlineField value={draft.description} field="description" editing={true} onChange={updateField} multiline
                    style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, lineHeight: 1.7 }} />
                </FieldGroup>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <FieldGroup label="Website">
                    <InlineField value={draft.website} field="website" editing={true} onChange={updateField} />
                  </FieldGroup>
                  <FieldGroup label="Phone">
                    <InlineField value={draft.phone} field="phone" editing={true} onChange={updateField} />
                  </FieldGroup>
                </div>

                <FieldGroup label="Address">
                  <InlineField value={draft.address} field="address" editing={true} onChange={updateField} />
                </FieldGroup>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <FieldGroup label="Region">
                    <InlineField value={draft.region} field="region" editing={true} onChange={updateField} />
                  </FieldGroup>
                  <FieldGroup label="State">
                    <InlineField value={draft.state} field="state" editing={true} onChange={updateField} />
                  </FieldGroup>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FieldGroup({ label, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontFamily: 'var(--font-body, system-ui)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--color-muted, #6B6760)',
        marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
