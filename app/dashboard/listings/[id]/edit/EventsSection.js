'use client'

import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

/**
 * Events manager for the listing editor (paid perk).
 *
 * Loads, creates, edits and deletes events for one listing via
 * /api/dashboard/events (Bearer). A published event surfaces on the listing's
 * public page and the Atlas /events index; a draft stays private to this editor.
 * Mirrors the photo-gallery perk pattern: a lock card when the listing isn't paid.
 */

const ICONS = {
  calendar: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  external: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
}

const emptyForm = { id: null, title: '', category: '', start_date: '', end_date: '', hero_image_url: '', ticket_url: '', is_free: true, description: '', address: '', published: false }

function toDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtRange(startIso, endIso) {
  const s = startIso ? new Date(startIso) : null
  if (!s || isNaN(s.getTime())) return ''
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
  const startStr = s.toLocaleDateString('en-AU', opts)
  const e = endIso ? new Date(endIso) : null
  if (!e || isNaN(e.getTime()) || s.toDateString() === e.toDateString()) return startStr
  return `${startStr} – ${e.toLocaleDateString('en-AU', opts)}`
}

export default function EventsSection({ listingId, token, isPaid, listingSlug }) {
  const [maxEvents, setMaxEvents] = useState(3)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(null) // null = closed; object = create/edit
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!isPaid || !token) { setLoading(false); return }
    let active = true
    fetch(`/api/dashboard/events?listing_id=${listingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (active) { if (data.error) setLoadError(data.error); else { setEvents(data.events || []); if (data.maxEvents) setMaxEvents(data.maxEvents) } ; setLoading(false) } })
      .catch(() => { if (active) { setLoadError('Failed to load events'); setLoading(false) } })
    return () => { active = false }
  }, [listingId, token, isPaid])

  const patchForm = useCallback((p) => setForm(prev => ({ ...prev, ...p })), [])

  async function handleImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFormError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/dashboard/listing/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const data = await res.json()
      if (!res.ok) setFormError(data.error || 'Image upload failed')
      else patchForm({ hero_image_url: data.url })
    } catch { setFormError('Image upload failed') }
    finally { setUploading(false) }
  }

  async function save() {
    if (!form.title.trim()) { setFormError('Give your event a name'); return }
    if (!form.start_date) { setFormError('Choose a date for your event'); return }
    setSaving(true)
    setFormError(null)
    const isEdit = !!form.id
    const payload = {
      listing_id: listingId,
      title: form.title.trim(),
      category: form.category.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      hero_image_url: form.hero_image_url || null,
      ticket_url: form.ticket_url.trim() || null,
      is_free: !!form.is_free,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      published: !!form.published,
    }
    if (isEdit) payload.id = form.id
    try {
      const res = await fetch('/api/dashboard/events', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed to save event'); setSaving(false); return }
      setEvents(prev => isEdit ? prev.map(ev => ev.id === data.event.id ? data.event : ev) : [...prev, data.event])
      setForm(null)
    } catch { setFormError('Failed to save event') }
    finally { setSaving(false) }
  }

  const [pendingDelete, setPendingDelete] = useState(null)

  function remove(ev) {
    setPendingDelete(ev)
  }

  async function confirmRemove() {
    const ev = pendingDelete
    if (!ev) return
    setBusyId(ev.id)
    try {
      const res = await fetch(`/api/dashboard/events?id=${encodeURIComponent(ev.id)}&listing_id=${encodeURIComponent(listingId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setEvents(prev => prev.filter(e => e.id !== ev.id))
    } catch { /* ignore */ }
    finally {
      setBusyId(null)
      setPendingDelete(null)
    }
  }

  async function togglePublish(ev) {
    setBusyId(ev.id)
    try {
      const res = await fetch('/api/dashboard/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: ev.id, listing_id: listingId, published: !ev.published }),
      })
      const data = await res.json()
      if (res.ok) setEvents(prev => prev.map(e => e.id === data.event.id ? data.event : e))
    } catch { /* ignore */ }
    finally { setBusyId(null) }
  }

  // ── Non-paid lock card ──
  if (!isPaid) {
    return (
      <Section>
        <div style={lockCard}>
          <span style={{ display: 'inline-flex', color: 'var(--color-sage)', flexShrink: 0 }}>{ICONS.calendar}</span>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Host your own events</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Events are part of a paid listing. Publish tastings, markets and pop-ups to your page and the Atlas events calendar.
            </p>
            <a href="/dashboard/subscription" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none' }}>View subscription options →</a>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section count={events.length} max={maxEvents}>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this event?"
        message={pendingDelete ? `“${pendingDelete.title}” will be removed from your listing and the Atlas events calendar. This can't be undone.` : ''}
        confirmLabel="Delete event"
        danger
        busy={!!pendingDelete && busyId === pendingDelete.id}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
      <p style={helpText}>
        Add tastings, markets, dinners or pop-ups. Published events appear on your public listing and the Atlas <a href="/events" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage)', textDecoration: 'none' }}>events page</a>; drafts stay private until you publish them.
      </p>

      {loadError && <div style={errBox}>{loadError}</div>}

      {loading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Loading events…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(ev => (
            <div key={ev.id} style={eventRow}>
              <div style={thumb}>
                {ev.hero_image_url
                  ? <img src={ev.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span style={{ color: 'var(--color-muted)', display: 'inline-flex' }}>{ICONS.calendar}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)' }}>{ev.title}</span>
                  <span style={ev.published ? pubBadge : draftBadge}>{ev.published ? 'Published' : 'Draft'}</span>
                </div>
                <div style={{ marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{fmtRange(ev.start_date, ev.end_date)}</span>
                  {ev.category && <span style={typePill}>{ev.category}</span>}
                  {ev.published && ev.slug && (
                    <a href={`/events/${ev.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>View {ICONS.external}</a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => togglePublish(ev)} disabled={busyId === ev.id} style={ghostBtn} title={ev.published ? 'Unpublish' : 'Publish'}>
                  {ev.published ? 'Unpublish' : 'Publish'}
                </button>
                <button type="button" onClick={() => setForm({ id: ev.id, title: ev.title || '', category: ev.category || '', start_date: toDateInput(ev.start_date), end_date: toDateInput(ev.end_date), hero_image_url: ev.hero_image_url || '', ticket_url: ev.ticket_url || '', is_free: ev.is_free !== false, description: ev.description || '', address: ev.address || '', published: !!ev.published })} style={ghostBtn}>Edit</button>
                <button type="button" onClick={() => remove(ev)} disabled={busyId === ev.id} aria-label="Delete event" style={iconBtn}>{ICONS.trash}</button>
              </div>
            </div>
          ))}

          {!form && events.length < maxEvents && (
            <button type="button" onClick={() => setForm({ ...emptyForm })} style={addBtn} className="aa-evt-add">
              <span style={{ display: 'inline-flex' }}>{ICONS.plus}</span> Add an event
            </button>
          )}
          {!form && events.length >= maxEvents && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
              This listing has reached its {maxEvents}-event limit — delete an old event to add a new one.
            </p>
          )}
        </div>
      )}

      {form && (
        <div style={formCard}>
          {formError && <div style={errBox}>{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Field label="Event name">
              <input type="text" value={form.title} onChange={e => patchForm({ title: e.target.value })} placeholder="Single-origin tasting flight" maxLength={200} style={input} />
            </Field>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Field label="What kind of event?" hint="Type anything — “Tasting”, “Market”, “Long lunch”." style={{ flex: '1 1 220px' }}>
                <input type="text" value={form.category} onChange={e => patchForm({ category: e.target.value })} placeholder="Tasting" maxLength={60} style={input} />
              </Field>
              <Field label="Free event?" style={{ flex: '0 0 auto' }}>
                <label style={toggleRow}>
                  <input type="checkbox" checked={form.is_free} onChange={e => patchForm({ is_free: e.target.checked })} style={{ accentColor: 'var(--color-sage)', width: 16, height: 16 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>{form.is_free ? 'Free to attend' : 'Ticketed'}</span>
                </label>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Field label="Date" style={{ flex: '1 1 160px' }}>
                <input type="date" value={form.start_date} onChange={e => patchForm({ start_date: e.target.value })} style={input} />
              </Field>
              <Field label="End date" hint="Optional — for multi-day events" style={{ flex: '1 1 160px' }}>
                <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => patchForm({ end_date: e.target.value })} style={input} />
              </Field>
            </div>

            <Field label="Booking or info link" hint="Optional">
              <input type="url" value={form.ticket_url} onChange={e => patchForm({ ticket_url: e.target.value })} placeholder="https://…" style={input} />
            </Field>

            <Field label="Address" hint="Optional — leave blank if the event is at your venue">
              <input type="text" value={form.address} onChange={e => patchForm({ address: e.target.value })} placeholder="e.g. 12 Example St, Sandringham VIC" maxLength={300} style={input} />
            </Field>

            <Field label="Description" hint="Optional — what to expect">
              <textarea value={form.description} onChange={e => patchForm({ description: e.target.value })} rows={3} maxLength={4000} placeholder="Tell guests what the event is about." style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            </Field>

            <Field label="Event image" hint="Optional — shown on your page and the events calendar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {form.hero_image_url && (
                  <div style={{ position: 'relative', width: 96, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', flexShrink: 0 }}>
                    <img src={form.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}
                <label style={uploadBtn}>
                  {uploading ? 'Uploading…' : (form.hero_image_url ? 'Replace image' : 'Upload image')}
                  <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} style={{ display: 'none' }} />
                </label>
                {form.hero_image_url && !uploading && (
                  <button type="button" onClick={() => patchForm({ hero_image_url: '' })} style={ghostBtn}>Remove</button>
                )}
              </div>
            </Field>

            <label style={{ ...toggleRow, padding: '10px 12px', borderRadius: 8, background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
              <input type="checkbox" checked={form.published} onChange={e => patchForm({ published: e.target.checked })} style={{ accentColor: 'var(--color-sage)', width: 16, height: 16 }} />
              <span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>Publish this event</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>Make it visible on your listing and the Atlas events page.</span>
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => { setForm(null); setFormError(null) }} disabled={saving} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={saving || uploading} style={saveBtn}>{saving ? 'Saving…' : (form.id ? 'Save event' : 'Add event')}</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Layout shell (matches the gallery section header) ──
function Section({ children, count, max }) {
  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`.aa-evt-add:hover { border-color: var(--color-sage) !important; color: var(--color-sage) !important; background: rgba(122,143,107,0.06) !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Events</h2>
        {typeof count === 'number' && count > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
            {max ? `${count} / ${max} events` : `${count} event${count === 1 ? '' : 's'}`}
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

// ── styles ──
const helpText = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px', lineHeight: 1.5 }
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }
const lockCard = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const eventRow = { display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, border: '1px solid var(--color-border)', background: '#fff' }
const thumb = { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)' }
const typePill = { display: 'inline-block', padding: '1px 8px', borderRadius: 100, background: '#F1EFE8', color: '#5F5E5A', fontSize: 11, textTransform: 'capitalize' }
const pubBadge = { display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: 'rgba(122,143,107,0.16)', color: '#3a7d44', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600 }
const draftBadge = { display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: '#F1EFE8', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600 }
const addBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s ease', alignSelf: 'flex-start' }
const formCard = { marginTop: 14, padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
const input = { width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const toggleRow = { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }
const ghostBtn = { padding: '6px 11px', borderRadius: 7, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', cursor: 'pointer' }
const uploadBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const cancelBtn = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const saveBtn = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
