'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getDashboardToken } from '@/lib/dashboard-token'
import { getListingRegion } from '@/lib/regions'
import { getVerticalLabel, getVerticalBrandColour } from '@/lib/verticalUrl'
import HighlightsEditor from './HighlightsEditor'
import KeywordsEditor from './KeywordsEditor'
import EventsSection from './EventsSection'
import PicksSection from './PicksSection'

/**
 * WYSIWYG operator listing editor.
 *
 * Renders the listing the way visitors see it on /place/[slug] — hero band,
 * editorial description, and a meta sidebar — and lets the operator edit the
 * four owner-controllable fields inline: hero image, website, phone and
 * opening hours. Everything else (name, category, location, description) is a
 * read-only preview so the operator sees their page as it will appear.
 *
 * Saves through PATCH /api/dashboard/listing (master write + vertical
 * sync-back), the same contract as the previous form-based editor. A floating
 * action bar surfaces only when there are unsaved changes.
 */

// ── Day / vertical helpers ──────────────────────────────────
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_FULL = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}
const DAY_SHORT = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

// Category eyebrow labels — mirrors VERTICAL_CATEGORY_LABELS in app/place/[slug]/page.js.
const VERTICAL_CATEGORY_LABELS = {
  sba: 'Artisan Producer', collection: 'Cultural Institution', craft: 'Maker & Studio',
  fine_grounds: 'Specialty Coffee', rest: 'Boutique Stay', field: 'Natural Place',
  corner: 'Independent Shop', found: 'Vintage & Secondhand', table: 'Independent Dining',
  way: 'Experience',
}

// Paid-tier photo gallery cap (mirrors MAX_GALLERY_PHOTOS in lib/listing-gallery).
const MAX_GALLERY = 15

function defaultDays() {
  const out = {}
  for (const d of DAY_KEYS) out[d] = { enabled: false, open: '09:00', close: '17:00' }
  return out
}
function daysToHours(days) {
  const out = {}
  for (const d of DAY_KEYS) {
    const v = days[d]
    if (v?.enabled && v.open && v.close) out[d] = { open: v.open, close: v.close }
  }
  return Object.keys(out).length ? out : null
}
function hoursToDays(hours) {
  const out = defaultDays()
  if (hours && typeof hours === 'object') {
    for (const d of DAY_KEYS) {
      const v = hours[d]
      if (v?.open && v.close) out[d] = { enabled: true, open: v.open, close: v.close }
    }
  }
  return out
}
function cleanWebsite(url) {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname + (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

// ── Hours display helpers (mirror components/OpeningHours.js) ──
function formatTime(t) {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const suffix = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return m > 0 ? `${h}:${mStr}${suffix}` : `${h}${suffix}`
}
function groupHours(hours) {
  const groups = []
  let cur = null
  for (const day of DAY_KEYS) {
    const h = hours?.[day]
    const key = h ? `${h.open}-${h.close}` : 'closed'
    if (cur && cur.key === key) cur.endDay = day
    else {
      if (cur) groups.push(cur)
      cur = { startDay: day, endDay: day, key, open: h?.open || null, close: h?.close || null, closed: !h }
    }
  }
  if (cur) groups.push(cur)
  return groups
}
function groupLabel(g) {
  return g.startDay === g.endDay ? DAY_SHORT[g.startDay] : `${DAY_SHORT[g.startDay]}–${DAY_SHORT[g.endDay]}`
}
function getCurrentDay() {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()]
}
function isOpenNow(hours) {
  const th = hours?.[getCurrentDay()]
  if (!th) return false
  const now = new Date()
  const cm = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = th.open.split(':').map(Number)
  const [ch, cm2] = th.close.split(':').map(Number)
  return cm >= oh * 60 + om && cm < ch * 60 + cm2
}

// ── Icons ────────────────────────────────────────────────────
const ICONS = {
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  map: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" /></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  pencil: <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  camera: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  external: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  lock: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
  check: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
}

// ── Shared styles for inline-edit primitives ─────────────────
const dtLabel = { fontFamily: 'var(--font-body)', color: 'var(--color-muted)', letterSpacing: '0.08em', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }
const metaStatic = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.45 }
const editTriggerStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: 'none', border: 'none', padding: '3px 6px', margin: '-3px -6px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.45, textAlign: 'left' }
const inlineInputStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--color-sage)', borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const timeInput = { padding: '5px 7px', borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', background: '#fff' }
const editToggle = { background: 'none', border: 'none', color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }

// ── Inline click-to-edit text value ──────────────────────────
function EditableValue({ value, onChange, placeholder, inputType = 'text', inputMode, format, color }) {
  const [editing, setEditing] = useState(false)
  const startRef = useRef('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={inputType}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); setEditing(false) }
          else if (e.key === 'Escape') { onChange(startRef.current); setEditing(false) }
        }}
        onBlur={() => setEditing(false)}
        style={inlineInputStyle}
      />
    )
  }

  const has = !!(value && value.trim())
  return (
    <button
      type="button"
      className="aa-edit"
      onClick={() => { startRef.current = value || ''; setEditing(true) }}
      style={{ ...editTriggerStyle, color: has ? (color || 'var(--color-ink)') : 'var(--color-muted)' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: has ? 'normal' : 'italic' }}>
        {has ? (format ? format(value) : value) : placeholder}
      </span>
      <span className="aa-pencil" style={{ flexShrink: 0, display: 'inline-flex' }}>{ICONS.pencil}</span>
    </button>
  )
}

// ── Meta row (icon + label + value), matches the public sidebar ──
function MetaRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }}>{ICONS[icon]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={dtLabel}>{label}</div>
        {children}
      </div>
    </div>
  )
}

// ── Opening-hours block: grouped display ↔ inline day editor ──
function HoursBlock({ days, setDay, editing, setEditing, mounted }) {
  const hours = daysToHours(days)
  const groups = hours ? groupHours(hours) : []
  const openNow = mounted && hours ? isOpenNow(hours) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (editing || hours) ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--color-muted)', display: 'inline-flex' }}>{ICONS.clock}</span>
          <span style={dtLabel}>Opening hours</span>
        </div>
        <button type="button" onClick={() => setEditing(!editing)} style={editToggle}>
          {editing ? 'Done' : (hours ? 'Edit' : null)}
        </button>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DAY_KEYS.map(day => (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, width: 104, cursor: 'pointer' }}>
                <input type="checkbox" checked={days[day].enabled} onChange={e => setDay(day, { enabled: e.target.checked })} style={{ accentColor: 'var(--color-sage)' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)' }}>{DAY_FULL[day]}</span>
              </label>
              {days[day].enabled ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="time" value={days[day].open} onChange={e => setDay(day, { open: e.target.value })} style={timeInput} />
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>to</span>
                  <input type="time" value={days[day].close} onChange={e => setDay(day, { close: e.target.value })} style={timeInput} />
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Closed</span>
              )}
            </div>
          ))}
        </div>
      ) : hours ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => (
            <div key={g.startDay} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
              <span>{groupLabel(g)}</span>
              <span>{g.closed ? 'Closed' : `${formatTime(g.open)}–${formatTime(g.close)}`}</span>
            </div>
          ))}
          {openNow !== null && (
            <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'var(--font-body)', color: openNow ? '#3a7d44' : 'var(--color-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: openNow ? '#3a7d44' : 'var(--color-muted)' }} />
              {openNow ? 'Open now' : 'Closed now'}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} style={{ ...editTriggerStyle, color: 'var(--color-muted)', fontStyle: 'italic' }}>
          Add opening hours
          <span className="aa-pencil" style={{ display: 'inline-flex' }}>{ICONS.pencil}</span>
        </button>
      )}
    </div>
  )
}

// ── Main editor ──────────────────────────────────────────────
export default function EditListingPage() {
  const { id } = useParams()

  const [token, setToken] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)

  // Paid-tier gate: editing is unlocked by an active standard claim (listing.paid)
  // or for admins. Unpaid operators get a "complete payment" challenge instead.
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState(null)
  const [justUpgraded, setJustUpgraded] = useState(false)

  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [gallery, setGallery] = useState([])
  const [days, setDays] = useState(defaultDays)
  const [hoursEditing, setHoursEditing] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [imageNotice, setImageNotice] = useState(null) // { tone, text } from moderation
  const [galleryStatus, setGalleryStatus] = useState({}) // url -> { status, reason } for per-photo badges
  const [galleryUploading, setGalleryUploading] = useState(0)
  const [galleryError, setGalleryError] = useState(null)
  // Upload-rights gate (governs hero + gallery uploads).
  const [uploadWarrantyAccepted, setUploadWarrantyAccepted] = useState(false)
  const [sourceDeclaration, setSourceDeclaration] = useState('')
  const [uploadTermsDoc, setUploadTermsDoc] = useState(null)
  const uploadGateRef = useRef(null) // scroll target when an upload is blocked on consent
  const [gateNudge, setGateNudge] = useState(false) // momentary highlight on the rights panel
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [pollNonce, setPollNonce] = useState(0)

  const baselineRef = useRef({ website: '', phone: '', heroImageUrl: '', hoursKey: 'null', galleryKey: '[]' })

  const setBaseline = useCallback((w, p, h, d, g) => {
    baselineRef.current = { website: w, phone: p, heroImageUrl: h, hoursKey: JSON.stringify(daysToHours(d)), galleryKey: JSON.stringify(g || []) }
  }, [])

  useEffect(() => { setMounted(true) }, [])

  // Load current upload terms so the image-rights panel renders live DB wording.
  useEffect(() => {
    let active = true
    fetch('/api/legal/current?types=upload_terms')
      .then(r => r.json())
      .then(d => { if (active) setUploadTermsDoc(d?.docs?.upload_terms || null) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Returning from a successful upgrade checkout (?upgraded=1). The webhook may
  // take a moment to flip the claim to standard, so we flag it and let the
  // finalising poll below re-fetch until listing.paid turns true.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('upgraded') === '1') {
      setJustUpgraded(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    getDashboardToken().then(t => {
      if (!active) return
      if (!t) { setToken(null); setLoading(false); return }
      setToken(t)
      try { setIsAdmin(JSON.parse(atob(t.split('.')[1]))?.role === 'admin') } catch { /* ignore */ }
      fetch(`/api/dashboard?listing_id=${id}`, { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(data => {
          if (!active) return
          if (data.error) {
            setError(data.error)
          } else {
            const l = (data.listings || [])[0]
            if (!l) {
              setError('Listing not found')
            } else {
              const w = l.website || '', p = l.phone || '', h = l.hero_image_url || ''
              const d = hoursToDays(l.hours)
              const g = Array.isArray(l.gallery_image_urls) ? l.gallery_image_urls : []
              setListing(l)
              setWebsite(w)
              setPhone(p)
              setHeroImageUrl(h)
              setGallery(g)
              if (Array.isArray(l.gallery_moderation)) {
                setGalleryStatus(Object.fromEntries(l.gallery_moderation.map(s => [s.url, { status: s.status, reason: s.reason }])))
              }
              setDays(d)
              setBaseline(w, p, h, d, g)
            }
          }
          setLoading(false)
        })
        .catch(() => { if (active) { setError('Failed to load listing'); setLoading(false) } })
    })
    return () => { active = false }
  }, [id, setBaseline])

  // Finalising poll: after an upgrade, re-fetch the listing until the webhook has
  // flipped the claim to standard (listing.paid === true), then the editor unlocks.
  // When the poll exhausts without the webhook landing, surface that instead of
  // spinning forever — "Check again" bumps pollNonce to start a fresh round.
  useEffect(() => {
    const paid = !!listing?.paid
    if (!justUpgraded || !token || paid || isAdmin) return
    let tries = 0
    const iv = setInterval(() => {
      tries += 1
      fetch(`/api/dashboard?listing_id=${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          const l = (data.listings || [])[0]
          if (l) setListing(prev => ({ ...prev, ...l }))
        })
        .catch(() => { /* keep trying */ })
      if (tries >= 8) {
        clearInterval(iv)
        setPollTimedOut(true)
      }
    }, 3000)
    return () => clearInterval(iv)
  }, [justUpgraded, token, isAdmin, id, listing?.paid, pollNonce])

  async function handleUpgrade() {
    setUpgrading(true)
    setUpgradeError(null)
    try {
      const res = await fetch('/api/stripe/upgrade-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: id }),
      })
      let data = {}
      try { data = await res.json() } catch { /* non-JSON error body */ }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setUpgradeError(data.error || 'We couldn’t start payment. Please try again, or email listings@australianatlas.com.au.')
    } catch {
      setUpgradeError('We couldn’t start payment. Please check your connection and try again.')
    } finally {
      setUpgrading(false)
    }
  }

  const setDay = useCallback((day, patch) => {
    setDays(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }, [])

  // When an upload is blocked because the operator hasn't ticked the image-rights
  // box, the box can be off-screen below the hero — so bring it into view and flash
  // it. Without this, the upload button (in the hero) and the consent box (in the
  // body) are far apart and the message reads as "there's nowhere to confirm".
  const nudgeUploadGate = useCallback(() => {
    try {
      uploadGateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      uploadGateRef.current?.scrollIntoView()
    }
    setGateNudge(true)
    setTimeout(() => setGateNudge(false), 2400)
  }, [])

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    if (!uploadWarrantyAccepted) {
      setUploadError('Tick the “image rights” box just below the photo to confirm you can use this image, then add your photo again.')
      e.target.value = ''
      nudgeUploadGate()
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('listingId', id)
      fd.append('assetKind', 'hero')
      fd.append('uploadWarrantyAccepted', 'true')
      if (sourceDeclaration.trim()) fd.append('sourceDeclaration', sourceDeclaration.trim())
      const res = await fetch('/api/dashboard/listing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) setUploadError(data.error || 'Upload failed')
      else setHeroImageUrl(data.url)
    } catch {
      setUploadError('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // Gallery: upload one or many files, appending each returned URL up to the cap.
  async function handleGalleryAdd(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setGalleryError(null)
    if (!uploadWarrantyAccepted) {
      setGalleryError('Tick the “image rights” box near the top of this page to confirm you can use these images, then add your photos again.')
      nudgeUploadGate()
      return
    }
    const remaining = MAX_GALLERY - gallery.length
    if (remaining <= 0) { setGalleryError(`You can add up to ${MAX_GALLERY} photos.`); return }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) {
      setGalleryError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added — extra files were skipped.`)
    }
    setGalleryUploading(n => n + toUpload.length)
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('listingId', id)
        fd.append('assetKind', 'gallery')
        fd.append('uploadWarrantyAccepted', 'true')
        if (sourceDeclaration.trim()) fd.append('sourceDeclaration', sourceDeclaration.trim())
        const res = await fetch('/api/dashboard/listing/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) setGalleryError(data.error || 'Some photos failed to upload')
        else if (data.url) setGallery(prev => (prev.length < MAX_GALLERY && !prev.includes(data.url) ? [...prev, data.url] : prev))
      } catch {
        setGalleryError('Some photos failed to upload')
      } finally {
        setGalleryUploading(n => Math.max(0, n - 1))
      }
    }
  }

  function removeGalleryAt(i) {
    setGallery(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveGallery(i, dir) {
    setGallery(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function handleDiscard() {
    const b = baselineRef.current
    setWebsite(b.website)
    setPhone(b.phone)
    setHeroImageUrl(b.heroImageUrl)
    setGallery(JSON.parse(b.galleryKey))
    setDays(hoursToDays(JSON.parse(b.hoursKey)))
    setHoursEditing(false)
    setSaveError(null)
    setGalleryError(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setImageNotice(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: id,
          website: website.trim() || null,
          phone: phone.trim() || null,
          hours: daysToHours(days),
          hero_image_url: heroImageUrl || null,
          gallery_image_urls: gallery,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save changes')
      } else {
        if (data.listing) {
          const w = data.listing.website || '', p = data.listing.phone || '', h = data.listing.hero_image_url || ''
          const d = hoursToDays(data.listing.hours)
          const g = Array.isArray(data.listing.gallery_image_urls) ? data.listing.gallery_image_urls : gallery
          setListing(prev => ({ ...prev, ...data.listing }))
          setWebsite(w); setPhone(p); setHeroImageUrl(h); setGallery(g); setDays(d)
          setBaseline(w, p, h, d, g)
        } else {
          setBaseline(website, phone, heroImageUrl, days, gallery)
        }
        // Image-moderation feedback for hero + gallery: anything flagged or held
        // won't appear publicly until it passes / an admin approves it.
        const mod = data.imageModeration
        const gmod = data.galleryModeration
        const msgs = []
        let tone = 'warn'
        if (mod && mod.status === 'flagged') { msgs.push(`Your cover photo can’t be published${mod.reason ? `: ${mod.reason}` : ''}.`); tone = 'error' }
        else if (mod && mod.status === 'held') { msgs.push('Your cover photo is under review and will appear once approved.') }
        if (gmod && gmod.hidden > 0) {
          const parts = []
          if (gmod.flagged) parts.push(`${gmod.flagged} can’t be published`)
          if (gmod.held) parts.push(`${gmod.held} under review`)
          msgs.push(`${gmod.hidden} gallery photo${gmod.hidden === 1 ? '' : 's'} won’t appear yet${parts.length ? ` (${parts.join(', ')})` : ''}.`)
          if (gmod.flagged) tone = 'error'
        }
        setImageNotice(msgs.length ? { tone, text: msgs.join(' ') } : null)
        if (gmod && Array.isArray(gmod.statuses)) {
          setGalleryStatus(Object.fromEntries(gmod.statuses.map(s => [s.url, { status: s.status, reason: s.reason }])))
        }
        setHoursEditing(false)
        setJustSaved(true)
        setLastSavedAt(new Date())
        setTimeout(() => setJustSaved(false), 2500)
      }
    } catch {
      setSaveError('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / auth / error states ──
  if (loading) {
    return <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading…</p>
  }
  if (!token) {
    return (
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Sign in required</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: '8px 0 16px' }}>You need to be signed in to edit a listing.</p>
        <Link href="/login" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 8, background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>Sign in</Link>
      </div>
    )
  }
  if (error && !listing) {
    return (
      <div style={{ maxWidth: 520 }}>
        <Link href="/dashboard/listings" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textDecoration: 'none' }}>← Back to my listings</Link>
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 14 }}>{error}</div>
      </div>
    )
  }

  // ── Derived preview values ──
  const vertColor = getVerticalBrandColour(listing.vertical) || 'var(--color-sage)'
  const categoryLabel = VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const region = getListingRegion(listing)
  const location = [region?.name, listing.state].filter(Boolean).join(', ')
  const hasCoords = listing.lat && listing.lng
  const websiteUrl = website?.trim() ? (website.startsWith('http') ? website : `https://${website}`) : null

  const isPaid = !!listing.paid
  const canEdit = isPaid || isAdmin

  // ── Paid-tier gate ──────────────────────────────────────────
  // A free-tier claim verifies ownership and keeps the listing live, but managing
  // it is a Standard-plan feature. Unpaid operators get a payment challenge here
  // instead of the editor; the PATCH route enforces the same gate server-side.
  if (!canEdit) {
    const standardPerks = [
      'Edit your website, phone & opening hours',
      'Add a cover photo and a photo gallery',
      'Publish operator highlights & what’s on',
      'Listing Insights — views, searches & trails',
      'Producer’s Picks',
    ]
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 900, margin: '0 auto 16px', flexWrap: 'wrap' }}>
          <Link href="/dashboard/listings" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textDecoration: 'none' }}>← Back to my listings</Link>
          {listing.slug && (
            <a href={`/place/${listing.slug}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', textDecoration: 'none' }}>
              View public page {ICONS.external}
            </a>
          )}
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 10px 34px rgba(0,0,0,0.06)' }}>
          {/* Listing header band (read-only) */}
          <div style={{ position: 'relative', padding: 'clamp(24px, 4vw, 40px)', background: listing.hero_image_url ? '#1C1A17' : 'linear-gradient(135deg, #2b2823, #3c352c)', overflow: 'hidden' }}>
            {listing.hero_image_url && (
              <>
                <img src={listing.hero_image_url} alt={listing.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,26,23,0.86), rgba(28,26,23,0.5))' }} />
              </>
            )}
            <div style={{ position: 'relative' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', margin: '0 0 10px' }}>
                {getVerticalLabel(listing.vertical)} &middot; {categoryLabel}
              </p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', lineHeight: 1.12, color: '#fff', margin: 0 }}>{listing.name}</h1>
              {location && <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.72)', margin: '8px 0 0' }}>{location}</p>}
            </div>
          </div>

          {/* Challenge body */}
          <div style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
            {justUpgraded && !isPaid ? (
              pollTimedOut ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '20px 0' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Payment confirmed — still finalising</h2>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0, maxWidth: 460, lineHeight: 1.55 }}>
                    Stripe has your payment, but our system is taking longer than usual to unlock the
                    editor. This resolves itself within a few minutes — you won’t be charged twice.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => { setPollTimedOut(false); setPollNonce(n => n + 1) }}
                    >
                      Check again
                    </button>
                    <a className="btn btn-secondary btn-sm" href="mailto:listings@australianatlas.com.au?subject=Upgrade%20not%20unlocking">
                      Email support
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '20px 0' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-sage)', animation: 'aa-spin 0.8s linear infinite' }} />
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Payment received — finalising your upgrade</h2>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0, maxWidth: 440, lineHeight: 1.55 }}>
                    This usually takes a few seconds — your editor will unlock automatically. If it doesn’t, refresh this page in a moment.
                  </p>
                  <style>{`@keyframes aa-spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5" style={{ gap: 28 }}>
                <div className="lg:col-span-3">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 100, background: 'var(--color-cream)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                    <span style={{ display: 'inline-flex' }}>{ICONS.lock}</span> Editing locked
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', color: 'var(--color-ink)', margin: '14px 0 10px', lineHeight: 1.2 }}>
                    Unlock editing for {listing.name}
                  </h2>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)', margin: 0, lineHeight: 1.6, maxWidth: 460 }}>
                    Your claim is verified and your listing is live across the Atlas network. To manage its details, activate your <strong style={{ color: 'var(--color-ink)' }}>Standard</strong> subscription — <strong style={{ color: 'var(--color-ink)' }}>$295/year</strong>.
                  </p>
                  {upgradeError && (
                    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }}>{upgradeError}</div>
                  )}
                  <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <button type="button" onClick={handleUpgrade} disabled={upgrading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--color-ink)', color: '#fff', border: 'none', borderRadius: 100, padding: '13px 26px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: upgrading ? 'wait' : 'pointer', opacity: upgrading ? 0.7 : 1 }}>
                      {upgrading ? 'Starting secure checkout…' : 'Complete payment — $295/yr'}
                    </button>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>Secure payment via Stripe &middot; cancel anytime</span>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div style={{ borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', padding: 20 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 12px' }}>What you unlock</p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {standardPerks.map(perk => (
                        <li key={perk} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--color-sage)', flexShrink: 0, marginTop: 1 }}>{ICONS.check}</span>
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  const dirty =
    website !== baselineRef.current.website ||
    phone !== baselineRef.current.phone ||
    heroImageUrl !== baselineRef.current.heroImageUrl ||
    JSON.stringify(daysToHours(days)) !== baselineRef.current.hoursKey ||
    JSON.stringify(gallery) !== baselineRef.current.galleryKey

  const showBar = dirty || saving || justSaved || saveError

  return (
    <>
      <style>{`
        .aa-edit { transition: background 0.12s ease; }
        .aa-edit:hover { background: rgba(28,26,23,0.05); }
        .aa-edit .aa-pencil { opacity: 0; transition: opacity 0.12s ease; }
        .aa-edit:hover .aa-pencil { opacity: 0.45; }
        .aa-hero-btn { transition: background 0.12s ease; }
        .aa-hero-btn:hover { background: rgba(28,26,23,0.8) !important; }
        .aa-gtile .aa-gtile-bar { opacity: 0; transition: opacity 0.12s ease; }
        .aa-gtile:hover .aa-gtile-bar, .aa-gtile:focus-within .aa-gtile-bar { opacity: 1; }
        .aa-gadd:hover { border-color: var(--color-sage) !important; color: var(--color-sage) !important; background: rgba(122,143,107,0.06) !important; }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 900, margin: '0 auto 16px', flexWrap: 'wrap' }}>
        <Link href="/dashboard/listings" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textDecoration: 'none' }}>← Back to my listings</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Live document status: unsaved → saving → saved-at-time. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: dirty ? 'var(--color-gold)' : 'var(--color-sage)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dirty ? 'var(--color-gold)' : 'var(--color-sage)' }} />
            {saving
              ? 'Saving…'
              : dirty
                ? 'Unsaved changes'
                : lastSavedAt
                  ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Editing'}
          </span>
          {listing.slug && (
            <a href={`/place/${listing.slug}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', textDecoration: 'none' }}>
              View public page {ICONS.external}
            </a>
          )}
        </div>
      </div>

      {/* ── Listing canvas ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 10px 34px rgba(0,0,0,0.06)' }}>

        {/* Hero */}
        <div style={{ position: 'relative', width: '100%', minHeight: 'clamp(280px, 30vw, 380px)', overflow: 'hidden', background: heroImageUrl ? '#1C1A17' : 'linear-gradient(135deg, #2b2823, #3c352c)' }}>
          {heroImageUrl && (
            <img src={heroImageUrl} alt={listing.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: heroImageUrl ? 'linear-gradient(to top, rgba(28,26,23,0.66) 0%, rgba(28,26,23,0.16) 45%, transparent 72%)' : 'linear-gradient(to top, rgba(20,18,15,0.5), transparent 68%)' }} />

          {/* Empty-state prompt (upper area, doesn't collide with title) */}
          {!heroImageUrl && !uploading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.72)' }}>
                <span style={{ display: 'inline-flex' }}>{ICONS.camera}</span>
                <div style={{ marginTop: 8, fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  {uploadWarrantyAccepted
                    ? 'Add a cover photo to bring your listing to life'
                    : 'Tick the image-rights box below, then add a cover photo'}
                </div>
              </div>
            </div>
          )}

          {/* Image controls */}
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 3 }}>
            <label className="aa-hero-btn" style={heroBtn}>
              {uploading ? 'Uploading…' : (heroImageUrl ? 'Replace photo' : 'Add cover photo')}
              <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} style={{ display: 'none' }} />
            </label>
            {heroImageUrl && (
              <button type="button" className="aa-hero-btn" onClick={() => setHeroImageUrl('')} style={heroBtn}>Remove</button>
            )}
          </div>

          {/* Overlay title */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(20px, 4vw, 36px)', zIndex: 2 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px' }}>
              {getVerticalLabel(listing.vertical)} &middot; {categoryLabel}
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.7rem, 4vw, 3rem)', lineHeight: 1.1, color: '#fff', margin: 0 }}>
              {listing.name}
            </h1>
            {location && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.72)', margin: '8px 0 0' }}>{location}</p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 'clamp(20px, 4vw, 40px)' }}>
          {uploadError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }}>{uploadError}</div>
          )}
          {imageNotice && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13,
              background: imageNotice.tone === 'error' ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${imageNotice.tone === 'error' ? '#fecaca' : '#fde68a'}`,
              color: imageNotice.tone === 'error' ? '#991b1b' : '#92400e',
            }}>{imageNotice.text}</div>
          )}
          {listing.is_featured && (
            <div style={{ marginBottom: 20 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 100, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: '#fff', background: 'var(--color-accent)' }}>Featured</span>
            </div>
          )}

          {/* Image-rights gate — governs hero + gallery uploads. Wording from
              legal_documents (upload_terms, is_current); INTERIM pending review.
              Lives below the hero, but the hero's upload button scrolls here and
              flashes it (nudgeUploadGate) so the consent box is never "missing". */}
          <div
            ref={uploadGateRef}
            style={{
              marginBottom: 24,
              padding: '16px 18px',
              borderRadius: 12,
              border: `1px solid ${uploadWarrantyAccepted ? 'var(--color-border)' : vertColor}`,
              background: gateNudge ? '#fffbeb' : 'var(--color-cream)',
              boxShadow: gateNudge ? `0 0 0 3px ${vertColor}55` : 'none',
              transition: 'box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease',
              scrollMarginTop: 24,
            }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: uploadWarrantyAccepted ? 'var(--color-ink)' : vertColor, margin: '0 0 8px' }}>
              {uploadWarrantyAccepted
                ? 'Image rights — confirmed ✓'
                : 'Step 1 — confirm image rights (required before uploading photos)'}
            </p>
            {uploadTermsDoc?.body_md && (
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, lineHeight: 1.6, color: 'var(--color-ink)', opacity: 0.8, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
                {uploadTermsDoc.body_md}
              </p>
            )}
            <label
              htmlFor="upload-warranty"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${uploadWarrantyAccepted ? 'var(--color-border)' : vertColor}`,
                background: '#fff',
              }}
            >
              <input
                id="upload-warranty"
                type="checkbox"
                checked={uploadWarrantyAccepted}
                onChange={e => setUploadWarrantyAccepted(e.target.checked)}
                style={{ marginTop: 1, accentColor: vertColor, width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12.5, color: 'var(--color-ink)' }}>
                I confirm I own or am licensed to use the images I upload, that they infringe no copyright or moral rights, and that anyone identifiable in them has consented.
              </span>
            </label>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="source-declaration" style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'var(--color-ink)', marginBottom: 4 }}>
                Image source / credit <span style={{ fontWeight: 300, color: 'var(--color-muted)' }}>(optional)</span>
              </label>
              <input
                id="source-declaration"
                type="text"
                value={sourceDeclaration}
                onChange={e => setSourceDeclaration(e.target.value)}
                placeholder="e.g. My own photo / commissioned from …"
                style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', outline: 'none' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5" style={{ gap: 40 }}>
            {/* Editorial column (read-only preview) */}
            <div className="lg:col-span-3">
              {listing.description ? (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, lineHeight: 1.75, color: 'var(--color-ink)' }}>
                  {listing.description.split('\n').map((p, i) => (p.trim() ? <p key={i} style={{ margin: i > 0 ? '1.25em 0 0' : 0 }}>{p}</p> : null))}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ margin: 0 }}>Your story appears here for visitors to read.</p>
                  <Link href="/dashboard/description" style={{ color: vertColor, fontWeight: 600, textDecoration: 'none' }}>Write your description →</Link>
                </div>
              )}

              {/* CTA preview — reflects the website you set, just like the live page */}
              <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                {websiteUrl && (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--color-accent)', color: '#fff', borderRadius: 100, padding: '12px 22px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                    Visit Website {ICONS.external}
                  </a>
                )}
                {hasCoords && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500 }}>
                    <span style={{ color: 'var(--color-accent)', display: 'inline-flex' }}>{ICONS.pin}</span>
                    Get Directions
                  </span>
                )}
              </div>
            </div>

            {/* Meta sidebar — the inline editing surface */}
            <div className="lg:col-span-2">
              <div style={{ borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', padding: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {listing.address && (
                    <MetaRow icon="pin" label="Address">
                      <span style={metaStatic}>{listing.address}</span>
                    </MetaRow>
                  )}
                  <MetaRow icon="globe" label="Website">
                    <EditableValue value={website} onChange={setWebsite} placeholder="Add website" inputMode="url" format={cleanWebsite} color={vertColor} />
                  </MetaRow>
                  <MetaRow icon="phone" label="Phone">
                    <EditableValue value={phone} onChange={setPhone} placeholder="Add phone number" inputType="tel" inputMode="tel" color={vertColor} />
                  </MetaRow>
                  {region?.name && (
                    <MetaRow icon="map" label="Region">
                      <span style={{ ...metaStatic, color: vertColor }}>{region.name}</span>
                    </MetaRow>
                  )}
                </div>

                <div style={{ marginTop: 18, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                  <HoursBlock days={days} setDay={setDay} editing={hoursEditing} setEditing={setHoursEditing} mounted={mounted} />
                </div>
              </div>

              <p style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                Click any underlined detail to edit it. Changes appear across the Atlas network once saved.
              </p>
            </div>
          </div>

          {/* ── Highlights — operator-authored "right now" + hiring ── */}
          <HighlightsEditor
            listingId={id}
            vertical={listing.vertical}
            subType={listing.sub_type || (Array.isArray(listing.sub_types) && listing.sub_types[0]) || null}
            token={token}
            initialHighlights={listing.operator_highlights}
            accent={vertColor}
          />

          {/* ── Search keywords — operator-authored, search-only (never public) ── */}
          <KeywordsEditor
            listingId={id}
            token={token}
            initialKeywords={listing.search_keywords}
            accent={vertColor}
          />

          {/* ── Photo gallery (paid perk) ── */}
          <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>Photo gallery</h2>
              {isPaid && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{gallery.length} / {MAX_GALLERY}</span>
              )}
            </div>
            {isPaid && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Up to {MAX_GALLERY} photos, shown as a gallery on your public listing. Hover a photo to reorder or remove it.
              </p>
            )}

            {isPaid ? (
              <>
                {galleryError && <div style={errBox}>{galleryError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  {gallery.map((url, i) => {
                    const gst = galleryStatus[url]?.status
                    const blocked = gst === 'flagged' || gst === 'held'
                    return (
                    <div key={url} className="aa-gtile" style={galleryTile}>
                      <img src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: blocked ? 0.5 : 1 }} />
                      {blocked && (
                        <span title={galleryStatus[url]?.reason || ''} style={{
                          position: 'absolute', top: 8, left: 8, zIndex: 2,
                          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                          padding: '3px 8px', borderRadius: 100, color: '#fff',
                          background: gst === 'flagged' ? 'rgba(220,38,38,0.92)' : 'rgba(180,83,9,0.92)',
                        }}>
                          {gst === 'flagged' ? 'Not shown' : 'Under review'}
                        </span>
                      )}
                      <span style={galleryIndex}>{i + 1}</span>
                      <div className="aa-gtile-bar" style={galleryTileBar}>
                        <button type="button" onClick={() => moveGallery(i, -1)} disabled={i === 0} aria-label="Move earlier" title="Move earlier" style={{ ...gBtn, opacity: i === 0 ? 0.4 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>&lsaquo;</button>
                        <button type="button" onClick={() => removeGalleryAt(i)} aria-label="Remove photo" title="Remove" style={gBtn}>{ICONS.trash}</button>
                        <button type="button" onClick={() => moveGallery(i, 1)} disabled={i === gallery.length - 1} aria-label="Move later" title="Move later" style={{ ...gBtn, opacity: i === gallery.length - 1 ? 0.4 : 1, cursor: i === gallery.length - 1 ? 'default' : 'pointer' }}>&rsaquo;</button>
                      </div>
                    </div>
                    )
                  })}
                  {Array.from({ length: galleryUploading }).map((_, k) => (
                    <div key={`up-${k}`} style={{ ...galleryTile, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>Uploading…</span>
                    </div>
                  ))}
                  {gallery.length + galleryUploading < MAX_GALLERY && (
                    <label className="aa-gadd" style={galleryAddTile}>
                      <span style={{ display: 'inline-flex' }}>{ICONS.camera}</span>
                      <span style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500 }}>Add photos</span>
                      <input type="file" accept="image/*" multiple onChange={handleGalleryAdd} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </>
            ) : (
              <div style={galleryLockCard}>
                <span style={{ display: 'inline-flex', color: 'var(--color-sage)', flexShrink: 0 }}>{ICONS.camera}</span>
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Showcase up to {MAX_GALLERY} photos</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    A photo gallery is part of a paid listing. Upgrade to bring your space to life with a full set of images.
                  </p>
                  <Link href="/dashboard/subscription" style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none' }}>View subscription options →</Link>
                </div>
              </div>
            )}
          </div>

          <EventsSection listingId={id} token={token} isPaid={isPaid} listingSlug={listing.slug} />
          <PicksSection listingId={id} token={token} isPaid={isPaid} listing={listing} />
        </div>
      </div>

      {/* ── Floating save bar ── */}
      {showBar && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 6px 28px rgba(0,0,0,0.16)', fontFamily: 'var(--font-body)' }}>
          {saveError ? (
            <span style={{ fontSize: 13, color: '#c62828' }}>{saveError}</span>
          ) : saving ? (
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Saving…</span>
          ) : justSaved ? (
            <span style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>✓ All changes saved</span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>Unsaved changes</span>
          )}
          {(dirty || saveError) && !saving && (
            <>
              <button onClick={handleDiscard} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Discard</button>
              <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--color-ink)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save changes</button>
            </>
          )}
        </div>
      )}
    </>
  )
}

// Hero overlay control button (shared by Add / Replace / Remove).
const heroBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(28,26,23,0.58)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }

// ── Gallery styles ──
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }
const galleryTile = { position: 'relative', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-cream)' }
const galleryTileBar = { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: 6, background: 'linear-gradient(to top, rgba(28,26,23,0.72), transparent)' }
const gBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(28,26,23,0.55)', color: '#fff', fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }
const galleryIndex = { position: 'absolute', top: 6, left: 6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'rgba(28,26,23,0.62)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const galleryAddTile = { aspectRatio: '4 / 3', borderRadius: 10, border: '1.5px dashed var(--color-border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)', transition: 'all 0.12s ease' }
const galleryLockCard = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }
