'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/venue',
  collection: 'https://collectionatlas.com.au/venue',
  craft: 'https://craftatlas.com.au/venue',
  fine_grounds: 'https://finegroundsatlas.com.au/roaster',
  rest: 'https://restatlas.com.au/stay',
  field: 'https://fieldatlas.com.au/places',
  corner: 'https://corneratlas.com.au/shop',
  found: 'https://foundatlas.com.au/shop',
  table: 'https://tableatlas.com.au/listing',
}

const SORT_OPTIONS = [
  { value: 'updated_at_desc', label: 'Recently Updated' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'created_at_desc', label: 'Newest' },
  { value: 'created_at_asc', label: 'Oldest' },
]

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

function relativeTime(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 9,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: color || '#fff', background: bg || 'var(--color-muted)',
      padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function StatusBadge({ status }) {
  const colors = {
    active: { color: '#fff', bg: '#4A7C59' },
    inactive: { color: '#fff', bg: '#999' },
    pending: { color: '#fff', bg: '#C49A3C' },
    hidden: { color: '#fff', bg: '#6B2028' },
  }
  const c = colors[status] || colors.inactive
  return <Badge label={status || 'unknown'} color={c.color} bg={c.bg} />
}

// ─── Inline Edit Field ──────────────────────────────────────

function Field({ label, value, onChange, type = 'text', options, toggle, style }) {
  const baseInput = {
    fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
    border: '1px solid var(--color-border)', borderRadius: 6,
    padding: '6px 10px', background: '#fff', outline: 'none',
    width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  if (toggle) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', ...style }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--color-sage)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>{label}</span>
      </label>
    )
  }

  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{
        display: 'block', fontFamily: 'var(--font-body)', fontSize: 10,
        fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-muted)', marginBottom: 4,
      }}>{label}</label>
      {options ? (
        <select value={value || ''} onChange={e => onChange(e.target.value || null)}
          style={{ ...baseInput, cursor: 'pointer' }}>
          <option value="">—</option>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value || null)}
          rows={3} style={{ ...baseInput, resize: 'vertical', lineHeight: 1.5 }} />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : (e.target.value || null))}
          style={baseInput}
          onFocus={e => e.target.style.borderColor = 'var(--color-sage)'}
          onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
      )}
    </div>
  )
}

// ─── State Bounding Boxes (for misplaced detection) ────────

const STATE_BOUNDS = {
  NSW: { minLat: -37.5, maxLat: -28.2, minLng: 141.0, maxLng: 153.6 },
  VIC: { minLat: -39.2, maxLat: -34.0, minLng: 140.9, maxLng: 150.0 },
  QLD: { minLat: -29.2, maxLat: -10.7, minLng: 138.0, maxLng: 153.5 },
  SA:  { minLat: -38.1, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
  WA:  { minLat: -35.2, maxLat: -13.7, minLng: 112.9, maxLng: 129.0 },
  TAS: { minLat: -43.7, maxLat: -39.6, minLng: 143.8, maxLng: 148.4 },
  ACT: { minLat: -35.9, maxLat: -35.1, minLng: 148.7, maxLng: 149.4 },
  NT:  { minLat: -26.0, maxLat: -10.9, minLng: 129.0, maxLng: 138.0 },
}

function isOutsideStateBounds(lat, lng, state) {
  if (!lat || !lng || !state) return false
  const b = STATE_BOUNDS[state]
  if (!b) return false
  return lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng
}

// ─── Geocode Picker ────────────────────────────────────────

function GeocodePicker({ address, region, state, currentLat, currentLng, onSelect }) {
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mapboxToken = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '')
    : ''

  const geocode = async () => {
    const parts = [address, region, state, 'Australia'].filter(Boolean)
    if (parts.length < 2) {
      setError('Add an address or region first')
      return
    }
    setLoading(true)
    setError(null)
    setCandidates(null)
    try {
      const query = parts.join(', ')
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=3&access_token=${mapboxToken}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Geocoding failed')
      const data = await res.json()
      if (!data.features?.length) {
        setError('No results found')
      } else {
        setCandidates(data.features)
      }
    } catch {
      setError('Geocoding request failed')
    } finally {
      setLoading(false)
    }
  }

  const staticMapUrl = (lng, lat) =>
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+c49a3c(${lng},${lat})/${lng},${lat},13,0/200x140@2x?access_token=${mapboxToken}`

  const mismatch = isOutsideStateBounds(currentLat, currentLng, state)

  return (
    <div style={{ gridColumn: '1 / -1', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button onClick={geocode} disabled={loading}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid var(--color-sage)', background: '#fff',
            color: 'var(--color-sage)', cursor: loading ? 'wait' : 'pointer',
            letterSpacing: '0.03em',
          }}>
          {loading ? 'Geocoding...' : '📍 Re-geocode from address'}
        </button>

        {mismatch && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            color: '#c53030', background: '#fef2f2', padding: '4px 10px',
            borderRadius: 6, border: '1px solid #fca5a5',
          }}>
            ⚠ Pin outside {state} bounds
          </span>
        )}

        {currentLat && currentLng && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
            Current: {Number(currentLat).toFixed(4)}, {Number(currentLng).toFixed(4)}
          </span>
        )}
      </div>

      {error && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#c53030', margin: '0 0 8px' }}>
          {error}
        </p>
      )}

      {candidates && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {candidates.map((feature, i) => {
            const [fLng, fLat] = feature.center
            return (
              <div key={feature.id || i} style={{
                flex: '1 1 180px', maxWidth: 220,
                border: '1px solid var(--color-border)', borderRadius: 8,
                overflow: 'hidden', background: '#fff',
              }}>
                {mapboxToken && (
                  <img
                    src={staticMapUrl(fLng, fLat)}
                    alt={`Map for ${feature.place_name}`}
                    style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                )}
                <div style={{ padding: '8px 10px' }}>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-ink)',
                    margin: '0 0 4px', lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {feature.place_name}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-muted)',
                    margin: '0 0 6px', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fLat.toFixed(6)}, {fLng.toFixed(6)}
                  </p>
                  <button onClick={() => {
                    onSelect(fLat, fLng)
                    setCandidates(null)
                  }}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                      padding: '4px 12px', borderRadius: 4,
                      border: 'none', background: 'var(--color-sage)', color: '#fff',
                      cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                    Use this
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Listing Card ───────────────────────────────────────────

function ListingCard({ listing, isExpanded, onToggle, onUpdate, onRemove, regions }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null)
  const [hideConfirm, setHideConfirm] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0) // 0=none, 1=warning, 2=type-name
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const verticalColor = VERTICAL_COLORS[listing.vertical] || '#999'

  useEffect(() => {
    if (isExpanded && !draft) setDraft({ ...listing })
  }, [isExpanded, listing, draft])

  useEffect(() => {
    if (!isExpanded) setDraft(null)
  }, [isExpanded])

  const handleSave = async () => {
    if (!draft || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const d = await res.json()
        console.error('Save failed:', d.error)
        setFlash('error')
        setTimeout(() => setFlash(null), 2000)
        return
      }
      const { listing: updated } = await res.json()
      onUpdate(updated)
      setDraft({ ...updated })
      setFlash('saved')
      setTimeout(() => setFlash(null), 2000)
    } catch (err) {
      console.error('Save error:', err)
      setFlash('error')
      setTimeout(() => setFlash(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleHide = async () => {
    setHiding(true)
    try {
      const newStatus = listing.status === 'hidden' ? 'active' : 'hidden'
      const res = await fetch(`/api/admin/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setFlash('error')
        setTimeout(() => setFlash(null), 2000)
        return
      }
      const { listing: updated } = await res.json()
      onUpdate(updated)
      if (draft) setDraft({ ...updated })
      setHideConfirm(false)
      setFlash(newStatus === 'hidden' ? 'hidden' : 'unhidden')
      setTimeout(() => setFlash(null), 2500)
    } catch {
      setFlash('error')
      setTimeout(() => setFlash(null), 2000)
    } finally {
      setHiding(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setFlash('error')
        setTimeout(() => setFlash(null), 2000)
        return
      }
      onRemove(listing.id)
    } catch {
      setFlash('error')
      setTimeout(() => setFlash(null), 2000)
    } finally {
      setDeleting(false)
    }
  }

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }))
  const viewUrl = listing.slug ? `${VERTICAL_URLS[listing.vertical] || ''}/${listing.slug}` : null

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderLeftWidth: 4, borderLeftColor: verticalColor,
      borderRadius: 12, background: '#fff', overflow: 'hidden',
      marginBottom: 12, transition: 'box-shadow 0.2s',
      boxShadow: isExpanded ? '0 2px 12px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      {/* Card header */}
      <div style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <Badge label={VERTICAL_NAMES[listing.vertical] || listing.vertical} bg={verticalColor} />
              <StatusBadge status={listing.status} />
              {listing.is_claimed && <Badge label="Claimed" bg="#5A8A9A" />}
              {listing.is_featured && <Badge label="Featured" bg="#C49A3C" />}
              {listing.editors_pick && <Badge label="Editor's Pick" bg="#7A6B8A" />}
              {listing.region && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  {listing.region}{listing.state ? `, ${listing.state}` : ''}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 4 }}>
              {listing.name}
            </div>
            {listing.description && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{listing.description}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              {listing.website && (
                <a href={listing.website} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-sage)', textDecoration: 'none' }}>
                  {listing.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 40)}
                </a>
              )}
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', opacity: 0.5 }}>
                Updated {relativeTime(listing.updated_at)}
              </span>
            </div>
          </div>
          <div style={{
            flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, background: isExpanded ? 'var(--color-sage)' : 'var(--color-cream)',
            transition: 'all 0.15s',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              <path d="M2 4L6 8L10 4" stroke={isExpanded ? '#fff' : 'var(--color-muted)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Edit accordion */}
      {isExpanded && draft && (
        <div style={{
          borderTop: '1px solid var(--color-border)', padding: '20px 20px 16px',
          background: '#FAFAF6',
        }}>
          {flash && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
              background: flash === 'error' ? '#fef2f2' : '#e8f5e9',
              color: flash === 'error' ? '#c62828' : '#2e7d32',
              border: `1px solid ${flash === 'error' ? '#ffcdd2' : '#c8e6c9'}`,
            }}>
              {flash === 'saved' && 'Changes saved.'}
              {flash === 'hidden' && 'Listing hidden from public view.'}
              {flash === 'unhidden' && 'Listing restored to public view.'}
              {flash === 'error' && 'Action failed \u2014 please try again.'}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Name" value={draft.name} onChange={v => updateDraft('name', v)} style={{ gridColumn: '1 / -1' }} />
            <Field label="Description" value={draft.description} onChange={v => updateDraft('description', v)} type="textarea" style={{ gridColumn: '1 / -1' }} />
            <Field label="Website" value={draft.website} onChange={v => updateDraft('website', v)} />
            <Field label="Phone" value={draft.phone} onChange={v => updateDraft('phone', v)} />
            <Field label="Region" value={draft.region} onChange={v => updateDraft('region', v)} options={regions} />
            <Field label="State" value={draft.state} onChange={v => updateDraft('state', v)} options={STATES} />
            <Field label="Address" value={draft.address} onChange={v => updateDraft('address', v)} style={{ gridColumn: '1 / -1' }} />
            <Field label="Latitude" value={draft.lat} onChange={v => updateDraft('lat', v)} type="number" />
            <Field label="Longitude" value={draft.lng} onChange={v => updateDraft('lng', v)} type="number" />
            <GeocodePicker
              address={draft.address}
              region={draft.region}
              state={draft.state}
              currentLat={draft.lat}
              currentLng={draft.lng}
              onSelect={(lat, lng) => { updateDraft('lat', lat); updateDraft('lng', lng) }}
            />
            <Field label="Vertical" value={draft.vertical} onChange={v => updateDraft('vertical', v)}
              options={Object.entries(VERTICAL_NAMES).map(([k, v]) => ({ value: k, label: v }))} />
            <Field label="Status" value={draft.status} onChange={v => updateDraft('status', v)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'pending', label: 'Pending' }, { value: 'hidden', label: 'Hidden' }]} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, marginBottom: 16 }}>
            <Field toggle label="Claimed" value={draft.is_claimed} onChange={v => updateDraft('is_claimed', v)} />
            <Field toggle label="Featured" value={draft.is_featured} onChange={v => updateDraft('is_featured', v)} />
            <Field toggle label="Editor's Pick" value={draft.editors_pick} onChange={v => updateDraft('editors_pick', v)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <button onClick={handleSave} disabled={saving}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '8px 20px', borderRadius: 6, border: 'none',
                background: 'var(--color-sage)', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={onToggle}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                padding: '8px 16px', borderRadius: 6,
                border: '1px solid var(--color-border)', background: '#fff',
                color: 'var(--color-muted)', cursor: 'pointer',
              }}>
              Cancel
            </button>

            {/* Hide / Unhide */}
            {!hideConfirm ? (
              <button onClick={() => {
                if (listing.status === 'hidden') { handleHide() } else { setHideConfirm(true) }
              }}
                disabled={hiding}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  padding: '6px 14px', borderRadius: 6,
                  border: '1px solid var(--color-sage)', background: '#fff',
                  color: 'var(--color-sage)', cursor: hiding ? 'wait' : 'pointer',
                  letterSpacing: '0.03em',
                }}>
                {hiding ? (listing.status === 'hidden' ? 'Unhiding...' : 'Hiding...') :
                  listing.status === 'hidden' ? 'Unhide listing' : 'Hide listing'}
              </button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                background: '#fef9ee', border: '1px solid #ecd5a0', borderRadius: 6,
              }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#8B6914' }}>
                  Hide this listing? It will be removed from public view but not deleted.
                </span>
                <button onClick={handleHide} disabled={hiding}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                    padding: '4px 10px', borderRadius: 4, border: 'none',
                    background: '#C49A3C', color: '#fff', cursor: hiding ? 'wait' : 'pointer',
                    letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                  {hiding ? 'Hiding...' : 'Confirm'}
                </button>
                <button onClick={() => setHideConfirm(false)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                    padding: '4px 8px', borderRadius: 4,
                    border: '1px solid var(--color-border)', background: '#fff',
                    color: 'var(--color-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  Cancel
                </button>
              </div>
            )}

            {viewUrl && (
              <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: 'var(--color-sage)', textDecoration: 'none', marginLeft: 'auto',
                }}>
                View listing ↗
              </a>
            )}
          </div>

          {/* Delete — separate row, visually distinct */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10 }}>
            {deleteStep === 0 && (
              <button onClick={() => setDeleteStep(1)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
                  color: '#c53030', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, textDecoration: 'underline',
                  textDecorationColor: 'rgba(197,48,48,0.3)',
                }}>
                Delete listing permanently
              </button>
            )}

            {deleteStep === 1 && (
              <div style={{
                padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 6,
              }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, color: '#991b1b',
                  margin: '0 0 8px', lineHeight: 1.5,
                }}>
                  This will permanently delete <strong>{listing.name}</strong> from the Atlas Network. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setDeleteStep(2)}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                      padding: '5px 12px', borderRadius: 4, border: 'none',
                      background: '#c53030', color: '#fff', cursor: 'pointer',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                    Continue
                  </button>
                  <button onClick={() => { setDeleteStep(0); setDeleteInput('') }}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                      padding: '5px 10px', borderRadius: 4,
                      border: '1px solid var(--color-border)', background: '#fff',
                      color: 'var(--color-muted)', cursor: 'pointer',
                    }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div style={{
                padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 6,
              }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, color: '#991b1b',
                  margin: '0 0 8px', lineHeight: 1.5,
                }}>
                  Type <strong>{listing.name}</strong> to confirm deletion:
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                    placeholder={listing.name}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)',
                      border: '1px solid #fca5a5', borderRadius: 4,
                      padding: '5px 10px', background: '#fff', outline: 'none',
                      flex: 1, maxWidth: 300,
                    }}
                  />
                  <button onClick={handleDelete}
                    disabled={deleteInput !== listing.name || deleting}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                      padding: '5px 12px', borderRadius: 4, border: 'none',
                      background: deleteInput === listing.name ? '#c53030' : '#e5a0a0',
                      color: '#fff',
                      cursor: deleteInput === listing.name && !deleting ? 'pointer' : 'not-allowed',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      opacity: deleteInput === listing.name ? 1 : 0.5,
                    }}>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button onClick={() => { setDeleteStep(0); setDeleteInput('') }}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                      padding: '5px 10px', borderRadius: 4,
                      border: '1px solid var(--color-border)', background: '#fff',
                      color: 'var(--color-muted)', cursor: 'pointer',
                    }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export default function ListingEditor({ initialListings = [], initialTotal = 0, regions = [] }) {
  const [listings, setListings] = useState(initialListings)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [filters, setFilters] = useState({ vertical: '', region: '', status: '', search: '', sort: 'updated_at_desc' })
  const searchRef = useRef(null)
  const debounceRef = useRef(null)
  const limit = 25

  const fetchListings = useCallback(async (newFilters, newPage) => {
    const f = newFilters || filters
    const p = newPage ?? page
    setLoading(true)
    setExpandedId(null)
    try {
      const params = new URLSearchParams()
      if (f.vertical) params.set('vertical', f.vertical)
      if (f.region) params.set('region', f.region)
      if (f.status) params.set('status', f.status)
      if (f.search) params.set('search', f.search)
      params.set('sort', f.sort)
      params.set('page', String(p))
      params.set('limit', String(limit))

      const res = await fetch(`/api/admin/listings?${params}`)
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setListings(data.listings)
      setTotal(data.total)
    } catch (err) {
      console.error('Fetch listings error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    setPage(0)
    if (key === 'search') {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => fetchListings(next, 0), 300)
    } else {
      fetchListings(next, 0)
    }
  }

  const changePage = (newPage) => {
    setPage(newPage)
    fetchListings(filters, newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleUpdate = (updated) => {
    setListings(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
  }

  const handleRemove = (deletedId) => {
    setListings(prev => prev.filter(l => l.id !== deletedId))
    setTotal(prev => prev - 1)
    setExpandedId(null)
  }

  const hasFilters = filters.vertical || filters.region || filters.status || filters.search || filters.sort !== 'updated_at_desc'
  const totalPages = Math.ceil(total / limit)
  const showFrom = page * limit + 1
  const showTo = Math.min((page + 1) * limit, total)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px',
        background: 'var(--color-cream)', borderRadius: 8, marginBottom: 20,
        alignItems: 'center',
      }}>
        <select value={filters.vertical} onChange={e => updateFilter('vertical', e.target.value)}
          style={selectStyle}>
          <option value="">All verticals</option>
          {Object.entries(VERTICAL_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={filters.region} onChange={e => updateFilter('region', e.target.value)}
          style={selectStyle}>
          <option value="">All regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={filters.status} onChange={e => updateFilter('status', e.target.value)}
          style={selectStyle}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
          <option value="hidden">Hidden</option>
          <option value="claimed">Claimed</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="misplaced">📍 Potentially misplaced</option>
        </select>

        <select value={filters.sort} onChange={e => updateFilter('sort', e.target.value)}
          style={selectStyle}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <input ref={searchRef} type="text" placeholder="Search name, description..."
          value={filters.search} onChange={e => updateFilter('search', e.target.value)}
          style={{
            ...selectStyle, flex: '1 1 160px', minWidth: 160,
          }} />

        {hasFilters && (
          <button onClick={() => {
            const reset = { vertical: '', region: '', status: '', search: '', sort: 'updated_at_desc' }
            setFilters(reset)
            setPage(0)
            fetchListings(reset, 0)
          }}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-sage)',
              background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}>
            Clear
          </button>
        )}
      </div>

      {/* Results summary */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 12, fontFamily: 'var(--font-body)', fontSize: 13,
      }}>
        <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>
          {loading ? 'Loading...' : total > 0 ? `Showing ${showFrom}–${showTo} of ${total.toLocaleString()} listings` : 'No listings found'}
        </span>
      </div>

      {/* Cards */}
      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {listings.map(listing => (
          <ListingCard key={listing.id} listing={listing}
            isExpanded={expandedId === listing.id}
            onToggle={() => setExpandedId(expandedId === listing.id ? null : listing.id)}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            regions={regions} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '20px 0', fontFamily: 'var(--font-body)', fontSize: 13,
        }}>
          <button onClick={() => changePage(page - 1)} disabled={page === 0}
            style={pageBtnStyle(page === 0)}>← Prev</button>
          <span style={{ color: 'var(--color-muted)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => changePage(page + 1)} disabled={page >= totalPages - 1}
            style={pageBtnStyle(page >= totalPages - 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

const selectStyle = {
  fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)',
  border: '1px solid var(--color-border)', borderRadius: 6,
  padding: '6px 10px', background: '#fff', outline: 'none',
  cursor: 'pointer',
}

function pageBtnStyle(disabled) {
  return {
    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
    padding: '6px 14px', borderRadius: 6,
    border: '1px solid var(--color-border)', background: disabled ? 'var(--color-cream)' : '#fff',
    color: disabled ? 'var(--color-muted)' : 'var(--color-ink)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
}
