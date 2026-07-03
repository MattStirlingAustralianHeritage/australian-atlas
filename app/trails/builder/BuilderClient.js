'use client'

import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { getVerticalBadge, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import AuthModal from '@/components/AuthModal'
import GettingThereCard from '@/components/GettingThereCard'
import BuilderMap from './BuilderMap'
import StopsPanel from './StopsPanel'
import SuggestRail from './SuggestRail'

const VERTICAL_COLORS = VERTICAL_ACCENTS

const VERTICAL_FILTERS = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'sba', label: 'Small Batch' },
  { key: 'collection', label: 'Culture' },
  { key: 'craft', label: 'Craft' },
  { key: 'fine_grounds', label: 'Fine Grounds' },
  { key: 'rest', label: 'Rest' },
  { key: 'field', label: 'Field' },
  { key: 'corner', label: 'Corner' },
  { key: 'found', label: 'Found' },
  { key: 'table', label: 'Table' },
]

const DRAFT_KEY = 'aa_trail_draft_v2'
const MAX_STOPS = 25 // Mapbox Directions waypoint ceiling

// ── Draft persistence ────────────────────────────────────────────────────
function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || !Array.isArray(d.stops)) return null
    return d
  } catch { return null }
}

function writeDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

// ── Route fetching ───────────────────────────────────────────────────────
// One Directions call covers the whole sequence: full geometry for the map
// plus per-leg distance/duration for the list. Falls back to straight lines
// and haversine estimates if the API is unavailable.
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = d => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function fetchRoute(stops, mode) {
  const pts = stops.filter(s => s.latitude && s.longitude)
  if (pts.length < 2) return { geometry: null, legs: [], totalKm: 0, totalMin: 0, approx: false }

  const fallback = () => {
    const legs = []
    const coords = []
    for (let i = 0; i < pts.length; i++) {
      coords.push([parseFloat(pts[i].longitude), parseFloat(pts[i].latitude)])
      if (i > 0) {
        const km = haversineKm(
          parseFloat(pts[i - 1].latitude), parseFloat(pts[i - 1].longitude),
          parseFloat(pts[i].latitude), parseFloat(pts[i].longitude)
        ) * 1.25 // straight-line → rough road factor
        legs.push({ km: Math.round(km * 10) / 10, min: Math.round((km / (mode === 'drive' ? 70 : 4.5)) * 60) })
      }
    }
    return {
      geometry: { type: 'LineString', coordinates: coords },
      legs,
      totalKm: Math.round(legs.reduce((s, l) => s + l.km, 0)),
      totalMin: Math.round(legs.reduce((s, l) => s + l.min, 0)),
      approx: true,
    }
  }

  try {
    const profile = mode === 'drive' ? 'driving' : 'walking'
    const coordStr = pts.map(s => `${s.longitude},${s.latitude}`).join(';')
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordStr}?geometries=geojson&overview=full&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return fallback()
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route?.geometry) return fallback()
    const legs = (route.legs || []).map(l => ({
      km: Math.round((l.distance / 1000) * 10) / 10,
      min: Math.round(l.duration / 60),
    }))
    return {
      geometry: route.geometry,
      legs,
      totalKm: Math.round(route.distance / 1000),
      totalMin: Math.round(route.duration / 60),
      approx: false,
    }
  } catch {
    return fallback()
  }
}

// Nearest-neighbour reorder, anchored on the current first stop. Not optimal
// TSP, but turns a zig-zag into a sane order in one click.
function nearestNeighbourOrder(stops) {
  if (stops.length < 3) return stops
  const remaining = stops.slice(1)
  const ordered = [stops[0]]
  while (remaining.length) {
    const last = ordered[ordered.length - 1]
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(
        parseFloat(last.latitude), parseFloat(last.longitude),
        parseFloat(remaining[i].latitude), parseFloat(remaining[i].longitude)
      )
      if (d < bestD) { bestD = d; bestI = i }
    }
    ordered.push(remaining.splice(bestI, 1)[0])
  }
  return ordered
}

function normaliseStop(v) {
  return {
    id: v.id,
    name: v.name,
    vertical: v.vertical,
    sub_type: v.sub_type || null,
    region: v.region || null,
    state: v.state || null,
    latitude: v.latitude ?? v.lat ?? null,
    longitude: v.longitude ?? v.lng ?? null,
    slug: v.slug || v.listing_slug || null,
    image_url: v.image_url || v.hero_image_url || null,
  }
}

function TrailBuilderInner() {
  const t = useTranslations('trailsBuilder')
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const isEmbed = searchParams.get('embed') === '1'
  const regionParam = searchParams.get('region')

  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  // Trail meta
  const [trailName, setTrailName] = useState('')
  const [trailDesc, setTrailDesc] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [transportMode, setTransportMode] = useState('drive')
  const [neighbourhoodLabel, setNeighbourhoodLabel] = useState('')

  // Stops
  const [stops, setStops] = useState([])
  const [stopNotes, setStopNotes] = useState({})
  const [lastRemoved, setLastRemoved] = useState(null) // { stop, index, note }

  // Search
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeVertical, setActiveVertical] = useState('all')

  // Map data
  const [allListings, setAllListings] = useState([])
  const [route, setRoute] = useState({ geometry: null, legs: [], totalKm: 0, totalMin: 0, approx: false })

  // Recommendations
  const [recGroups, setRecGroups] = useState([])
  const [recLoading, setRecLoading] = useState(false)
  const [highlightId, setHighlightId] = useState(null)

  // Templates (editorial starting points)
  const [templates, setTemplates] = useState([])
  const [templateLoading, setTemplateLoading] = useState(null) // slug being loaded

  // Save / edit lifecycle
  const [editingTrail, setEditingTrail] = useState(null) // loaded trail when ?id=
  const [editLoadError, setEditLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedTrail, setSavedTrail] = useState(null) // { id, slug, short_code, title, copied }
  const [draftRestored, setDraftRestored] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  const [mobileTab, setMobileTab] = useState('builder')

  const searchTimeout = useRef(null)
  const recTimeout = useRef(null)
  const draftTimeout = useRef(null)
  const viewportRef = useRef(null) // [w, s, e, n] of the map view
  const autoSaveTried = useRef(false)
  const regionFitDone = useRef(false)
  const stopsRef = useRef(stops)
  useEffect(() => { stopsRef.current = stops }, [stops])

  // ── Auth ──
  useEffect(() => {
    const supabase = getAuthSupabase()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthChecked(true)
    })
  }, [])

  // ── Full-screen tool: hide the site nav/footer (same treatment as /map).
  // Without this the 100svh layout is pushed below the fold — and in embed
  // mode (the /map "Build a trail" tab iframes this route) the frame would
  // render a second nav inside itself. ──
  useEffect(() => {
    const nav = document.querySelector('nav')
    const footer = document.querySelector('footer')
    if (nav) nav.style.display = 'none'
    if (footer) footer.style.display = 'none'
    document.body.style.overflow = 'hidden'
    return () => {
      if (nav) nav.style.display = ''
      if (footer) footer.style.display = ''
      document.body.style.overflow = ''
    }
  }, [])

  // ── Discovery pins: the full network layer, same payload as /map.
  // trail_suitable === false (retail-only etc.) stays off the builder. ──
  useEffect(() => {
    let cancelled = false
    fetch('/api/map')
      .then(r => r.ok ? r.json() : { listings: [] })
      .then(({ listings }) => {
        if (cancelled) return
        setAllListings((listings || []).filter(l => l.trail_suitable !== false))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // ── Edit mode: hydrate from an existing trail ──
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    fetch(`/api/trails/${editId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('not found')))
      .then(({ trail }) => {
        if (cancelled || !trail) return
        setEditingTrail(trail)
        setTrailName(trail.title || '')
        setTrailDesc(trail.description || '')
        setVisibility(trail.visibility || 'private')
        setTransportMode(trail.transport_mode || 'drive')
        setNeighbourhoodLabel(trail.neighbourhood_label || '')
        const loadedStops = (trail.stops || []).map(s => normaliseStop({
          id: s.listing_id || s.id,
          name: s.venue_name,
          vertical: s.vertical,
          latitude: s.venue_lat,
          longitude: s.venue_lng,
          slug: s.listing_slug,
          image_url: s.venue_image_url,
          region: s.listing_region,
        }))
        setStops(loadedStops)
        const notes = {}
        for (const s of trail.stops || []) {
          if (s.editorial_copy) notes[s.listing_id || s.id] = s.editorial_copy
        }
        setStopNotes(notes)
      })
      .catch(() => { if (!cancelled) setEditLoadError(t('editLoadError')) })
    return () => { cancelled = true }
  }, [editId])

  // ── Draft restore (no edit id) ──
  useEffect(() => {
    if (editId) return
    const d = readDraft()
    if (!d || (!d.stops.length && !d.name)) return
    setTrailName(d.name || '')
    setTrailDesc(d.desc || '')
    setVisibility(d.visibility || 'private')
    setTransportMode(d.transportMode || 'drive')
    setNeighbourhoodLabel(d.neighbourhoodLabel || '')
    setStops((d.stops || []).map(normaliseStop))
    setStopNotes(d.notes || {})
    setDraftRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // ── Draft persist (debounced write-through) ──
  useEffect(() => {
    if (editId) return // edits live server-side
    clearTimeout(draftTimeout.current)
    draftTimeout.current = setTimeout(() => {
      if (!stops.length && !trailName.trim()) { clearDraft(); return }
      writeDraft({
        name: trailName, desc: trailDesc, visibility, transportMode,
        neighbourhoodLabel, stops, notes: stopNotes, savedAt: Date.now(),
      })
    }, 500)
    return () => clearTimeout(draftTimeout.current)
  }, [trailName, trailDesc, visibility, transportMode, neighbourhoodLabel, stops, stopNotes, editId])

  // ── Search ──
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (!search.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const verticalParam = activeVertical !== 'all' ? `&vertical=${activeVertical}` : ''
        const res = await fetch(`/api/trails/search?q=${encodeURIComponent(search.trim())}${verticalParam}`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setSearchResults(data.results || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
    return () => clearTimeout(searchTimeout.current)
  }, [search, activeVertical])

  // ── Route (geometry + legs + totals) ──
  useEffect(() => {
    let cancelled = false
    const routeTimer = setTimeout(async () => {
      const r = await fetchRoute(stops, transportMode)
      if (!cancelled) setRoute(r)
    }, 350)
    return () => { cancelled = true; clearTimeout(routeTimer) }
  }, [stops, transportMode])

  // ── Recommendations (debounced on stop changes) ──
  const refreshRecs = useCallback((immediate = false) => {
    clearTimeout(recTimeout.current)
    recTimeout.current = setTimeout(async () => {
      const current = stopsRef.current
      setRecLoading(true)
      try {
        const res = await fetch('/api/trails/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stops: current.map(s => ({ id: s.id, latitude: s.latitude, longitude: s.longitude, vertical: s.vertical, name: s.name })),
            bbox: viewportRef.current,
          }),
        })
        const data = await res.json().catch(() => ({ groups: [] }))
        setRecGroups(data.groups || [])
      } catch {
        setRecGroups([])
      } finally {
        setRecLoading(false)
      }
    }, immediate ? 0 : 600)
  }, [])

  useEffect(() => { refreshRecs() }, [stops, refreshRecs])

  // ── Templates: curated trails as starting points ──
  useEffect(() => {
    let cancelled = false
    fetch('/api/trails?type=editorial&limit=6')
      .then(r => r.ok ? r.json() : { trails: [] })
      .then(({ trails }) => { if (!cancelled) setTemplates(trails || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // ── Stop operations ──
  const addStop = useCallback((venue) => {
    const v = normaliseStop(venue)
    setStops(prev => {
      if (prev.find(s => String(s.id) === String(v.id))) return prev
      if (prev.length >= MAX_STOPS) return prev
      return [...prev, v]
    })
    setSavedTrail(null)
  }, [])

  const removeStop = useCallback((id) => {
    setStops(prev => {
      const index = prev.findIndex(s => String(s.id) === String(id))
      if (index === -1) return prev
      setLastRemoved({ stop: prev[index], index, note: stopNotes[id] || '' })
      return prev.filter(s => String(s.id) !== String(id))
    })
    setStopNotes(prev => { const next = { ...prev }; delete next[id]; return next })
  }, [stopNotes])

  const undoRemove = useCallback(() => {
    setLastRemoved(lr => {
      if (lr) {
        setStops(prev => {
          if (prev.find(s => String(s.id) === String(lr.stop.id))) return prev
          const next = [...prev]
          next.splice(Math.min(lr.index, next.length), 0, lr.stop)
          return next
        })
        if (lr.note) setStopNotes(prev => ({ ...prev, [lr.stop.id]: lr.note }))
      }
      return null
    })
  }, [])

  const reorderStops = useCallback((from, to) => {
    setStops(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const optimiseOrder = useCallback(() => {
    setStops(prev => nearestNeighbourOrder(prev))
  }, [])

  // How much the shortest-run order would save vs the current order.
  // Komoot's research: telling users about ordering beats silently changing
  // it — so we badge the button with the saving and leave the choice to them.
  const optimiseSavingsKm = useMemo(() => {
    const pts = stops.filter(s => s.latitude && s.longitude)
    if (pts.length < 4) return 0
    const orderKm = (arr) => {
      let km = 0
      for (let i = 1; i < arr.length; i++) {
        km += haversineKm(
          parseFloat(arr[i - 1].latitude), parseFloat(arr[i - 1].longitude),
          parseFloat(arr[i].latitude), parseFloat(arr[i].longitude)
        )
      }
      return km
    }
    const current = orderKm(pts)
    const optimised = orderKm(nearestNeighbourOrder(pts))
    const saving = current - optimised
    return saving > Math.max(5, current * 0.12) ? Math.round(saving) : 0
  }, [stops])

  const loadTemplate = useCallback(async (tpl) => {
    setTemplateLoading(tpl.slug)
    try {
      const res = await fetch(`/api/trails/${tpl.slug}`)
      if (!res.ok) throw new Error()
      const { trail } = await res.json()
      const tStops = (trail.stops || [])
        .filter(s => s.venue_lat && s.venue_lng)
        .map(s => normaliseStop({
          id: s.listing_id || s.id, name: s.venue_name, vertical: s.vertical,
          latitude: s.venue_lat, longitude: s.venue_lng,
          slug: s.listing_slug, image_url: s.venue_image_url, region: s.listing_region,
        }))
      setStops(tStops.slice(0, MAX_STOPS))
      if (!trailName.trim()) setTrailName(`${trail.title}`)
    } catch {} finally {
      setTemplateLoading(null)
    }
  }, [trailName])

  // ── Region deep-link (?region=Name): once pins are in, frame that region ──
  const regionBounds = useMemo(() => {
    if (!regionParam || !allListings.length || regionFitDone.current) return null
    const matches = allListings.filter(l => (l.region || '').toLowerCase().includes(regionParam.toLowerCase()))
    if (matches.length < 2) return null
    const lats = matches.map(l => parseFloat(l.lat)).filter(Number.isFinite)
    const lngs = matches.map(l => parseFloat(l.lng)).filter(Number.isFinite)
    if (!lats.length) return null
    regionFitDone.current = true
    return [[Math.min(...lngs) - 0.1, Math.min(...lats) - 0.1], [Math.max(...lngs) + 0.1, Math.max(...lats) + 0.1]]
  }, [regionParam, allListings])

  // ── Save ──
  const canSave = trailName.trim().length > 0 && stops.length >= 2

  const buildPayload = useCallback(() => ({
    title: trailName.trim(),
    description: trailDesc.trim(),
    type: 'user',
    visibility,
    transport_mode: transportMode,
    neighbourhood_label: transportMode === 'neighbourhood' && neighbourhoodLabel.trim() ? neighbourhoodLabel.trim() : null,
    stops: stops.map((s, i) => ({
      listing_id: s.id,
      vertical: s.vertical,
      venue_name: s.name,
      venue_lat: s.latitude ? parseFloat(s.latitude) : null,
      venue_lng: s.longitude ? parseFloat(s.longitude) : null,
      venue_image_url: s.image_url || null,
      position: i,
      editorial_copy: stopNotes[s.id] || '',
      distance_from_previous_km: i > 0 ? route.legs[i - 1]?.km ?? null : null,
      duration_from_previous_minutes: i > 0 ? route.legs[i - 1]?.min ?? null : null,
    })),
  }), [trailName, trailDesc, visibility, transportMode, neighbourhoodLabel, stops, stopNotes, route.legs])

  const saveTrailAuthed = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = buildPayload()
      let res
      let copied = false
      if (editId) {
        res = await fetch(`/api/trails/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        // Not the owner → save a personal copy instead of failing.
        if (res.status === 403) {
          copied = true
          res = await fetch('/api/trails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, title: payload.title }),
          })
        }
      } else {
        res = await fetch('/api/trails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Save failed')
      }
      const data = await res.json()
      const trail = data.trail || data
      setSavedTrail({ id: trail.id, slug: trail.slug, short_code: trail.short_code, title: trail.title, visibility: trail.visibility || visibility, copied })
      setShareCopied(false)
      if (!editId) clearDraft()
    } catch (err) {
      console.error(err)
      setSaveError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }, [buildPayload, editId])

  const saveTrail = useCallback(() => {
    if (!canSave || saving) return
    if (!user) {
      // Draft is already persisted; AuthModal brings them back with intent.
      setAuthOpen(true)
      return
    }
    saveTrailAuthed()
  }, [canSave, saving, user, saveTrailAuthed])

  // ── OAuth resume: ?resume=1 means "they hit Save, went to sign in, and
  // came back" — finish the job without making them click again. ──
  useEffect(() => {
    if (!authChecked || !user || autoSaveTried.current) return
    if (searchParams.get('resume') !== '1') return
    autoSaveTried.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('resume')
    window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
    // Wait one tick for draft restoration to settle, then save if complete.
    setTimeout(() => {
      const current = stopsRef.current
      if (current.length >= 2) saveTrailAuthed()
    }, 400)
  }, [authChecked, user, searchParams, saveTrailAuthed])

  const startFresh = useCallback(() => {
    clearDraft()
    setStops([]); setStopNotes({}); setTrailName(''); setTrailDesc('')
    setVisibility('private'); setTransportMode('drive'); setNeighbourhoodLabel('')
    setSavedTrail(null); setDraftRestored(false); setLastRemoved(null)
    if (editId) router.replace(`/trails/builder${isEmbed ? '?embed=1' : ''}`)
  }, [editId, isEmbed, router])

  const keepEditingSaved = useCallback(() => {
    if (!savedTrail?.id) return
    const url = new URL(window.location.href)
    url.searchParams.set('id', savedTrail.id)
    window.history.replaceState(null, '', url.pathname + `?${url.searchParams.toString()}`)
    setEditingTrail({ id: savedTrail.id, title: savedTrail.title })
    setSavedTrail(null)
    // Note: editId from useSearchParams won't update on replaceState; track
    // the live edit target via editingTrail when continuing in-session.
  }, [savedTrail])

  // The live edit target: either the URL ?id= or a just-saved trail being edited.
  const effectiveEditId = editId || (editingTrail?.id ?? null)

  // Re-bind save to the effective id (covers post-save "keep editing").
  const saveTrailFinal = useCallback(() => {
    if (!canSave || saving) return
    if (!user) { setAuthOpen(true); return }
    if (effectiveEditId && !editId) {
      // continuing to edit a just-saved trail in-session — PUT to it
      ;(async () => {
        setSaving(true)
        setSaveError(null)
        try {
          const res = await fetch(`/api/trails/${effectiveEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload()),
          })
          if (!res.ok) throw new Error('Save failed')
          const data = await res.json()
          const trail = data.trail || data
          setSavedTrail({ id: trail.id, slug: trail.slug, short_code: trail.short_code, title: trail.title, visibility: trail.visibility || visibility, copied: false })
        } catch (err) {
          setSaveError(t('saveError'))
        } finally {
          setSaving(false)
        }
      })()
      return
    }
    saveTrail()
  }, [canSave, saving, user, effectiveEditId, editId, buildPayload, saveTrail])

  // Private trails have no public page — the capability URL (/t/code) only
  // serves link/public visibility, the slug page only public + editorial.
  const savedIsPrivate = savedTrail?.visibility === 'private'
  const shareUrl = savedTrail?.short_code && !savedIsPrivate
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${savedTrail.short_code}`
    : null
  const viewUrl = savedTrail
    ? (savedTrail.visibility === 'public' ? `/trails/${savedTrail.slug}` : !savedIsPrivate ? `/t/${savedTrail.short_code}` : null)
    : null

  const copyShare = useCallback(() => {
    if (!shareUrl) return
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    }).catch(() => {})
  }, [shareUrl])

  const onViewportChange = useCallback((bbox) => {
    viewportRef.current = bbox
    // With no stops, suggestions follow the map ("strong places to start").
    if (!stopsRef.current.length) refreshRecs()
  }, [refreshRecs])

  const stopIds = useMemo(() => new Set(stops.map(s => String(s.id))), [stops])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: 'var(--color-cream)' }}>

      {/* Mobile tab toggle */}
      <div style={{ display: 'none' }} className="trail-mobile-tabs">
        {['builder', 'map'].map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{
              flex: 1, padding: '14px 0', border: 'none', minHeight: 48,
              borderBottom: `2px solid ${mobileTab === tab ? '#5F8A7E' : 'transparent'}`,
              background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 13,
              fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: mobileTab === tab ? 'var(--color-ink)' : 'var(--color-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab === 'builder' ? t('mobileTabBuilder') : t('mobileTabMap')}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }} className="trail-body">

        {/* ── Left panel ── */}
        <div
          className={`trail-sidebar${mobileTab === 'builder' ? ' mobile-active' : ''}`}
          style={{
            width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--color-border)', background: 'var(--color-cream)',
            overflow: 'hidden',
          }}
        >
          {/* Header / meta / save */}
          <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>
                {!isEmbed && (
                  <>
                    <Link href="/map" style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', textDecoration: 'none', letterSpacing: '0.06em' }}>
                      &larr; {t('backToMap')}
                    </Link>
                    <span style={{ margin: '0 8px', color: 'var(--color-border)' }}>|</span>
                  </>
                )}
                {effectiveEditId ? t('headerEditing') : t('headerTitle')}
              </span>
              {(stops.length > 0 || trailName) && (
                <button onClick={startFresh} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: 0 }}>
                  {t('startFresh')}
                </button>
              )}
            </div>

            {editLoadError && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fdf0ee', border: '1px solid #eccfc9', borderRadius: 4, fontSize: 12, color: '#b0492f', fontFamily: 'var(--font-body)' }}>
                {editLoadError}
              </div>
            )}

            {draftRestored && stops.length > 0 && !savedTrail && (
              <div style={{ marginBottom: 10, padding: '7px 12px', background: 'rgba(95,138,126,0.08)', border: '1px solid rgba(95,138,126,0.25)', borderRadius: 4, fontSize: 11.5, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{t('draftRestored')}</span>
                <button onClick={() => setDraftRestored(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            )}

            {/* Save success panel */}
            {savedTrail ? (
              <div style={{ padding: '14px 14px 12px', background: '#fff', border: '1px solid rgba(95,138,126,0.35)', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#5F8A7E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)' }}>
                    {savedTrail.copied ? t('savedAsCopy') : t('savedTitle')}
                  </span>
                </div>
                {shareUrl && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <input readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--font-body)', color: 'var(--color-muted)', background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 4, outline: 'none' }} />
                    <button onClick={copyShare} style={{ flexShrink: 0, padding: '7px 12px', background: shareCopied ? '#3D6B60' : '#5F8A7E', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
                      {shareCopied ? t('copiedConfirm') : t('copyLink')}
                    </button>
                  </div>
                )}
                {savedIsPrivate && (
                  <div style={{ marginBottom: 10, fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                    {t('savedPrivateNote')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  {viewUrl ? (
                    <a href={viewUrl} target={isEmbed ? '_blank' : undefined} rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: '#5F8A7E', color: '#fff', borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                      {t('viewTrail')}
                    </a>
                  ) : (
                    <a href="/account/trails" target={isEmbed ? '_blank' : undefined} rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: '#5F8A7E', color: '#fff', borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                      {t('myTrails')}
                    </a>
                  )}
                  <button onClick={keepEditingSaved} style={{ flex: 1, padding: '8px 0', background: 'transparent', color: '#5F8A7E', border: '1px solid #5F8A7E', borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {t('keepEditing')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  value={trailName}
                  onChange={e => setTrailName(e.target.value)}
                  placeholder={t('trailNamePlaceholder')}
                  aria-label={t('trailNameAria')}
                  style={{
                    width: '100%', fontFamily: 'var(--font-display)', fontSize: 20,
                    color: 'var(--color-ink)', background: 'transparent', border: 'none',
                    outline: 'none', boxSizing: 'border-box', marginBottom: 8,
                  }}
                />

                <textarea
                  value={trailDesc}
                  onChange={e => setTrailDesc(e.target.value)}
                  placeholder={t('trailDescPlaceholder')}
                  rows={1}
                  style={{
                    width: '100%', padding: '4px 0 8px', fontFamily: 'var(--font-body)', fontSize: 13,
                    color: 'var(--color-ink)', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--color-border)', outline: 'none',
                    resize: 'none', boxSizing: 'border-box', lineHeight: 1.5, marginBottom: 10,
                  }}
                />

                {/* Transport + visibility + save in one compact row set */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                    {[{ key: 'drive', label: t('modeDrive') }, { key: 'nocar', label: t('modeNoCar') }].map(m => {
                      const active = m.key === 'drive' ? transportMode === 'drive' : transportMode !== 'drive'
                      return (
                        <button
                          key={m.key}
                          onClick={() => {
                            if (m.key === 'drive') setTransportMode('drive')
                            else if (transportMode === 'drive') setTransportMode('transit')
                          }}
                          style={{
                            padding: '6px 13px', border: 'none', minHeight: 32,
                            background: active ? 'var(--color-sage, #5F8A7E)' : 'transparent',
                            color: active ? '#fff' : 'var(--color-muted)',
                            fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
                            letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.12s',
                          }}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>

                  {transportMode !== 'drive' && (
                    <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                      {[{ key: 'transit', label: t('modeTransitWalk') }, { key: 'neighbourhood', label: t('modeOneNeighbourhood') }].map(m => (
                        <button
                          key={m.key}
                          onClick={() => setTransportMode(m.key)}
                          style={{
                            padding: '6px 10px', border: 'none', minHeight: 32,
                            background: transportMode === m.key ? '#5A8A9A' : 'transparent',
                            color: transportMode === m.key ? '#fff' : 'var(--color-muted)',
                            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.12s',
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {transportMode === 'neighbourhood' && (
                  <input
                    value={neighbourhoodLabel}
                    onChange={e => setNeighbourhoodLabel(e.target.value)}
                    placeholder={t('neighbourhoodPlaceholder', { example: 'Fitzroy & Collingwood' })}
                    style={{
                      width: '100%', padding: '6px 0', fontFamily: 'var(--font-body)', fontSize: 13,
                      color: 'var(--color-ink)', background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--color-border)', outline: 'none',
                      boxSizing: 'border-box', marginBottom: 10,
                    }}
                  />
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={visibility}
                    onChange={e => setVisibility(e.target.value)}
                    aria-label={t('visibilityAria')}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)',
                      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4,
                      padding: '8px 10px', cursor: 'pointer', flexShrink: 0, outline: 'none',
                    }}
                  >
                    <option value="private">{t('visibilityPrivate')}</option>
                    <option value="link">{t('visibilityLink')}</option>
                    <option value="public">{t('visibilityPublic')}</option>
                  </select>

                  <button
                    onClick={saveTrailFinal}
                    disabled={saving || !canSave}
                    style={{
                      flex: 1, padding: '8px 16px',
                      background: canSave && !saving ? '#5F8A7E' : '#e8e4de',
                      color: canSave && !saving ? '#fff' : 'var(--color-muted)',
                      border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-body)',
                      cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s',
                    }}
                  >
                    {saving ? t('saving') : effectiveEditId ? t('saveChanges') : t('saveTrail')}
                  </button>
                </div>

                {!canSave && !saveError && (
                  <div style={{ marginTop: 7, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                    {!trailName.trim() && stops.length < 2
                      ? t('hintNameAndStops')
                      : !trailName.trim() ? t('hintName') : t('hintStops')}
                  </div>
                )}
                {saveError && (
                  <div style={{ marginTop: 7, fontSize: 12, color: '#c0392b', fontFamily: 'var(--font-body)' }}>{saveError}</div>
                )}
                {!user && authChecked && canSave && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                    {t('signInNote')}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Search */}
          <div style={{ padding: '12px 20px 10px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAria')}
                style={{
                  width: '100%', padding: '9px 12px 9px 32px', fontFamily: 'var(--font-body)',
                  fontSize: 13, color: 'var(--color-ink)', background: '#fff',
                  border: '1px solid var(--color-border)', borderRadius: 4,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              {search && (
                <button onClick={() => setSearch('')} aria-label={t('clearSearch')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 14, padding: 4 }}>×</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {VERTICAL_FILTERS.map(v => {
                const active = activeVertical === v.key
                const color = v.key === 'all' ? '#5F8A7E' : (VERTICAL_COLORS[v.key] || '#5F8A7E')
                return (
                  <button
                    key={v.key}
                    onClick={() => setActiveVertical(v.key)}
                    aria-pressed={active}
                    style={{
                      padding: '5px 10px', borderRadius: 4, minHeight: 28,
                      border: `1px solid ${active ? color : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      fontFamily: 'var(--font-body)',
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : 'var(--color-muted)',
                      transition: 'all 0.1s',
                    }}
                  >
                    {v.labelKey ? t(v.labelKey) : v.label}
                  </button>
                )
              })}
            </div>

            {searchLoading && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{t('searching')}</div>
            )}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 192, overflowY: 'auto', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: '#fff' }}>
              {searchResults.map(r => {
                const isAdded = stopIds.has(String(r.id))
                const color = VERTICAL_COLORS[r.vertical] || '#5F8A7E'
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 20px', borderBottom: '1px solid var(--color-border)',
                      opacity: isAdded ? 0.5 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontFamily: 'var(--font-body)' }}>
                          {getVerticalBadge(r.vertical)}
                        </span>
                        {r.region && <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>{r.region}</span>}
                      </div>
                    </div>
                    {isAdded ? (
                      <span style={{ flexShrink: 0, marginLeft: 8, fontSize: 11, color: '#5F8A7E', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{t('added')}</span>
                    ) : (
                      <button
                        onClick={() => addStop(r)}
                        style={{
                          flexShrink: 0, marginLeft: 8, padding: '6px 12px', minHeight: 32,
                          background: 'none', border: '1px solid rgba(95,138,126,0.4)',
                          borderRadius: 4, fontSize: 11.5, color: '#5F8A7E', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', fontWeight: 600,
                        }}
                      >
                        {t('addShort')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Scrollable body: suggestions + stops */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <SuggestRail
              groups={recGroups}
              loading={recLoading}
              hasStops={stops.length > 0}
              stopIds={stopIds}
              onAdd={addStop}
              onHover={setHighlightId}
              templates={templates}
              templateLoading={templateLoading}
              onUseTemplate={loadTemplate}
            />

            <StopsPanel
              stops={stops}
              notes={stopNotes}
              legs={route.legs}
              totalKm={route.totalKm}
              totalMin={route.totalMin}
              approx={route.approx}
              transportMode={transportMode}
              neighbourhoodLabel={neighbourhoodLabel}
              onNoteChange={(id, text) => setStopNotes(prev => ({ ...prev, [id]: text }))}
              onRemove={removeStop}
              onReorder={reorderStops}
              onOptimise={optimiseOrder}
              optimiseSavingsKm={optimiseSavingsKm}
              lastRemoved={lastRemoved}
              onUndoRemove={undoRemove}
              onDismissUndo={() => setLastRemoved(null)}
              maxStops={MAX_STOPS}
            />

            {transportMode === 'neighbourhood' && stops.length > 0 && stops[0].latitude && stops[0].longitude && (
              <div style={{ padding: '0 20px 16px' }}>
                <GettingThereCard
                  neighbourhoodLabel={neighbourhoodLabel || null}
                  firstStopLat={parseFloat(stops[0].latitude)}
                  firstStopLng={parseFloat(stops[0].longitude)}
                  state={stops[0].state || null}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: map ── */}
        <div
          className={`trail-map${mobileTab === 'map' ? ' mobile-active' : ''}`}
          style={{ position: 'relative', flex: 1, height: '100%' }}
        >
          <BuilderMap
            listings={allListings}
            stops={stops}
            routeGeometry={route.geometry}
            stopIds={stopIds}
            highlightId={highlightId}
            initialFitBounds={regionBounds}
            onAddStop={addStop}
            onRemoveStop={removeStop}
            onViewportChange={onViewportChange}
            active={mobileTab === 'map'}
          />
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        returnTo={`/trails/builder?resume=1${isEmbed ? '&embed=1' : ''}${editId ? `&id=${editId}` : ''}`}
        onAuthSuccess={async () => {
          const supabase = getAuthSupabase()
          const { data: { user: freshUser } } = await supabase.auth.getUser()
          setUser(freshUser)
          if (freshUser) saveTrailAuthed()
        }}
      />

      {/* Popup and responsive styles */}
      <style>{`
        .mapboxgl-popup-content {
          border-radius: 4px !important;
          padding: 14px 16px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
          border: 1px solid var(--color-border) !important;
          background: var(--color-cream, #faf7f2) !important;
        }
        .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-popup-close-button { font-size: 16px; color: var(--color-muted); padding: 4px 8px; }
        .builder-hover-tip { pointer-events: none !important; }
        .builder-hover-tip .mapboxgl-popup-content { padding: 8px 11px !important; box-shadow: 0 2px 10px rgba(0,0,0,0.10) !important; }

        @media (max-width: 768px) {
          .trail-mobile-tabs { display: flex !important; background: var(--color-cream); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
          .trail-body { flex-direction: column; position: relative; }
          .trail-sidebar { width: 100% !important; flex-shrink: 0 !important; border-right: none !important; display: none !important; flex: 1; min-height: 0; overflow-y: auto; }
          .trail-sidebar.mobile-active { display: flex !important; }
          .trail-map { position: absolute !important; inset: 0 !important; visibility: hidden !important; pointer-events: none !important; }
          .trail-map.mobile-active { visibility: visible !important; pointer-events: auto !important; position: relative !important; flex: 1 !important; height: 100% !important; }
        }
      `}</style>
    </div>
  )
}

export default function BuilderClient() {
  const t = useTranslations('trailsBuilder')
  return (
    <Suspense fallback={
      <div style={{ background: 'var(--color-cream)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>{t('loading')}</div>
      </div>
    }>
      <TrailBuilderInner />
    </Suspense>
  )
}
