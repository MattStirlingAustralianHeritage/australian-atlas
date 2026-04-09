'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import WYSIWYGEditor from '@/components/admin/WYSIWYGEditor'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
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

const MILESTONES = [100, 500, 1000, 2500, 5000]

// ─── Badge ──────────────────────────────────────────────────

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
    hidden: { color: '#fff', bg: '#c53030' },
  }
  const c = colors[status] || colors.inactive
  return <Badge label={status || 'unknown'} color={c.color} bg={c.bg} />
}

// ─── Inline Edit Field (from ListingEditor pattern) ─────────

function Field({ label, value, onChange, type = 'text', toggle, style }) {
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
      {type === 'textarea' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value || null)}
          rows={4} style={{ ...baseInput, resize: 'vertical', lineHeight: 1.5 }} />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : (e.target.value || null))}
          style={baseInput}
          onFocus={e => e.target.style.borderColor = 'var(--color-sage)'}
          onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
      )}
    </div>
  )
}

// ─── Milestone Banner ───────────────────────────────────────

function MilestoneBanner({ count }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--color-ink, #2D2A26)', color: '#fff',
      fontFamily: 'var(--font-display, Georgia)', fontSize: 16, fontWeight: 400,
      padding: '12px 28px', borderRadius: 8, zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      animation: 'listingsReviewFade 3s ease-in-out forwards',
      letterSpacing: '0.02em',
    }}>
      <span style={{ marginRight: 8, color: 'var(--color-sage, #7A8B6F)' }}>&#10022;</span>
      {count.toLocaleString()} reviewed
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export default function ListingsReview({ initialListing, initialStats, verticalCounts = {}, selectedVertical = 'all' }) {
  const [listing, setListing] = useState(initialListing)
  const [stats, setStats] = useState(initialStats)
  const [draft, setDraft] = useState(initialListing ? { ...initialListing } : null)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState(null) // 'saved' | 'saved_synced' | 'saved_sync_failed' | 'skipped' | 'hidden' | 'error'
  const [syncDetail, setSyncDetail] = useState(null) // vertical name for display
  const [errorMsg, setErrorMsg] = useState(null) // actual error text for 'error' flash
  const [milestone, setMilestone] = useState(null)

  // Session tracking
  const excludedRef = useRef(new Set(initialListing ? [initialListing.id] : []))
  const recentVerticalsRef = useRef(initialListing?.vertical ? [initialListing.vertical] : [])
  const [sessionHumanised, setSessionHumanised] = useState(0)
  const [sessionSkipped, setSessionSkipped] = useState(0)

  // When listing changes, reset draft
  useEffect(() => {
    if (listing) {
      setDraft({ ...listing })
    } else {
      setDraft(null)
    }
  }, [listing])

  // Check for milestone
  const checkMilestone = useCallback((newCount) => {
    if (MILESTONES.includes(newCount)) {
      setMilestone(newCount)
      setTimeout(() => setMilestone(null), 3500)
    }
  }, [])

  // Perform action
  const handleAction = useCallback(async (action) => {
    if (!listing || loading) return
    setLoading(true)
    setFlash(null)

    try {
      const body = {
        id: listing.id,
        action,
        exclude: Array.from(excludedRef.current),
        recent_verticals: recentVerticalsRef.current.slice(-10),
      }

      if (action === 'humanise' && draft) {
        // Collect only changed fields
        const updates = {}
        const editableFields = ['name', 'description', 'website', 'address', 'phone', 'lat', 'lng', 'is_claimed', 'is_featured', 'editors_pick', 'hero_image_url']
        for (const key of editableFields) {
          if (draft[key] !== listing[key]) {
            updates[key] = draft[key]
          }
        }
        body.updates = updates
      }

      const res = await fetch('/api/admin/listings-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, vertical_filter: selectedVertical !== 'all' ? selectedVertical : null }),
      })

      if (!res.ok) {
        const d = await res.json()
        console.error('Listings Review action failed:', d.error)
        setErrorMsg(d.error || 'Unknown error')
        setFlash('error')
        setTimeout(() => { setFlash(null); setErrorMsg(null) }, 4000)
        setLoading(false)
        return
      }

      const data = await res.json()

      // Update stats — also push to AdminNavBar via custom event
      if (data.stats) {
        setStats(data.stats)
        const nextHumanised = action === 'humanise' ? sessionHumanised + 1 : sessionHumanised
        const nextSkipped = action === 'skip' ? sessionSkipped + 1 : sessionSkipped
        window.dispatchEvent(new CustomEvent('admin-stats-update', {
          detail: { stats: data.stats, session: { reviewed: nextHumanised, skipped: nextSkipped } },
        }))
      }

      // Track action
      if (action === 'humanise') {
        setSessionHumanised(prev => prev + 1)
        if (data.sync_status?.synced) {
          setFlash('saved_synced')
          setSyncDetail(data.sync_status.verticalName)
        } else if (data.sync_status && !data.sync_status.synced) {
          setFlash('saved_sync_failed')
          setSyncDetail(data.sync_status.verticalName)
        } else {
          setFlash('saved')
          setSyncDetail(null)
        }
        checkMilestone(data.stats?.humanised_count)
      } else if (action === 'skip') {
        setSessionSkipped(prev => prev + 1)
        setFlash('skipped')
      } else if (action === 'hide') {
        setFlash('hidden')
      }

      // Transition to next listing
      if (data.next_listing) {
        excludedRef.current.add(data.next_listing.id)
        if (data.next_listing.vertical) {
          recentVerticalsRef.current.push(data.next_listing.vertical)
          // Keep only last 10 to avoid unbounded growth
          if (recentVerticalsRef.current.length > 10) {
            recentVerticalsRef.current = recentVerticalsRef.current.slice(-10)
          }
        }
        setListing(data.next_listing)
      } else {
        setListing(null)
      }

      const syncFailed = action === 'humanise' && data.sync_status && !data.sync_status.synced
      setTimeout(() => setFlash(null), syncFailed ? 3000 : 1500)
    } catch (err) {
      console.error('Listings Review error:', err)
      setErrorMsg(err.message || 'Network error')
      setFlash('error')
      setTimeout(() => { setFlash(null); setErrorMsg(null) }, 4000)
    } finally {
      setLoading(false)
    }
  }, [listing, draft, loading, checkMilestone, sessionHumanised, sessionSkipped])

  const updateDraft = (field, value) => setDraft(prev => prev ? { ...prev, [field]: value } : null)

  const verticalColor = listing ? (VERTICAL_COLORS[listing.vertical] || '#999') : '#999'
  const viewUrl = listing?.slug ? `${VERTICAL_URLS[listing.vertical] || ''}/${listing.slug}` : null

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative' }}>

      {/* Injected keyframes for milestone animation */}
      <style>{`
        @keyframes listingsReviewFade {
          0% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          12% { opacity: 1; transform: translateX(-50%) translateY(0); }
          80% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
        @keyframes listingsReviewPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Milestone banner */}
      {milestone && <MilestoneBanner count={milestone} />}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
          fontSize: 28, color: 'var(--color-ink, #2D2A26)',
          margin: '0 0 4px',
        }}>
          Listings Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 300,
          fontSize: 14, color: 'var(--color-muted, #888)', margin: 0,
        }}>
          Every listing deserves a human eye.
        </p>
      </div>

      {/* Vertical toggle */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24,
        justifyContent: 'center',
      }}>
        <a href="/admin/listings-review"
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            padding: '5px 14px', borderRadius: 100, textDecoration: 'none',
            letterSpacing: '0.04em',
            background: selectedVertical === 'all' ? 'var(--color-ink, #2D2A26)' : '#fff',
            color: selectedVertical === 'all' ? '#fff' : 'var(--color-muted)',
            border: `1px solid ${selectedVertical === 'all' ? 'var(--color-ink)' : 'var(--color-border)'}`,
            transition: 'all 0.15s',
          }}>
          All {Object.values(verticalCounts).reduce((a, b) => a + b, 0) > 0
            ? `(${Object.values(verticalCounts).reduce((a, b) => a + b, 0)})`
            : ''}
        </a>
        {Object.entries(VERTICAL_NAMES).map(([key, label]) => {
          const count = verticalCounts[key] || 0
          const isActive = selectedVertical === key
          const color = VERTICAL_COLORS[key] || '#999'
          return (
            <a key={key} href={`/admin/listings-review?vertical=${key}`}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                padding: '5px 14px', borderRadius: 100, textDecoration: 'none',
                letterSpacing: '0.04em',
                background: isActive ? color : '#fff',
                color: isActive ? '#fff' : color,
                border: `1px solid ${isActive ? color : 'var(--color-border)'}`,
                opacity: count === 0 && !isActive ? 0.5 : 1,
                transition: 'all 0.15s',
              }}>
              {label} {count > 0 ? `(${count})` : ''}
            </a>
          )
        })}
      </div>

      {/* Stats pushed to AdminNavBar via custom event */}

      {/* Flash message */}
      {flash && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 16,
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, textAlign: 'center',
          background: flash === 'saved_synced' || flash === 'saved' ? '#e8f5e9' : flash === 'saved_sync_failed' ? '#fff8e1' : flash === 'error' ? '#fef2f2' : flash === 'hidden' ? '#fef2f2' : '#f5f5f5',
          color: flash === 'saved_synced' || flash === 'saved' ? '#2e7d32' : flash === 'saved_sync_failed' ? '#e65100' : flash === 'error' ? '#c62828' : flash === 'hidden' ? '#c62828' : 'var(--color-muted)',
          border: `1px solid ${flash === 'saved_synced' || flash === 'saved' ? '#c8e6c9' : flash === 'saved_sync_failed' ? '#ffe0b2' : flash === 'error' ? '#ffcdd2' : flash === 'hidden' ? '#ffcdd2' : 'var(--color-border)'}`,
          transition: 'opacity 0.3s',
        }}>
          {flash === 'saved_synced' && `Approved + synced to ${syncDetail}. Next listing loaded.`}
          {flash === 'saved_sync_failed' && `Approved, but sync to ${syncDetail} failed. Next listing loaded.`}
          {flash === 'saved' && 'Approved. Next listing loaded.'}
          {flash === 'skipped' && 'Skipped. Loading next...'}
          {flash === 'hidden' && 'Listing hidden. Loading next...'}
          {flash === 'error' && (errorMsg ? `Error: ${errorMsg}` : 'Something went wrong. Try again.')}
        </div>
      )}

      {/* No listing state */}
      {!listing && !loading && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: '#fff', borderRadius: 12,
          border: '1px solid var(--color-border, #e5e5e5)',
        }}>
          <p style={{
            fontFamily: 'var(--font-display, Georgia)', fontSize: 20,
            color: 'var(--color-ink)', marginBottom: 8,
          }}>
            All caught up.
          </p>
          <p style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
            color: 'var(--color-muted)', margin: 0,
          }}>
            Every active listing in this session has been reviewed. Refresh to start a new session.
          </p>
        </div>
      )}

      {/* Listing card */}
      {listing && draft && (
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid var(--color-border, #e5e5e5)',
          borderLeftWidth: 4, borderLeftColor: verticalColor,
          overflow: 'hidden',
          opacity: loading ? 0.5 : 1,
          transition: 'opacity 0.2s',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          {/* Card header */}
          <div style={{ padding: '20px 24px 16px' }}>
            {/* Badges row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <Badge label={VERTICAL_NAMES[listing.vertical] || listing.vertical} bg={verticalColor} />
              <StatusBadge status={listing.status} />
              {listing.region && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11,
                  color: 'var(--color-muted)',
                }}>
                  {listing.region}{listing.state ? `, ${listing.state}` : ''}
                </span>
              )}
              {listing.humanised && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-sage, #7A8B6F)', background: '#f0f4ee',
                  padding: '2px 8px', borderRadius: 100,
                }}>
                  Previously reviewed
                </span>
              )}
            </div>

            {/* Name */}
            <div style={{
              fontFamily: 'var(--font-display, Georgia)', fontSize: 22,
              fontWeight: 400, color: 'var(--color-ink, #2D2A26)',
              marginBottom: 4,
            }}>
              {listing.name}
            </div>

            {/* View links */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {listing.slug && (
                <a href={`/place/${listing.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: '#fff', background: 'var(--color-sage, #7A8B6F)',
                    padding: '5px 14px', borderRadius: 4, textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                  View Listing &#8599;
                </a>
              )}
              {viewUrl && (
                <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-sage, #7A8B6F)',
                    padding: '5px 14px', borderRadius: 4, textDecoration: 'none',
                    border: '1px solid var(--color-sage, #7A8B6F)',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                  View on Vertical &#8599;
                </a>
              )}
            </div>
          </div>

          {/* Hero image thumbnail */}
          {listing.hero_image_url && (
            <div style={{ padding: '0 24px 12px' }}>
              <img
                src={listing.hero_image_url}
                alt={listing.name}
                style={{
                  width: '100%', maxHeight: 200, objectFit: 'cover',
                  borderRadius: 8, display: 'block',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>
          )}

          {/* Edit form */}
          <div style={{
            borderTop: '1px solid var(--color-border)', padding: '20px 24px 16px',
            background: '#FAFAF6',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div style={{ gridColumn: '1 / -1', marginBottom: 12 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-body)', fontSize: 10,
                  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-muted)', marginBottom: 4,
                }}>Description</label>
                <WYSIWYGEditor
                  value={draft.description}
                  onChange={v => updateDraft('description', v)}
                  minHeight={180}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-body)', fontSize: 10,
                  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--color-muted)', marginBottom: 4,
                }}>Website</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={draft.website ?? ''}
                    onChange={e => updateDraft('website', e.target.value || null)}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
                      border: '1px solid var(--color-border)', borderRadius: 6,
                      padding: '6px 10px', background: '#fff', outline: 'none',
                      flex: 1, boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-sage)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                  {draft.website && (
                    <a href={draft.website.startsWith('http') ? draft.website : `https://${draft.website}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                        padding: '6px 12px', borderRadius: 6,
                        border: '1px solid var(--color-border)', background: '#fff',
                        color: 'var(--color-sage)', textDecoration: 'none',
                        whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
                      }}>
                      Visit &#8599;
                    </a>
                  )}
                </div>
              </div>
              <Field
                label="Phone"
                value={draft.phone}
                onChange={v => updateDraft('phone', v)}
              />
              <Field
                label="Address"
                value={draft.address}
                onChange={v => updateDraft('address', v)}
                style={{ gridColumn: '1 / -1' }}
              />
              <Field
                label="Latitude"
                value={draft.lat}
                onChange={v => updateDraft('lat', v)}
                type="number"
              />
              <Field
                label="Longitude"
                value={draft.lng}
                onChange={v => updateDraft('lng', v)}
                type="number"
              />
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4, marginBottom: 16 }}>
              <Field toggle label="Claimed" value={draft.is_claimed} onChange={v => updateDraft('is_claimed', v)} />
              <Field toggle label="Featured" value={draft.is_featured} onChange={v => updateDraft('is_featured', v)} />
              <Field toggle label="Editor's Pick" value={draft.editors_pick} onChange={v => updateDraft('editors_pick', v)} />
            </div>

            {/* Helper note */}
            <p style={{
              fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
              color: 'var(--color-muted, #888)', margin: '0 0 20px',
              lineHeight: 1.5, fontStyle: 'italic',
            }}>
              No edits needed? That's fine — just hit Approve to confirm you've reviewed it.
            </p>

            {/* Action buttons */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 12, borderTop: '1px solid var(--color-border)',
              paddingTop: 16,
            }}>
              {/* Approve button */}
              <button
                onClick={() => handleAction('humanise')}
                disabled={loading}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.03em',
                  padding: '10px 28px', borderRadius: 8, border: 'none',
                  background: 'var(--color-sage, #7A8B6F)', color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'opacity 0.15s, transform 0.1s',
                }}
              >
                &#10003; Approve
              </button>

              {/* Skip button */}
              <button
                onClick={() => handleAction('skip')}
                disabled={loading}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  padding: '10px 24px', borderRadius: 8,
                  border: '1px solid var(--color-border, #e5e5e5)',
                  background: '#fff', color: 'var(--color-ink, #2D2A26)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                &#8594; Skip
              </button>
            </div>

            {/* Hide link */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                onClick={() => handleAction('hide')}
                disabled={loading}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
                  color: '#c53030', background: 'none', border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textDecoration: 'underline', opacity: loading ? 0.5 : 0.7,
                  padding: '4px 8px',
                }}
              >
                &#10005; Hide this listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back link handled by AdminNavBar in layout */}
    </div>
  )
}
