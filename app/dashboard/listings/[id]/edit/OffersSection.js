'use client'

import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

/**
 * "Current offers" manager for the listing editor (paid perk).
 *
 * Loads, creates and removes time-boxed offers for one listing via
 * /api/dashboard/offers (Bearer). A live offer surfaces on the listing's
 * public page (operator-attributed) until its end date passes; expired
 * offers disappear automatically and can be tidied away here. Mirrors the
 * events perk pattern: a lock card when the listing isn't paid.
 */

const ICONS = {
  tag: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><path d="M7 7h.01" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
}

const emptyForm = { title: '', details: '', url: '', valid_from: '', valid_to: '' }

// Local YYYY-MM-DD, for the expired check + date input mins.
function todayYMD() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// 'YYYY-MM-DD' → '15 Aug 2026' (parsed by parts — no timezone drift).
function fmtDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default function OffersSection({ listingId, token, isPaid }) {
  const [maxOffers, setMaxOffers] = useState(3)
  const [offers, setOffers] = useState([])
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
    fetch(`/api/dashboard/offers?listing_id=${listingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (active) { if (data.error) setLoadError(data.error); else { setOffers(data.offers || []); if (data.maxOffers) setMaxOffers(data.maxOffers) } ; setLoading(false) } })
      .catch(() => { if (active) { setLoadError('Failed to load offers'); setLoading(false) } })
    return () => { active = false }
  }, [listingId, token, isPaid])

  const patchForm = useCallback((p) => setForm(prev => ({ ...prev, ...p })), [])

  const today = todayYMD()
  const isExpired = (o) => o.valid_to < today
  const liveCount = offers.filter(o => !isExpired(o)).length

  async function save() {
    if (!form.title.trim()) { setFormError('Give your offer a title'); return }
    if (!form.valid_to) { setFormError('Choose an end date for your offer'); return }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/dashboard/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          title: form.title.trim(),
          details: form.details.trim() || null,
          url: form.url.trim() || null,
          valid_from: form.valid_from || null,
          valid_to: form.valid_to,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed to save offer'); setSaving(false); return }
      setOffers(prev => [...prev, data.offer])
      setForm(null)
    } catch { setFormError('Failed to save offer') }
    finally { setSaving(false) }
  }

  async function confirmRemove() {
    const offer = pendingDelete
    if (!offer) return
    setBusyId(offer.id)
    try {
      const res = await fetch(`/api/dashboard/offers?id=${encodeURIComponent(offer.id)}&listing_id=${encodeURIComponent(listingId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setOffers(prev => prev.filter(o => o.id !== offer.id))
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
          <span style={{ display: 'inline-flex', color: 'var(--color-sage)', flexShrink: 0 }}>{ICONS.tag}</span>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Share what’s on offer right now</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Current offers are part of a paid listing. Publish a time-boxed offer — a tasting deal, a seasonal special — to your public page.
            </p>
            <a href="/dashboard/subscription" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none' }}>View subscription options →</a>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section count={liveCount} max={maxOffers}>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove this offer?"
        message={pendingDelete ? `“${pendingDelete.title}” will be removed from your public listing. This can't be undone.` : ''}
        confirmLabel="Remove offer"
        danger
        busy={!!pendingDelete && busyId === pendingDelete.id}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
      <p style={helpText}>
        Time-boxed offers — a tasting deal, a winter special, a bundle. Each offer shows on your public listing (clearly marked as yours) until its end date passes, then disappears automatically.
      </p>

      {loadError && <div style={errBox}>{loadError}</div>}

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading offers…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map(offer => {
            const expired = isExpired(offer)
            return (
              <div key={offer.id} style={offerRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)' }}>{offer.title}</span>
                    <span style={expired ? expiredBadge : liveBadge}>{expired ? 'Expired' : 'Live'}</span>
                  </div>
                  <div style={{ marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>
                      {offer.valid_from ? `${fmtDate(offer.valid_from)} – ` : 'Until '}{fmtDate(offer.valid_to)}
                    </span>
                    {offer.details && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{offer.details}</span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setPendingDelete(offer)} disabled={busyId === offer.id} aria-label="Remove offer" style={iconBtn}>{ICONS.trash}</button>
              </div>
            )
          })}

          {!form && liveCount < maxOffers && (
            <button type="button" onClick={() => setForm({ ...emptyForm })} style={addBtn} className="aa-offer-add">
              <span style={{ display: 'inline-flex' }}>{ICONS.plus}</span> Add an offer
            </button>
          )}
          {!form && liveCount >= maxOffers && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
              This listing has reached its {maxOffers}-offer limit — remove one to add another.
            </p>
          )}
        </div>
      )}

      {form && (
        <div style={formCard}>
          {formError && <div style={errBox}>{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Field label="Offer title">
              <input type="text" value={form.title} onChange={e => patchForm({ title: e.target.value })} placeholder="10% off cellar door tastings" maxLength={80} style={input} />
            </Field>

            <Field label="Details" hint="Optional — the fine print, what's included, how to redeem">
              <textarea value={form.details} onChange={e => patchForm({ details: e.target.value })} rows={3} maxLength={400} placeholder="Mention the Atlas when you book. Valid Wednesday to Friday." style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            </Field>

            <Field label="Link" hint="Optional — where visitors can redeem or read more">
              <input type="url" value={form.url} onChange={e => patchForm({ url: e.target.value })} placeholder="https://…" style={input} />
            </Field>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Field label="Starts" hint="Optional" style={{ flex: '1 1 160px' }}>
                <input type="date" value={form.valid_from} max={form.valid_to || undefined} onChange={e => patchForm({ valid_from: e.target.value })} style={input} />
              </Field>
              <Field label="Ends" hint="The offer disappears after this date" style={{ flex: '1 1 160px' }}>
                <input type="date" value={form.valid_to} min={form.valid_from || today} onChange={e => patchForm({ valid_to: e.target.value })} style={input} />
              </Field>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => { setForm(null); setFormError(null) }} disabled={saving} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Add offer'}</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Layout shell (matches the events section header) ──
function Section({ children, count, max }) {
  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`.aa-offer-add:hover { border-color: var(--color-sage) !important; color: var(--color-sage) !important; background: rgba(122,143,107,0.06) !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Current offers</h2>
        {typeof count === 'number' && count > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
            {max ? `${count} / ${max} live offers` : `${count} offer${count === 1 ? '' : 's'}`}
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

// ── styles (mirror EventsSection) ──
const helpText = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px', lineHeight: 1.5 }
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }
const lockCard = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const offerRow = { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-border)', background: '#fff' }
const liveBadge = { display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: 'rgba(122,143,107,0.16)', color: '#3a7d44', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600 }
const expiredBadge = { display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: '#F1EFE8', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600 }
const addBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s ease', alignSelf: 'flex-start' }
const formCard = { marginTop: 14, padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const input = { width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', cursor: 'pointer', flexShrink: 0 }
const cancelBtn = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const saveBtn = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
