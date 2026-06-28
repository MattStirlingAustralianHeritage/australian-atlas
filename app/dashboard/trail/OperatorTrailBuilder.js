'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { getDashboardToken } from '@/lib/dashboard-token'
import { getVerticalBadge } from '@/lib/verticalUrl'

// Map is secondary — a quiet visualisation of the assembled route, loaded lazily.
const TrailStopsMap = dynamic(() => import('@/components/TrailStopsMap'), { ssr: false })

const PLACEHOLDERS = [
  'McClelland Sculpture Park',
  'Flinders Lane Distillery',
  'the bakery on the main street',
  'that little coffee roaster',
]

// ── Small presentational helpers ─────────────────────────────────────────────
function Eyebrow({ children }) {
  return (
    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
      {children}
    </p>
  )
}

function VerticalPill({ vertical, subType }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: 'var(--color-muted)' }}>
      <span style={{ fontWeight: 600 }}>{getVerticalBadge(vertical)}</span>
      {subType ? <span style={{ opacity: 0.7 }}>· {subType}</span> : null}
    </span>
  )
}

export default function OperatorTrailBuilder({ listingId, listingName }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState(false)
  const [region, setRegion] = useState(null) // { id, name } — display label only
  const [center, setCenter] = useState(null) // { lat, lng, radiusKm } — the trail perimeter

  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [stops, setStops] = useState([])
  const [published, setPublished] = useState(false)
  const [listingSlug, setListingSlug] = useState(null)

  // search-to-add
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [searching, setSearching] = useState(false)
  const [openMenu, setOpenMenu] = useState(false)
  const searchRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null) // { kind: 'ok'|'err', text }

  // ── Hydrate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    getDashboardToken().then(async (tok) => {
      if (!alive) return
      setToken(tok)
      if (!tok) { setLoading(false); return }
      try {
        const res = await fetch(`/api/dashboard/trail?listing_id=${encodeURIComponent(listingId)}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        const data = await res.json()
        if (!alive) return
        if (res.ok) {
          setPaid(!!data.paid)
          setRegion(data.listing?.region || null)
          const lt = data.listing?.latitude, ln = data.listing?.longitude
          setCenter(lt != null && ln != null ? { lat: lt, lng: ln, radiusKm: data.listing?.radius_km || 100 } : null)
          setListingSlug(data.listing?.slug || null)
          if (data.trail) {
            setTitle(data.trail.title || '')
            setIntro(data.trail.intro || '')
            setStops((data.trail.stops || []).map(s => ({ ...s })))
            setPublished(!!data.trail.published)
          }
        }
      } catch { /* best-effort */ }
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [listingId])

  // ── Language-led search (debounced, radius-scoped, spelling-tolerant) ────────
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !center) { setCandidates([]); return }
    let alive = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trails/search?q=${encodeURIComponent(q)}&lat=${center.lat}&lng=${center.lng}&radius=${center.radiusKm}&limit=8`)
        const data = await res.json()
        if (!alive) return
        const taken = new Set(stops.map(s => s.listing_id))
        setCandidates((data.results || []).filter(r => !taken.has(r.id)))
        setOpenMenu(true)
      } catch { if (alive) setCandidates([]) }
      if (alive) setSearching(false)
    }, 240)
    return () => { alive = false; clearTimeout(t) }
  }, [query, center, stops])

  // close the menu on outside click
  useEffect(() => {
    function onDoc(e) { if (searchRef.current && !searchRef.current.contains(e.target)) setOpenMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const addStop = useCallback((c) => {
    setStops(prev => prev.some(s => s.listing_id === c.id) ? prev : [...prev, {
      listing_id: c.id, name: c.name, vertical: c.vertical, sub_type: c.sub_type,
      latitude: c.latitude, longitude: c.longitude, image_url: c.image_url, note: '',
    }])
    setQuery(''); setCandidates([]); setOpenMenu(false)
    searchRef.current?.querySelector('input')?.focus()
  }, [])

  const move = (i, dir) => setStops(prev => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = prev.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const remove = (i) => setStops(prev => prev.filter((_, k) => k !== i))
  const setNote = (i, v) => setStops(prev => prev.map((s, k) => k === i ? { ...s, note: v.slice(0, 240) } : s))

  const canSave = title.trim() && stops.length >= 2 && !saving

  async function save(publish) {
    if (!token) { setFlash({ kind: 'err', text: 'Your session expired — please refresh.' }); return }
    if (!title.trim()) { setFlash({ kind: 'err', text: 'Give your trail a title first.' }); return }
    if (stops.length < 2) { setFlash({ kind: 'err', text: 'Add at least two stops first.' }); return }
    setSaving(true); setFlash(null)
    try {
      const res = await fetch('/api/dashboard/trail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          title: title.trim(),
          intro: intro.trim(),
          stops: stops.map(s => ({ listing_id: s.listing_id, note: s.note })),
          publish,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'payment_required') setPaid(false)
        setFlash({ kind: 'err', text: data.error || 'Could not save.' })
      } else {
        setPublished(!!data.published)
        setFlash({ kind: 'ok', text: publish ? 'Published — your trail is now live on your listing.' : 'Draft saved.' })
      }
    } catch {
      setFlash({ kind: 'err', text: 'Could not reach the server.' })
    } finally { setSaving(false) }
  }

  async function unpublish() {
    if (!token) return
    setSaving(true); setFlash(null)
    try {
      const res = await fetch(`/api/dashboard/trail?listing_id=${encodeURIComponent(listingId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { setPublished(false); setFlash({ kind: 'ok', text: 'Unpublished. Your draft is kept — publish again anytime.' }) }
    } finally { setSaving(false) }
  }

  if (loading) {
    return <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>Loading your trail…</p>
  }

  // ── Locked state (unclaimed-paid) ──────────────────────────────────────────
  if (!paid) {
    return (
      <div>
        <Header listingName={listingName} region={region} />
        <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-gold)', borderRadius: 12, padding: '1.75rem 2rem' }}>
          <Eyebrow>A Standard-plan feature</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
            Author a trail visitors will actually follow
          </h2>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
            Suggested trails are part of the Standard plan. Upgrade {listingName} to send visitors on a
            day-trip in your words — a handful of real places near you, in the order you’d send a friend.
          </p>
          <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
            Manage subscription
          </a>
        </div>
      </div>
    )
  }

  if (!center) {
    return (
      <div>
        <Header listingName={listingName} region={region} />
        <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-muted)' }}>
          {listingName} has no map location yet, so we can’t anchor a nearby trail to it. Our team will sort the pin — check back shortly.
        </p>
      </div>
    )
  }

  return (
    <div>
      <Header listingName={listingName} region={region} published={published} listingSlug={listingSlug} />

      {/* ── Title + intro (the operator's voice) ── */}
      <div style={{ marginBottom: '2rem' }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 120))}
          placeholder="Name your trail — “A slow morning in the valley”"
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '2px solid var(--color-border)',
            background: 'transparent', outline: 'none', padding: '0.4rem 0', color: 'var(--color-ink)',
            fontFamily: 'var(--font-serif)', fontSize: '1.6rem', fontWeight: 600,
          }}
          onFocus={e => (e.target.style.borderBottomColor = 'var(--color-accent)')}
          onBlur={e => (e.target.style.borderBottomColor = 'var(--color-border)')}
        />
        <textarea
          value={intro}
          onChange={e => setIntro(e.target.value.slice(0, 700))}
          placeholder="Set the scene in a sentence or two — why this is the day you’d send someone on. (optional)"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: '0.9rem', border: '1px solid var(--color-border)',
            borderRadius: 10, background: '#fff', outline: 'none', padding: '0.75rem 0.9rem', resize: 'vertical',
            color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.6,
          }}
        />
      </div>

      {/* ── Language-led search-to-add ── */}
      <div style={{ marginBottom: '2rem' }}>
        <Eyebrow>Build the route — in plain language</Eyebrow>
        <div ref={searchRef} style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.95rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => candidates.length && setOpenMenu(true)}
              placeholder={`Type a place name — e.g. ${PLACEHOLDERS[0]}`}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.85rem 0.95rem 0.85rem 2.6rem',
                border: '1px solid var(--color-border)', borderRadius: 12, background: '#fff', outline: 'none',
                color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', fontSize: '0.98rem',
              }}
              onFocusCapture={e => (e.target.style.borderColor = 'var(--color-accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.5rem 0 0' }}>
            We match what you type to a real listing within <strong style={{ color: 'var(--color-ink)' }}>{center.radiusKm} km</strong> of {listingName} — across every Atlas — even if the spelling’s off.
          </p>

          {openMenu && query.trim().length >= 2 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, right: 0, zIndex: 30,
              background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12,
              boxShadow: '0 12px 36px rgba(28,26,23,0.14)', overflow: 'hidden',
            }}>
              {searching && candidates.length === 0 && (
                <div style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)' }}>Searching…</div>
              )}
              {!searching && candidates.length === 0 && (
                <div style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  No match within {center.radiusKm} km. Try the venue’s name as it appears on the Atlas.
                </div>
              )}
              {candidates.map(c => (
                <button
                  key={`${c.id}`}
                  onClick={() => addStop(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', textAlign: 'left',
                    padding: '0.7rem 1rem', border: 'none', borderTop: '1px solid var(--color-border)',
                    background: '#fff', cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-cream)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-ink)' }}>{c.name}</span>
                    <VerticalPill vertical={c.vertical} subType={c.sub_type} />
                  </span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>Add +</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Assembled trail — a clean ordered sequence ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <Eyebrow>The trail, in order</Eyebrow>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
            {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
          </span>
        </div>

        {stops.length === 0 ? (
          <div style={{ border: '1px dashed var(--color-border)', borderRadius: 12, padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
            Your trail is empty. Search a place above to add the first stop.
          </div>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
            {stops.map((s, i) => (
              <li key={s.listing_id} style={{ position: 'relative', display: 'flex', gap: '1rem', paddingBottom: i === stops.length - 1 ? 0 : '1rem' }}>
                {/* spine + number */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{
                    flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', background: 'var(--color-gold)',
                    color: '#1C1A17', fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '0.95rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  {i < stops.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--color-border)', marginTop: 4 }} />}
                </div>

                {/* card */}
                <div style={{ flex: 1, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.08rem', fontWeight: 600, color: 'var(--color-ink)' }}>{s.name}</div>
                      <div style={{ marginTop: '0.15rem' }}><VerticalPill vertical={s.vertical} subType={s.sub_type} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flex: '0 0 auto' }}>
                      <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                      <IconBtn label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                      <IconBtn label="Remove" onClick={() => remove(i)}>✕</IconBtn>
                    </div>
                  </div>
                  <input
                    value={s.note}
                    onChange={e => setNote(i, e.target.value)}
                    placeholder="Why stop here? A line in your voice — “order the long black, sit by the window.”"
                    style={{
                      width: '100%', boxSizing: 'border-box', marginTop: '0.7rem', border: 'none',
                      borderTop: '1px solid var(--color-border)', paddingTop: '0.6rem', background: 'transparent',
                      outline: 'none', color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', fontSize: '0.86rem',
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Secondary: the route on a map ── */}
      {stops.length >= 2 && (
        <div style={{ marginBottom: '2rem' }}>
          <Eyebrow>The route</Eyebrow>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <TrailStopsMap
              stops={stops.map(s => ({ venue_lat: s.latitude, venue_lng: s.longitude, venue_name: s.name }))}
              height={260}
              interactive={false}
            />
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      {flash && (
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: '0.88rem', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem',
          background: flash.kind === 'ok' ? '#f0f7f2' : '#fbf0ec',
          border: `1px solid ${flash.kind === 'ok' ? '#bcdcc7' : '#e8c9bd'}`,
          color: flash.kind === 'ok' ? '#2f6f4f' : '#9a3b1f',
        }}>{flash.text}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
        <button
          onClick={() => save(true)}
          disabled={!canSave}
          style={{
            fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
            background: canSave ? 'var(--color-accent)' : 'var(--color-border)', color: canSave ? '#fff' : 'var(--color-muted)',
            border: 'none', borderRadius: 8, padding: '0.7rem 1.4rem',
          }}
        >{published ? 'Update & republish' : 'Publish to your listing'}</button>

        <button
          onClick={() => save(false)}
          disabled={!canSave}
          style={{
            fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
            background: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.7rem 1.2rem',
          }}
        >Save draft</button>

        {published && (
          <button
            onClick={unpublish}
            disabled={saving}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.84rem', cursor: 'pointer', background: 'transparent', color: 'var(--color-muted)', border: 'none', textDecoration: 'underline', marginLeft: 'auto' }}
          >Unpublish</button>
        )}
      </div>
      {!canSave && stops.length < 2 && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.6rem 0 0' }}>
          A trail needs a title and at least two stops before it can be saved.
        </p>
      )}
    </div>
  )
}

function Header({ listingName, region, published, listingSlug }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <Eyebrow>{region?.name ? `Suggested trail · ${region.name}` : 'Suggested trail'}</Eyebrow>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.9rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.4rem', lineHeight: 1.15 }}>
        A day out from {listingName}
      </h1>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: 0 }}>
        One trail, in your words — the places nearby you’d actually send a visitor, in order. It shows on
        your listing across the Atlas. {published && listingSlug ? (
          <a href={`/place/${listingSlug}`} style={{ color: 'var(--color-accent)', fontWeight: 600 }}>View it on your listing →</a>
        ) : null}
      </p>
      {published && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontFamily: 'var(--font-sans)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2f6f4f', background: '#eaf4ee', border: '1px solid #bcdcc7', borderRadius: 999, padding: '0.25rem 0.7rem' }}>
          ● Live on your listing
        </span>
      )}
    </div>
  )
}

function IconBtn({ children, label, disabled, onClick }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: '#fff',
        color: disabled ? 'var(--color-border)' : 'var(--color-muted)', cursor: disabled ? 'default' : 'pointer',
        fontSize: '0.8rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  )
}
