'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import {
  getHighlightDef,
  verticalSupportsHighlights,
  LIMITS,
  HIRING,
} from '@/lib/operator-highlights/config'

/**
 * Operator highlights editor — the "right now" + hiring layer.
 *
 * Self-contained: loads from the listing's operator_highlights, tracks its own
 * dirty state, and saves through the same PATCH /api/dashboard/listing contract
 * as the rest of the page (master-only write). Lives as a section on the WYSIWYG
 * edit page, with its own inline Save so it doesn't entangle the page's
 * contact/gallery save flow.
 *
 * The field set is entirely config-driven (lib/operator-highlights/config) so a
 * roastery sees "On the roaster now", a studio sees "Classes & enrolments", a
 * brewery sees "Latest release" — without this component knowing any of them.
 */

// Build the editable string form for the type-specific fields. List values are
// arrays in storage → newline strings in the textarea.
function fieldsToForm(defFields, stored) {
  const out = {}
  const s = stored || {}
  for (const f of defFields) {
    const v = s[f.key]
    if (f.type === 'list') out[f.key] = Array.isArray(v) ? v.join('\n') : (typeof v === 'string' ? v : '')
    else out[f.key] = typeof v === 'string' ? v : ''
  }
  return out
}

const limitFor = (f) => f.type === 'textarea' ? LIMITS.textarea : f.type === 'url' ? LIMITS.url : LIMITS.text

// ── Staleness ────────────────────────────────────────────────
// Highlights present as "right now" on the public page, so we surface their
// age and nudge past 90 days — the same threshold the weekly operator digest
// uses for its stale-highlights suggested action.
const DAY_MS = 24 * 60 * 60 * 1000
const STALE_MS = 90 * DAY_MS

// Does a stored highlights object actually say anything? Mirrors the digest
// cron's hasHighlights check — an all-blank save still stamps updated_at, and
// there is nothing to nudge about refreshing.
function highlightsHaveContent(h) {
  if (!h || typeof h !== 'object') return false
  const hi = h.hiring && typeof h.hiring === 'object' ? h.hiring : {}
  if (hi.open === true || (hi.note || '').trim() || (hi.url || '').trim()) return true
  const values = h.fields && typeof h.fields === 'object' ? Object.values(h.fields) : []
  return values.some(v => Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '')
}

// Coarse relative label for a past timestamp: "today", "yesterday",
// "12 days ago", "5 weeks ago", "4 months ago", "2 years ago".
function relativeTime(ms) {
  const days = Math.floor((Date.now() - ms) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 61) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.max(2, Math.floor(days / 30.44))} months ago`
  const years = Math.floor(days / 365.25)
  return years <= 1 ? 'a year ago' : `${years} years ago`
}

export default function HighlightsEditor({ listingId, vertical, subType, token, initialHighlights, accent }) {
  const def = useMemo(() => getHighlightDef(vertical, subType), [vertical, subType])
  const vertColor = accent || 'var(--color-sage)'

  const init = initialHighlights || {}
  const initHiring = init.hiring || {}

  const [hiringOpen, setHiringOpen] = useState(initHiring.open === true)
  const [hiringUrl, setHiringUrl] = useState(initHiring.url || '')
  const [hiringNote, setHiringNote] = useState(initHiring.note || '')
  const [fields, setFields] = useState(() => fieldsToForm(def.fields, init.fields))
  // Stamped server-side on every save (lib/operator-highlights/normalize.js);
  // absent until the operator has saved highlights at least once. The content
  // flag tracks the last SAVED state (not the live form) so the stale nudge
  // never fires over an all-blank save.
  const [updatedAt, setUpdatedAt] = useState(typeof init.updated_at === 'string' ? init.updated_at : null)
  const [savedHasContent, setSavedHasContent] = useState(() => highlightsHaveContent(init))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  // Baseline for dirty-tracking. Re-stamped after each successful save.
  const snapshot = useCallback(
    (o, u, n, f) => JSON.stringify({ o, u: (u || '').trim(), n: (n || '').trim(), f }),
    [],
  )
  const baselineRef = useRef(snapshot(initHiring.open === true, initHiring.url || '', initHiring.note || '', fieldsToForm(def.fields, init.fields)))

  const setField = useCallback((key, value) => setFields(prev => ({ ...prev, [key]: value })), [])

  if (!verticalSupportsHighlights(vertical)) return null

  const current = snapshot(hiringOpen, hiringUrl, hiringNote, fields)
  const dirty = current !== baselineRef.current

  // Staleness: highlights read as "right now", so anything older than 90 days
  // gets an amber nudge. Same threshold as the operator-digest suggested action.
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN
  const hasUpdated = Number.isFinite(updatedMs)
  const isStale = hasUpdated && savedHasContent && Date.now() - updatedMs > STALE_MS

  const hydrate = (h) => {
    const hi = (h && h.hiring) || {}
    setHiringOpen(hi.open === true)
    setHiringUrl(hi.url || '')
    setHiringNote(hi.note || '')
    const form = fieldsToForm(def.fields, (h && h.fields) || {})
    setFields(form)
    baselineRef.current = snapshot(hi.open === true, hi.url || '', hi.note || '', form)
    // The save response carries the fresh server stamp; if it's ever missing
    // we still just saved, so "now" is the honest fallback.
    setUpdatedAt(typeof h?.updated_at === 'string' ? h.updated_at : new Date().toISOString())
    setSavedHasContent(highlightsHaveContent(h))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          operator_highlights: {
            hiring: { open: hiringOpen, url: hiringUrl, note: hiringNote },
            fields,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save your highlights.')
      } else {
        hydrate(data.listing?.operator_highlights || { hiring: { open: hiringOpen, url: hiringUrl, note: hiringNote }, fields })
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2500)
      }
    } catch {
      setError('Could not save your highlights.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`
        .aa-hl-input:focus, .aa-hl-textarea:focus { border-color: ${vertColor}; }
        .aa-hl-save:not(:disabled):hover { opacity: 0.9; }
      `}</style>

      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>
          Highlights
        </h2>
        {hasUpdated && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: isStale ? '#b45309' : 'var(--color-muted)' }}>
            Last updated {relativeTime(updatedMs)}
          </span>
        )}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: isStale ? '0 0 12px' : '0 0 20px', lineHeight: 1.5, maxWidth: 560 }}>
        Tell visitors what you’re doing right now — it shows on your public page. Keep it plain and specific;
        leave anything blank that doesn’t apply.
      </p>

      {/* ── Stale nudge — highlights older than 90 days ────── */}
      {isStale && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 560,
            margin: '0 0 20px', padding: '10px 14px', borderRadius: 8,
            border: '1px solid #f0d9a8', background: '#fdf6e7', boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true" style={{
            flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 1,
            background: '#b45309', color: '#fff', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, lineHeight: 1,
          }}>!</span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
            Travellers see this as current — refresh it for the season.
          </p>
        </div>
      )}

      {/* ── Hiring ─────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: vertColor, display: 'inline-flex' }}>{BRIEFCASE}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>
                {HIRING.toggleLabel}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              {HIRING.toggleHelp}
            </p>
          </div>
          <Toggle on={hiringOpen} onChange={setHiringOpen} color={vertColor} label="We’re hiring" />
        </div>

        {hiringOpen && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={HIRING.url.label} help={HIRING.url.help}>
              <input
                className="aa-hl-input" type="url" inputMode="url" value={hiringUrl}
                onChange={e => setHiringUrl(e.target.value)} placeholder={HIRING.url.placeholder}
                style={inputStyle} maxLength={LIMITS.url}
              />
            </Field>
            <Field label={HIRING.note.label} help={HIRING.note.help}>
              <input
                className="aa-hl-input" type="text" value={hiringNote}
                onChange={e => setHiringNote(e.target.value)} placeholder={HIRING.note.placeholder}
                style={inputStyle} maxLength={LIMITS.hiringNote}
              />
            </Field>
          </div>
        )}
      </div>

      {/* ── Type-specific fields ───────────────────────────── */}
      {def.fields.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          {(def.heading || def.intro) && (
            <div style={{ marginBottom: 16 }}>
              {def.heading && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: vertColor }}>
                  {def.heading}
                </div>
              )}
              {def.intro && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                  {def.intro}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {def.fields.map(f => {
              const val = fields[f.key] || ''
              const lim = limitFor(f)
              // Char counter only for free-text fields — lists are counted in
              // items (and capped server-side), urls don't need it.
              const showCounter = f.type === 'text' || f.type === 'textarea'
              return (
                <Field key={f.key} label={f.label} help={f.help} counter={showCounter ? `${val.length}/${lim}` : null} nearCap={showCounter && val.length > lim * 0.85}>
                  {f.type === 'textarea' || f.type === 'list' ? (
                    <textarea
                      className="aa-hl-textarea"
                      value={val}
                      onChange={e => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={f.type === 'list' ? 3 : 3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
                      maxLength={f.type === 'list' ? LIMITS.listItem * LIMITS.listItems : lim}
                    />
                  ) : (
                    <input
                      className="aa-hl-input"
                      type={f.type === 'url' ? 'url' : 'text'}
                      inputMode={f.type === 'url' ? 'url' : undefined}
                      value={val}
                      onChange={e => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      style={inputStyle}
                      maxLength={lim}
                    />
                  )}
                </Field>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Save row ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button" className="aa-hl-save" onClick={handleSave} disabled={saving || !dirty}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: dirty ? 'var(--color-ink)' : 'var(--color-border)',
            color: dirty ? '#fff' : 'var(--color-muted)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: saving || !dirty ? 'default' : 'pointer', transition: 'opacity 0.12s ease',
          }}
        >
          {saving ? 'Saving…' : 'Save highlights'}
        </button>
        {error ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#c62828' }}>{error}</span>
        ) : justSaved ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>✓ Highlights saved</span>
        ) : dirty ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Unsaved highlight changes</span>
        ) : null}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────
function Field({ label, help, children, counter, nearCap }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <label style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{label}</label>
        {counter && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: nearCap ? '#b45309' : 'var(--color-muted)' }}>{counter}</span>
        )}
      </div>
      {help && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '2px 0 6px', lineHeight: 1.45 }}>{help}</p>
      )}
      {children}
    </div>
  )
}

function Toggle({ on, onChange, color, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        flexShrink: 0, position: 'relative', width: 46, height: 26, borderRadius: 999,
        border: 'none', cursor: 'pointer', padding: 0,
        background: on ? color : 'var(--color-border)', transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

const cardStyle = {
  borderRadius: 12, border: '1px solid var(--color-border)',
  background: 'var(--color-card-bg)', padding: 20,
}
const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8,
  fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.12s ease',
}

const BRIEFCASE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
  </svg>
)
