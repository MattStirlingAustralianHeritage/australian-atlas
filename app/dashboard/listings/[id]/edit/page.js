'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getDashboardToken } from '@/lib/dashboard-token'

/**
 * In-Atlas listing editor — operator self-service for a claimed listing.
 *
 * Replaces the old "bounce to the external vertical /vendor/edit portal" flow:
 * website, phone, hours and hero image are all edited here and saved through
 * the portal's own authenticated API (PATCH /api/dashboard/listing), which
 * writes master AND syncs back to the source vertical so the edit survives the
 * next inbound sync. Reached from both Overview and My Listings.
 */

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

function defaultDays() {
  const out = {}
  for (const d of DAY_KEYS) out[d] = { enabled: false, open: '09:00', close: '17:00' }
  return out
}

export default function EditListingPage() {
  const { id } = useParams()

  const [token, setToken] = useState(null)
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [days, setDays] = useState(defaultDays)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    getDashboardToken().then(t => {
      if (!active) return
      if (!t) { setToken(null); setLoading(false); return }
      setToken(t)
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
              setListing(l)
              setWebsite(l.website || '')
              setPhone(l.phone || '')
              setHeroImageUrl(l.hero_image_url || '')
              if (l.hours && typeof l.hours === 'object') {
                setDays(prev => {
                  const next = { ...prev }
                  for (const d of DAY_KEYS) {
                    const v = l.hours[d]
                    if (v && v.open && v.close) next[d] = { enabled: true, open: v.open, close: v.close }
                  }
                  return next
                })
              }
            }
          }
          setLoading(false)
        })
        .catch(() => { if (active) { setError('Failed to load listing'); setLoading(false) } })
    })
    return () => { active = false }
  }, [id])

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    setSaved(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
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
    }
  }

  function setDay(day, patch) {
    setDays(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const hoursPayload = {}
    for (const d of DAY_KEYS) {
      const day = days[d]
      if (day.enabled && day.open && day.close) hoursPayload[d] = { open: day.open, close: day.close }
    }

    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: id,
          website: website.trim() || null,
          phone: phone.trim() || null,
          hours: Object.keys(hoursPayload).length ? hoursPayload : null,
          hero_image_url: heroImageUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Failed to save changes')
      else { setSaved(true); if (data.listing) setListing(data.listing) }
    } catch {
      setError('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // ── styles ──
  const title = { fontFamily: 'var(--font-serif, Georgia)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2 }
  const subhead = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)', margin: '8px 0 0', lineHeight: 1.5 }
  const backLink = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, color: 'var(--color-muted, #888)', textDecoration: 'none' }
  const badge = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 100, background: 'var(--color-cream, #FAF8F5)', color: 'var(--color-sage, #5f8a7e)', border: '1px solid var(--color-border, #e5e5e5)', whiteSpace: 'nowrap' }
  const card = { background: '#fff', borderRadius: 12, border: '1px solid var(--color-border, #e5e5e5)', padding: '1.5rem', marginBottom: '1rem' }
  const sectionTitle = { fontFamily: 'var(--font-serif, Georgia)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-ink, #2D2A26)', margin: '0 0 1rem' }
  const label = { display: 'block', fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink, #2D2A26)', marginBottom: 6 }
  const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, color: 'var(--color-ink, #2D2A26)', background: '#fff', boxSizing: 'border-box' }
  const hint = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 12, color: 'var(--color-muted, #888)', margin: '4px 0 0' }
  const dayName = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, color: 'var(--color-ink, #2D2A26)' }
  const timeInput = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border, #e5e5e5)', fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, color: 'var(--color-ink, #2D2A26)', background: '#fff' }
  const uploadBtn = { display: 'inline-block', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff', fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, fontWeight: 500, color: 'var(--color-ink, #2D2A26)', cursor: uploading ? 'default' : 'pointer' }
  const removeBtn = { display: 'inline-block', marginTop: 8, padding: 0, border: 'none', background: 'none', fontFamily: 'var(--font-sans, system-ui)', fontSize: 12, color: '#dc2626', cursor: 'pointer' }
  const saveBtn = { display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: 'var(--color-ink, #2D2A26)', color: '#fff', border: 'none', fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }
  const cancelLink = { fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, color: 'var(--color-muted, #888)', textDecoration: 'none' }
  const errorBox = { padding: '12px 16px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, marginBottom: 12 }
  const successBox = { padding: '12px 16px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontFamily: 'var(--font-sans, system-ui)', fontSize: 14, marginBottom: 12 }

  if (loading) {
    return <p style={{ fontFamily: 'var(--font-sans, system-ui)', color: 'var(--color-muted, #888)' }}>Loading…</p>
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 520 }}>
        <h1 style={title}>Sign in required</h1>
        <p style={subhead}>You need to be signed in to edit a listing.</p>
        <Link href="/login" style={{ ...saveBtn, marginTop: 16 }}>Sign in</Link>
      </div>
    )
  }

  if (error && !listing) {
    return (
      <div style={{ maxWidth: 520 }}>
        <Link href="/dashboard/listings" style={backLink}>← Back to my listings</Link>
        <div style={{ ...errorBox, marginTop: 16 }}>{error}</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/dashboard/listings" style={backLink}>← Back to my listings</Link>

      <div style={{ margin: '0.75rem 0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <h1 style={title}>{listing.name}</h1>
          <span style={badge}>{VERTICAL_LABELS[listing.vertical] || listing.vertical}</span>
        </div>
        <p style={subhead}>Update your listing details. Changes appear across the Atlas network.</p>
      </div>

      <form onSubmit={handleSave}>
        {/* Contact */}
        <div style={card}>
          <h2 style={sectionTitle}>Contact</h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={label} htmlFor="website">Website</label>
            <input id="website" type="text" inputMode="url" placeholder="https://example.com.au"
              value={website} onChange={e => { setWebsite(e.target.value); setSaved(false) }} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="phone">Phone</label>
            <input id="phone" type="tel" placeholder="(02) 1234 5678"
              value={phone} onChange={e => { setPhone(e.target.value); setSaved(false) }} style={input} />
          </div>
        </div>

        {/* Hero image */}
        <div style={card}>
          <h2 style={sectionTitle}>Hero image</h2>
          {heroImageUrl ? (
            <div style={{ marginBottom: 12 }}>
              <img src={heroImageUrl} alt="Hero preview" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--color-border, #e5e5e5)' }} />
              <button type="button" onClick={() => { setHeroImageUrl(''); setSaved(false) }} style={removeBtn}>Remove image</button>
            </div>
          ) : (
            <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>No image yet. Upload a photo to help your listing stand out.</p>
          )}
          <label style={uploadBtn}>
            {uploading ? 'Uploading…' : (heroImageUrl ? 'Replace image' : 'Upload image')}
            <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} style={{ display: 'none' }} />
          </label>
          {uploadError && <p style={{ ...hint, color: '#dc2626' }}>{uploadError}</p>}
          <p style={hint}>JPG, PNG, WebP, GIF or AVIF. Max 8MB.</p>
        </div>

        {/* Opening hours */}
        <div style={card}>
          <h2 style={sectionTitle}>Opening hours</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DAY_KEYS.map(day => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 34 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 130, cursor: 'pointer' }}>
                  <input type="checkbox" checked={days[day].enabled} onChange={e => setDay(day, { enabled: e.target.checked })} />
                  <span style={dayName}>{DAY_LABELS[day]}</span>
                </label>
                {days[day].enabled ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="time" value={days[day].open} onChange={e => setDay(day, { open: e.target.value })} style={timeInput} />
                    <span style={{ ...hint, margin: 0 }}>to</span>
                    <input type="time" value={days[day].close} onChange={e => setDay(day, { close: e.target.value })} style={timeInput} />
                  </div>
                ) : (
                  <span style={{ ...hint, margin: 0 }}>Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}
        {saved && <div style={successBox}>Changes saved.</div>}

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: '0.5rem' }}>
          <button type="submit" disabled={saving || uploading} style={{ ...saveBtn, opacity: (saving || uploading) ? 0.6 : 1, cursor: (saving || uploading) ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link href="/dashboard/listings" style={cancelLink}>Cancel</Link>
        </div>
      </form>
    </div>
  )
}
