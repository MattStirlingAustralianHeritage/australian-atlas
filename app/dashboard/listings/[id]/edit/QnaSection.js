'use client'

import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

/**
 * "Questions & answers" manager for the listing editor (paid perk).
 *
 * Loads, creates, edits and removes operator-authored Q&A for one listing via
 * /api/dashboard/qna (Bearer). Published entries render as an
 * operator-attributed block on the public page AND feed the listing's own
 * search text + the "Ask the Atlas" concierge — so the operator's own words
 * can answer a visitor's plain-language question. Mirrors the offers/awards
 * perk pattern: a lock card when the listing isn't paid.
 */

const ICONS = {
  chat: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
}

const emptyForm = { question: '', answer: '' }

export default function QnaSection({ listingId, token, isPaid }) {
  const [maxQna, setMaxQna] = useState(8)
  const [qna, setQna] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(null) // null = closed; object = create
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    if (!isPaid || !token) { setLoading(false); return }
    let active = true
    fetch(`/api/dashboard/qna?listing_id=${listingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (active) { if (data.error) setLoadError(data.error); else { setQna(data.qna || []); if (data.maxQna) setMaxQna(data.maxQna) } ; setLoading(false) } })
      .catch(() => { if (active) { setLoadError('Failed to load questions'); setLoading(false) } })
    return () => { active = false }
  }, [listingId, token, isPaid])

  const patchForm = useCallback((p) => setForm(prev => ({ ...prev, ...p })), [])

  async function save() {
    if (!form.question.trim()) { setFormError('Add a question'); return }
    if (!form.answer.trim()) { setFormError('Add an answer'); return }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/dashboard/qna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          question: form.question.trim(),
          answer: form.answer.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed to save question'); setSaving(false); return }
      setQna(prev => [...prev, data.qna])
      setForm(null)
    } catch { setFormError('Failed to save question') }
    finally { setSaving(false) }
  }

  async function confirmRemove() {
    const entry = pendingDelete
    if (!entry) return
    setBusyId(entry.id)
    try {
      const res = await fetch(`/api/dashboard/qna?id=${encodeURIComponent(entry.id)}&listing_id=${encodeURIComponent(listingId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setQna(prev => prev.filter(q => q.id !== entry.id))
    } catch { /* ignore */ }
    finally {
      setBusyId(null)
      setPendingDelete(null)
    }
  }

  // ── Non-paid lock card ──
  if (!isPaid) {
    return (
      <Section>
        <div style={lockCard}>
          <span style={{ display: 'inline-flex', color: 'var(--color-sage)', flexShrink: 0 }}>{ICONS.chat}</span>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Answer the questions visitors ask</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Questions &amp; answers are part of a paid listing. Answer the things people actually ask — parking, walk-ins, dietary options — right on your public page.
            </p>
            <a href="/dashboard/subscription" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none' }}>View subscription options →</a>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section count={qna.length} max={maxQna}>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove this question?"
        message={pendingDelete ? `“${pendingDelete.question}” will be removed from your public listing. This can't be undone.` : ''}
        confirmLabel="Remove question"
        danger
        busy={!!pendingDelete && busyId === pendingDelete.id}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
      <p style={helpText}>
        Answer the questions visitors ask most — parking, walk-ins, dietary options, best time to visit. Each shows on your public listing (clearly marked as yours), and helps the Atlas answer plain-language searches in your own words.
      </p>

      {loadError && <div style={errBox}>{loadError}</div>}

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading questions…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {qna.map(entry => (
            <div key={entry.id} style={qnaRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)' }}>{entry.question}</span>
                <p style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>{entry.answer}</p>
              </div>
              <button type="button" onClick={() => setPendingDelete(entry)} disabled={busyId === entry.id} aria-label="Remove question" style={iconBtn}>{ICONS.trash}</button>
            </div>
          ))}

          {!form && qna.length < maxQna && (
            <button type="button" onClick={() => setForm({ ...emptyForm })} style={addBtn} className="aa-qna-add">
              <span style={{ display: 'inline-flex' }}>{ICONS.plus}</span> Add a question
            </button>
          )}
          {!form && qna.length >= maxQna && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
              This listing has reached its {maxQna}-question limit — remove one to add another.
            </p>
          )}
        </div>
      )}

      {form && (
        <div style={formCard}>
          {formError && <div style={errBox}>{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Field label="Question">
              <input type="text" value={form.question} onChange={e => patchForm({ question: e.target.value })} placeholder="Do you take walk-ins?" maxLength={120} style={input} />
            </Field>

            <Field label="Answer" hint="Keep it factual — this feeds Atlas search in your own words">
              <textarea value={form.answer} onChange={e => patchForm({ answer: e.target.value })} rows={3} maxLength={600} placeholder="Yes — walk-ins are welcome. Weekends get busy, so a booking is worth it after 11am." style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            </Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => { setForm(null); setFormError(null) }} disabled={saving} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Add question'}</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Layout shell (matches the offers/awards section header) ──
function Section({ children, count, max }) {
  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`.aa-qna-add:hover { border-color: var(--color-sage) !important; color: var(--color-sage) !important; background: rgba(122,143,107,0.06) !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Questions &amp; answers</h2>
        {typeof count === 'number' && count > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
            {max ? `${count} / ${max} questions` : `${count} question${count === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{label}</label>
      {children}
      {hint && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{hint}</span>}
    </div>
  )
}

// ── styles (mirror OffersSection/AwardsSection) ──
const helpText = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px', lineHeight: 1.5 }
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }
const lockCard = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const qnaRow = { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-border)', background: '#fff' }
const addBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s ease', alignSelf: 'flex-start' }
const formCard = { marginTop: 14, padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const input = { width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', cursor: 'pointer', flexShrink: 0 }
const cancelBtn = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const saveBtn = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
