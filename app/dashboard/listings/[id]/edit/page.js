'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getDashboardToken } from '@/lib/dashboard-token'
import { uploadOperatorImage } from '@/lib/uploadOperatorImage'
import { getListingRegion } from '@/lib/regions'
import { getVerticalLabel, getVerticalBrandColour } from '@/lib/verticalUrl'
import { parseVideoUrl, VIDEO_PROVIDER_LABELS } from '@/lib/video-embed'
import { getCompleteness } from '@/lib/listing-completeness'
import { PanelGroup, PanelGroupHeading, Panel, LockedNote, PanelActions } from './EditorPanel'
import HighlightsEditor from './HighlightsEditor'
import KeywordsEditor from './KeywordsEditor'
import TradeReadinessEditor from './TradeReadinessEditor'
import EventsSection from './EventsSection'
import OffersSection from './OffersSection'
import AwardsSection from './AwardsSection'
import QnaSection from './QnaSection'
import PicksSection from './PicksSection'

/**
 * Operator listing editor.
 *
 * Shape of the page: a live preview of the listing's hero at the top, a
 * "what's left to do" strip, then the editable surface as a set of collapsed
 * panels (see EditorPanel.js). Only one panel is open at a time, so the
 * operator is never looking at more than one decision.
 *
 * This replaced a single endless page that rendered all thirteen sections
 * expanded at once. The panels are grouped into "The essentials" — the four
 * things that actually make a listing usable, all editable on a free claim —
 * and "Make it richer", which is everything optional.
 *
 * Tiering ("keeper of the facts"): a FREE claim keeps the facts editable —
 * website, phone and opening hours only. Photos, video, highlights, keywords,
 * events and picks show their locked presentation until the claim is Standard
 * (the PATCH route enforces the same field set server-side). Paid claims and
 * admins get everything.
 *
 * Saves through PATCH /api/dashboard/listing (master write + vertical
 * sync-back) — unchanged from before. Panels that own their own endpoint
 * (events, offers, awards, Q&A, picks, highlights, keywords) still save
 * themselves; the floating bar covers only the fields this page owns.
 *
 * Trade readiness stays here because this is the only surface for the full
 * Atlas Trade profile — notice period, coach access, languages, dietary and
 * capacity notes, trade contact. /dashboard/trade covers only the boolean
 * switches. It is now gated on canEdit: it used to render fully editable to
 * everyone, so a free-claim operator could fill the entire form and only
 * discover on save that the PATCH 403'd it.
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
/** "Mon–Fri 9am–5pm, Sat 10am–2pm" — the collapsed panel's hours line. */
function hoursSummary(hours) {
  if (!hours) return null
  const open = groupHours(hours).filter(g => !g.closed)
  if (!open.length) return null
  const shown = open.slice(0, 2).map(g => `${groupLabel(g)} ${formatTime(g.open)}–${formatTime(g.close)}`)
  return shown.join(', ') + (open.length > 2 ? '…' : '')
}

// ── Icons ────────────────────────────────────────────────────
const ICONS = {
  globe: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 014 9 15 15 0 01-4 9 15 15 0 01-4-9 15 15 0 014-9z" /></svg>,
  phone: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  clock: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>,
  camera: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  external: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>,
  check: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
}

// ── Shared field primitives ──────────────────────────────────
const fieldLabel = { display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--color-ink)', marginBottom: 6 }
const fieldHint = { fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '5px 0 0', lineHeight: 1.5 }
const textInput = { width: '100%', padding: '11px 13px', borderRadius: 9, border: '1px solid var(--color-border)', background: '#fff', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', outline: 'none', boxSizing: 'border-box' }
const timeInput = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', background: '#fff' }
const errBox = { marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-body)', fontSize: 13 }

/** Labelled text field — the one input pattern the whole editor uses. */
function Field({ icon, label, hint, children }) {
  return (
    <div>
      <label style={fieldLabel}>
        {icon && <span style={{ color: 'var(--color-accent)', display: 'inline-flex' }}>{ICONS[icon]}</span>}
        {label}
      </label>
      {children}
      {hint && <p style={fieldHint}>{hint}</p>}
    </div>
  )
}

// ── Opening-hours editor ─────────────────────────────────────
function HoursEditor({ days, setDay }) {
  // "Same every day" is how most venues actually work; copying Monday down is
  // far quicker than setting seven pairs of times by hand.
  function copyMondayDown() {
    const src = days.monday
    for (const d of DAY_KEYS) {
      if (d !== 'monday') setDay(d, { enabled: src.enabled, open: src.open, close: src.close })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {DAY_KEYS.map(day => (
          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 118, cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={days[day].enabled}
                onChange={e => setDay(day, { enabled: e.target.checked })}
                style={{ accentColor: 'var(--color-sage)', width: 15, height: 15 }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-ink)' }}>{DAY_FULL[day]}</span>
            </label>
            {days[day].enabled ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input type="time" value={days[day].open} onChange={e => setDay(day, { open: e.target.value })} style={timeInput} />
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>to</span>
                <input type="time" value={days[day].close} onChange={e => setDay(day, { close: e.target.value })} style={timeInput} />
              </div>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>Closed</span>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={copyMondayDown}
        style={{ marginTop: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)' }}
      >
        Apply Monday’s hours to every day
      </button>
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

  // Paid-tier gate: the FULL editor is unlocked by an active standard claim
  // (listing.paid) or for admins.
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState(null)
  const [justUpgraded, setJustUpgraded] = useState(false)

  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [gallery, setGallery] = useState([])
  const [videoUrl, setVideoUrl] = useState('')
  const [days, setDays] = useState(defaultDays)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [imageNotice, setImageNotice] = useState(null) // { tone, text } from moderation
  const [galleryStatus, setGalleryStatus] = useState({}) // url -> { status, reason } for per-photo badges
  const [galleryUploading, setGalleryUploading] = useState(0)
  const [galleryError, setGalleryError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [pollNonce, setPollNonce] = useState(0)

  // Which panel is expanded. Lifted out of PanelGroup so the "what's left"
  // chips can open the panel that fixes a given gap and scroll to it.
  const [openPanel, setOpenPanel] = useState('basics')

  function openAndScroll(panelId) {
    setOpenPanel(panelId)
    requestAnimationFrame(() => {
      document.getElementById(`panel-${panelId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const baselineRef = useRef({ website: '', phone: '', heroImageUrl: '', hoursKey: 'null', galleryKey: '[]', videoUrl: '' })

  const setBaseline = useCallback((w, p, h, d, g, v) => {
    baselineRef.current = { website: w, phone: p, heroImageUrl: h, hoursKey: JSON.stringify(daysToHours(d)), galleryKey: JSON.stringify(g || []), videoUrl: v || '' }
  }, [])

  // Deep link from the Overview's "what's left" chips (#panel-cover, …) —
  // open that panel instead of the default one.
  const pendingScrollRef = useRef(null)
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith('#panel-')) return
    const target = hash.slice('#panel-'.length)
    setOpenPanel(target)
    // Native hash scrolling can't work here: #panel-cover doesn't exist in the
    // DOM until the listing fetch resolves. Hold the target and scroll to it
    // once the panels have actually rendered.
    pendingScrollRef.current = target
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
              const v = l.video_url || ''
              setListing(l)
              setWebsite(w)
              setPhone(p)
              setHeroImageUrl(h)
              setGallery(g)
              setVideoUrl(v)
              if (Array.isArray(l.gallery_moderation)) {
                setGalleryStatus(Object.fromEntries(l.gallery_moderation.map(s => [s.url, { status: s.status, reason: s.reason }])))
              }
              setDays(d)
              setBaseline(w, p, h, d, g, v)
            }
          }
          setLoading(false)
        })
        .catch(() => { if (active) { setError('Failed to load listing'); setLoading(false) } })
    })
    return () => { active = false }
  }, [id, setBaseline])

  // The panels only exist once the listing has loaded, so a deep link's scroll
  // waits for that. Fires once — the ref is cleared immediately.
  //
  // The delay is load-bearing: the App Router restores scroll position after
  // hydration, which lands *after* a bare requestAnimationFrame and puts the
  // page straight back at the top. Scrolling once that has settled sticks.
  useEffect(() => {
    if (loading || !listing || !pendingScrollRef.current) return
    const target = pendingScrollRef.current
    pendingScrollRef.current = null
    const t = setTimeout(() => {
      document.getElementById(`panel-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 180)
    return () => clearTimeout(t)
  }, [loading, listing])

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

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const url = await uploadOperatorImage(file, { token, listingId: id, assetKind: 'hero' })
      setHeroImageUrl(url)
    } catch (err) {
      setUploadError(err?.message || 'Upload failed')
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
    const remaining = MAX_GALLERY - gallery.length
    if (remaining <= 0) { setGalleryError(`You can add up to ${MAX_GALLERY} photos.`); return }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) {
      setGalleryError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added — extra files were skipped.`)
    }
    setGalleryUploading(n => n + toUpload.length)
    for (const file of toUpload) {
      try {
        const url = await uploadOperatorImage(file, { token, listingId: id, assetKind: 'gallery' })
        setGallery(prev => (prev.length < MAX_GALLERY && !prev.includes(url) ? [...prev, url] : prev))
      } catch (err) {
        setGalleryError(err?.message || 'Some photos failed to upload')
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
    setVideoUrl(b.videoUrl)
    setDays(hoursToDays(JSON.parse(b.hoursKey)))
    setSaveError(null)
    setGalleryError(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setImageNotice(null)
    try {
      // Free tier is "keeper of the facts": send ONLY website/phone/hours. The
      // PATCH route 403s any other key on a free claim, so including the (locked,
      // unchanged) hero/gallery would fail the whole save.
      const payload = {
        listing_id: id,
        website: website.trim() || null,
        phone: phone.trim() || null,
        hours: daysToHours(days),
      }
      if (listing?.paid || isAdmin) {
        payload.hero_image_url = heroImageUrl || null
        payload.gallery_image_urls = gallery
        payload.video_url = videoUrl.trim() || null
      }
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save changes')
      } else {
        if (data.listing) {
          const w = data.listing.website || '', p = data.listing.phone || '', h = data.listing.hero_image_url || ''
          const d = hoursToDays(data.listing.hours)
          const g = Array.isArray(data.listing.gallery_image_urls) ? data.listing.gallery_image_urls : gallery
          // video_url rides the fresh listing only when it was part of the save
          // (the PATCH overlays savedVideo); otherwise keep the local value.
          const v = data.listing.video_url !== undefined ? (data.listing.video_url || '') : videoUrl
          setListing(prev => ({ ...prev, ...data.listing }))
          setWebsite(w); setPhone(p); setHeroImageUrl(h); setGallery(g); setVideoUrl(v); setDays(d)
          setBaseline(w, p, h, d, g, v)
        } else {
          setBaseline(website, phone, heroImageUrl, days, gallery, videoUrl)
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
    return (
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div className="aa-skeleton" style={{ height: 200, borderRadius: 14, marginBottom: 16 }} />
        <div className="aa-skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 10 }} />
        <div className="aa-skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 10 }} />
        <div className="aa-skeleton" style={{ height: 64, borderRadius: 14 }} />
      </div>
    )
  }
  if (!token) {
    return (
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>Sign in required</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: '8px 0 16px' }}>You need to be signed in to edit a listing.</p>
        <Link href="/login" className="btn btn-primary">Sign in</Link>
      </div>
    )
  }
  if (error && !listing) {
    return (
      <div style={{ maxWidth: 520 }}>
        <Link href="/dashboard/listings" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textDecoration: 'none' }}>← Back to my listings</Link>
        <div style={{ marginTop: 16, ...errBox, marginBottom: 0 }}>{error}</div>
      </div>
    )
  }

  // ── Derived values ──
  const vertColor = getVerticalBrandColour(listing.vertical) || 'var(--color-sage)'
  const categoryLabel = VERTICAL_CATEGORY_LABELS[listing.vertical] || 'Place'
  const region = getListingRegion(listing)
  const location = [region?.name, listing.state].filter(Boolean).join(', ')

  const isPaid = !!listing.paid
  // A free claim keeps the FACTS editable — website, phone and opening hours
  // (the PATCH route enforces the same field set server-side). canEditAll
  // unlocks everything else.
  const canEditAll = isPaid || isAdmin

  const hours = daysToHours(days)

  const basicsDirty = website !== baselineRef.current.website || phone !== baselineRef.current.phone || JSON.stringify(hours) !== baselineRef.current.hoursKey
  const coverDirty = heroImageUrl !== baselineRef.current.heroImageUrl
  const galleryDirty = JSON.stringify(gallery) !== baselineRef.current.galleryKey
  const videoDirty = videoUrl !== baselineRef.current.videoUrl
  const dirty = basicsDirty || coverDirty || galleryDirty || videoDirty

  const showBar = dirty || saving || justSaved || saveError

  // Live-parsed video link (null while empty or not yet a recognisable
  // YouTube / TikTok / Instagram video) — drives the inline preview + notice.
  const videoParsed = parseVideoUrl(videoUrl)

  // ── "What's left" strip ──
  // Scored from the shared definition the Overview card also uses, so the two
  // surfaces can't disagree — but against the LIVE form values, so the meter
  // moves as the operator types rather than only after a save.
  const completeness = getCompleteness(listing, {
    website, phone, hours, hero_image_url: heroImageUrl,
  })

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <style>{`
        .aa-hero-btn { transition: background 0.12s ease; }
        .aa-hero-btn:hover { background: rgba(28,26,23,0.82) !important; }
        .aa-gtile .aa-gtile-bar { opacity: 0; transition: opacity 0.12s ease; }
        .aa-gtile:hover .aa-gtile-bar, .aa-gtile:focus-within .aa-gtile-bar { opacity: 1; }
        .aa-gadd:hover { border-color: var(--color-sage) !important; color: var(--color-sage) !important; background: rgba(95,138,126,0.06) !important; }
        .aa-todo:hover { border-color: var(--color-sage) !important; color: var(--color-ink) !important; }
        .aa-input:focus { border-color: var(--color-sage) !important; box-shadow: 0 0 0 3px rgba(95,138,126,0.14); }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/dashboard/listings" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textDecoration: 'none' }}>← Back to my listings</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: dirty ? 'var(--color-gold)' : 'var(--color-sage)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dirty ? 'var(--color-gold)' : 'var(--color-sage)' }} />
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All saved'}
          </span>
          {listing.slug && (
            <a href={`/place/${listing.slug}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', textDecoration: 'none' }}>
              View public page {ICONS.external}
            </a>
          )}
        </div>
      </div>

      {/* ── Hero preview — how the listing reads to a visitor right now ── */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 190, background: heroImageUrl ? '#1C1A17' : 'linear-gradient(135deg, #2b2823, #3c352c)', marginBottom: 16 }}>
        {heroImageUrl && (
          <img src={heroImageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,26,23,0.78) 0%, rgba(28,26,23,0.2) 55%, transparent 85%)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 22px' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)', margin: '0 0 7px' }}>
            {getVerticalLabel(listing.vertical)} &middot; {categoryLabel}
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.4rem, 3.4vw, 2rem)', lineHeight: 1.15, color: '#fff', margin: 0 }}>
            {listing.name}
          </h1>
          {location && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'rgba(255,255,255,0.74)', margin: '5px 0 0' }}>{location}</p>
          )}
        </div>
      </div>

      {/* ── Free-tier upgrade banner ── */}
      {!canEditAll && (
        <div style={{ marginBottom: 16, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
          {justUpgraded ? (
            pollTimedOut ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Payment confirmed — still finalising</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.55 }}>
                    Stripe has your payment, but our system is taking longer than usual to unlock the
                    full editor. This resolves itself within a few minutes — you won’t be charged twice.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPollTimedOut(false); setPollNonce(n => n + 1) }}>Check again</button>
                  <a className="btn btn-secondary btn-sm" href="mailto:listings@australianatlas.com.au?subject=Upgrade%20not%20unlocking">Email support</a>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-sage)', animation: 'aa-spin 0.8s linear infinite' }} />
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>Payment received — finalising your upgrade</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.55 }}>
                    This usually takes a few seconds — your full editor will unlock automatically. If it doesn’t, refresh this page in a moment.
                  </p>
                </div>
                <style>{`@keyframes aa-spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 250 }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>
                    <span style={{ display: 'inline-flex', color: 'var(--color-sage)' }}>{ICONS.check}</span>
                    Your facts are free to keep current
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.55 }}>
                    Website, phone and opening hours, any time. Standard adds your photos, story, events and insights.
                  </p>
                </div>
                <button type="button" onClick={handleUpgrade} disabled={upgrading} className="btn btn-primary btn-sm">
                  {upgrading ? 'Starting checkout…' : 'Upgrade — $295/yr'}
                </button>
              </div>
              {upgradeError && <div style={{ ...errBox, marginTop: 12, marginBottom: 0 }}>{upgradeError}</div>}
            </>
          )}
        </div>
      )}

      {/* ── What's left to do ── */}
      <div style={{ marginBottom: 20, padding: '15px 18px', borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: completeness.allComplete ? 0 : 12 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
            <div style={{ width: `${(completeness.complete / completeness.total) * 100}%`, height: '100%', background: 'var(--color-sage)', borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', flexShrink: 0 }}>
            {completeness.complete} of {completeness.total}
          </span>
        </div>
        {!completeness.allComplete ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {completeness.remaining.map(t => (
              <button
                key={t.field}
                type="button"
                onClick={() => openAndScroll(t.panel)}
                title={t.hint}
                className="aa-todo"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  minHeight: 0, borderRadius: 100, border: '1px dashed var(--color-border)',
                  background: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)',
                  transition: 'all 0.14s ease',
                }}
              >
                {t.action}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-sage)', margin: 0, fontWeight: 600 }}>
            Your listing has everything visitors look for.
          </p>
        )}
      </div>

      {uploadError && <div style={errBox}>{uploadError}</div>}
      {imageNotice && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13,
          background: imageNotice.tone === 'error' ? '#fef2f2' : '#fffbeb',
          border: `1px solid ${imageNotice.tone === 'error' ? '#fecaca' : '#fde68a'}`,
          color: imageNotice.tone === 'error' ? '#991b1b' : '#92400e',
        }}>{imageNotice.text}</div>
      )}

      {/* ── The editable surface ── */}
      <PanelGroup open={openPanel} onOpenChange={setOpenPanel}>
        <PanelGroupHeading title="The essentials" note="The three things visitors ask for most. Free to keep current, always." />

        <Panel
          id="basics"
          title="Contact & hours"
          status={website.trim() && phone.trim() && hours ? 'done' : 'empty'}
          dirty={basicsDirty}
          summary={hoursSummary(hours) || (website.trim() || phone.trim() ? 'No opening hours yet' : 'Nothing added yet')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Field icon="globe" label="Website" hint="Where visitors can find you. Include the full address, e.g. yourvenue.com.au">
              <input
                className="aa-input"
                type="url"
                inputMode="url"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="yourvenue.com.au"
                style={textInput}
              />
            </Field>

            <Field icon="phone" label="Phone" hint="Shown on your public page so visitors can call ahead.">
              <input
                className="aa-input"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(03) 9000 0000"
                style={textInput}
              />
            </Field>

            <div>
              <label style={fieldLabel}>
                <span style={{ color: 'var(--color-accent)', display: 'inline-flex' }}>{ICONS.clock}</span>
                Opening hours
              </label>
              <HoursEditor days={days} setDay={setDay} />
            </div>

            {listing.address && (
              <div>
                <p style={{ ...fieldLabel, marginBottom: 4 }}>Address</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', margin: 0 }}>{listing.address}</p>
                <p style={fieldHint}>
                  Address and location are managed by the Atlas.{' '}
                  <a href="mailto:listings@australianatlas.com.au?subject=Address%20correction" style={{ color: 'var(--color-sage)', fontWeight: 600 }}>Tell us if it’s wrong</a>.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel
          id="cover"
          title="Cover photo"
          status={!canEditAll ? 'locked' : heroImageUrl ? 'done' : 'empty'}
          dirty={coverDirty}
          summary={!canEditAll ? 'Included with Standard' : heroImageUrl ? 'Cover photo set' : 'The first thing visitors see'}
        >
          {canEditAll ? (
            <div>
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', height: 200, background: heroImageUrl ? '#1C1A17' : 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
                {heroImageUrl ? (
                  <img src={heroImageUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)' }}>
                    <span style={{ display: 'inline-flex' }}>{ICONS.camera}</span>
                    <span style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 13 }}>No cover photo yet</span>
                  </div>
                )}
              </div>
              <PanelActions note="Landscape photos work best. Wide shots of your space beat close-ups of product.">
                <label className="btn btn-primary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                  {uploading ? 'Uploading…' : heroImageUrl ? 'Replace photo' : 'Choose a photo'}
                  <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} style={{ display: 'none' }} />
                </label>
                {heroImageUrl && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHeroImageUrl('')}>Remove</button>
                )}
              </PanelActions>
            </div>
          ) : (
            <LockedNote>A cover photo is the single biggest difference between a listing people scroll past and one they click. It’s included with Standard.</LockedNote>
          )}
        </Panel>

        <Panel
          id="story"
          title="Your description"
          status={listing.description ? 'done' : 'empty'}
          summary={listing.description ? `${listing.description.trim().split(/\s+/).length} words` : 'Not written yet'}
        >
          {listing.description ? (
            <>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.75, color: 'var(--color-ink)' }}>
                {listing.description.split('\n').map((p, i) => (p.trim() ? <p key={i} style={{ margin: i > 0 ? '1em 0 0' : 0 }}>{p}</p> : null))}
              </div>
              <PanelActions>
                <Link href="/dashboard/description" className="btn btn-secondary btn-sm">Edit your description</Link>
              </PanelActions>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0, lineHeight: 1.65 }}>
                Your description is the paragraph visitors read before deciding to come. We’ll ask you a
                few questions about your place and write a first draft you can edit.
              </p>
              <PanelActions>
                <Link href="/dashboard/description" className="btn btn-primary btn-sm">Write your description</Link>
              </PanelActions>
            </>
          )}
        </Panel>

        <PanelGroupHeading title="Make it richer" note="Optional. Add these whenever you have a moment — nothing here is required." />

        <Panel
          id="gallery"
          title="Photo gallery"
          status={!isPaid ? 'locked' : gallery.length ? 'done' : 'empty'}
          meta={isPaid ? `${gallery.length} / ${MAX_GALLERY}` : null}
          dirty={galleryDirty}
          summary={!isPaid ? 'Included with Standard' : gallery.length ? `${gallery.length} photo${gallery.length === 1 ? '' : 's'}` : 'No photos yet'}
        >
          {isPaid ? (
            <>
              {galleryError && <div style={errBox}>{galleryError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {gallery.map((url, i) => {
                  const gst = galleryStatus[url]?.status
                  const blocked = gst === 'flagged' || gst === 'held'
                  return (
                    <div key={url} className="aa-gtile" style={galleryTile}>
                      <img src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: blocked ? 0.5 : 1 }} />
                      {blocked && (
                        <span title={galleryStatus[url]?.reason || ''} style={{
                          position: 'absolute', top: 8, left: 8, zIndex: 2,
                          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
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
              <p style={{ ...fieldHint, marginTop: 12 }}>Hover a photo to reorder or remove it. The first photo leads the gallery.</p>
            </>
          ) : (
            <LockedNote>Show your space from more than one angle — up to {MAX_GALLERY} photos on your public listing. Included with Standard.</LockedNote>
          )}
        </Panel>

        <Panel
          id="video"
          title="Video"
          status={!canEditAll ? 'locked' : videoUrl.trim() ? 'done' : 'empty'}
          dirty={videoDirty}
          summary={!canEditAll ? 'Included with Standard' : videoParsed ? `${VIDEO_PROVIDER_LABELS[videoParsed.provider]} video` : videoUrl.trim() ? 'Link not recognised' : 'No video yet'}
        >
          {canEditAll ? (
            <>
              <Field label="Video link" hint="Paste the link to a YouTube, TikTok or Instagram video and it plays right on your page.">
                <input
                  className="aa-input"
                  type="url"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  style={textInput}
                />
              </Field>
              {videoParsed ? (
                <div style={{ marginTop: 14 }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', margin: '0 0 10px' }}>
                    <span style={{ display: 'inline-flex' }}>{ICONS.check}</span>
                    {VIDEO_PROVIDER_LABELS[videoParsed.provider]} video — this is how it will appear
                  </p>
                  <div style={videoParsed.provider === 'youtube'
                    ? { position: 'relative', width: '100%', maxWidth: 480, aspectRatio: '16 / 9' }
                    : { width: videoParsed.provider === 'tiktok' ? 325 : 400, maxWidth: '100%', height: videoParsed.provider === 'tiktok' ? 578 : 480 }}
                  >
                    <iframe
                      key={videoParsed.embedUrl}
                      src={videoParsed.embedUrl}
                      title="Video preview"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={{ width: '100%', height: '100%', border: '1px solid var(--color-border)', borderRadius: 10, background: '#000', display: 'block' }}
                    />
                  </div>
                  <PanelActions>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVideoUrl('')}>Remove video</button>
                  </PanelActions>
                </div>
              ) : videoUrl.trim() ? (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#92400e', margin: '10px 0 0' }}>
                  That doesn’t look like a YouTube, TikTok or Instagram video link yet — paste the video’s own page URL.
                </p>
              ) : null}
            </>
          ) : (
            <LockedNote>Feature one video on your public page — a walkthrough, a making-of, whatever shows your place in motion. Included with Standard.</LockedNote>
          )}
        </Panel>

        {/* Sections that own their own endpoint and save button. Each renders
            its own Panel so its summary/counter reflects its live state. */}
        <HighlightsEditor
          listingId={id}
          vertical={listing.vertical}
          subType={listing.sub_type || (Array.isArray(listing.sub_types) && listing.sub_types[0]) || null}
          token={token}
          initialHighlights={listing.operator_highlights}
          accent={vertColor}
          canEdit={canEditAll}
        />
        <KeywordsEditor
          listingId={id}
          token={token}
          initialKeywords={listing.search_keywords}
          accent={vertColor}
          canEdit={canEditAll}
        />
        <EventsSection listingId={id} token={token} isPaid={isPaid} listingSlug={listing.slug} />
        <OffersSection listingId={id} token={token} isPaid={isPaid} />
        <AwardsSection listingId={id} token={token} isPaid={isPaid} />
        <QnaSection listingId={id} token={token} isPaid={isPaid} />
        <PicksSection listingId={id} token={token} isPaid={isPaid} listing={listing} />
        {/* Trade readiness owns the full Atlas Trade profile (notice period,
            coach access, languages, trade contact) — /dashboard/trade only
            covers the boolean switches, so this stays the home for the rest. */}
        <TradeReadinessEditor
          listingId={id}
          token={token}
          initial={listing}
          accent={vertColor}
          canEdit={canEditAll}
        />
      </PanelGroup>

      <p style={{ margin: '22px 0 0', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        Want to see how the trade sees your venue?{' '}
        <Link href="/dashboard/trade" style={{ color: 'var(--color-sage)', fontWeight: 600, textDecoration: 'none' }}>Open Travel Trade →</Link>
      </p>

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
              <button onClick={handleDiscard} className="btn btn-secondary btn-sm">Discard</button>
              <button onClick={handleSave} className="btn btn-primary btn-sm">Save changes</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gallery styles ──
const galleryTile = { position: 'relative', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-cream)' }
const galleryTileBar = { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: 6, background: 'linear-gradient(to top, rgba(28,26,23,0.72), transparent)' }
const gBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, minHeight: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(28,26,23,0.55)', color: '#fff', fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }
const galleryIndex = { position: 'absolute', top: 6, left: 6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'rgba(28,26,23,0.62)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const galleryAddTile = { aspectRatio: '4 / 3', borderRadius: 10, border: '1.5px dashed var(--color-border)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)', transition: 'all 0.12s ease' }
