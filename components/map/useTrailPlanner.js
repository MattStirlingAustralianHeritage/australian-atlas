'use client'
// ============================================================
// useTrailPlanner — all trail-building state and behaviour for
// the /map page. MapClient owns the map; this hook owns the
// trail: draft persistence, routing, ordering, day structure,
// taste-ranked suggestions, editing a saved trail, and saving.
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import {
  readDraft, writeDraft, clearDraft, normaliseStop,
  fetchRoute, nearestNeighbourOrder, optimiseSavings, MAX_STOPS,
} from '@/lib/trail/draft'
import { chunkIntoDays, clearDays, hasDays } from '@/lib/trail/days'
import { suggestForTrail, sharesFromListings } from '@/lib/trail/suggest'
import { conciergeSlots } from '@/lib/trail/concierge'
import { mergeTasteProfiles } from '@/lib/discover/tasteProfile'
import { readDiscoveryPicks, writeDiscoveryPicks } from '@/lib/discover/sessionPicks'

export default function useTrailPlanner({
  allListings,          // full /api/map set (for suggestions + taste resolution)
  initialOpen = false,  // ?trail=1
  initialEditId = null, // ?trail=<uuid> — hydrate a saved trail for editing
  initialResume = false, // ?resume=1 — finish an interrupted save after OAuth
}) {
  const [open, setOpen] = useState(initialOpen || !!initialEditId)
  const [stops, setStops] = useState([])
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [transportMode, setTransportMode] = useState('drive')
  const [neighbourhoodLabel, setNeighbourhoodLabel] = useState('')
  const [notes, setNotes] = useState({})
  const [route, setRoute] = useState({ geometry: null, legs: [], totalKm: 0, totalMin: 0, approx: false })
  const [lastRemoved, setLastRemoved] = useState(null)

  // Auth + save lifecycle
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [savedTrail, setSavedTrail] = useState(null) // { id, slug, short_code, title, visibility, copied }

  // Edit mode
  const [editingTrail, setEditingTrail] = useState(null)
  const editIdRef = useRef(initialEditId)

  const stopsRef = useRef(stops)
  useEffect(() => { stopsRef.current = stops }, [stops])
  const hydrated = useRef(false)
  const draftTimer = useRef(null)
  const autoSaveTried = useRef(false)

  // ── Auth ──
  useEffect(() => {
    const supabase = getAuthSupabase()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthChecked(true)
    }).catch(() => setAuthChecked(true))
  }, [])

  // ── Hydrate: saved trail (?trail=<id>) or local draft ──
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    if (initialEditId) {
      fetch(`/api/trails/${initialEditId}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('not found')))
        .then(({ trail }) => {
          if (!trail) return
          setEditingTrail(trail)
          setName(trail.title || '')
          setDesc(trail.description || '')
          setVisibility(trail.visibility || 'private')
          setTransportMode(trail.transport_mode === 'neighbourhood' ? 'drive' : (trail.transport_mode || 'drive'))
          setNeighbourhoodLabel(trail.neighbourhood_label || '')
          setStops((trail.stops || []).filter(s => s.venue_lat && s.venue_lng).map(s => normaliseStop({
            id: s.listing_id || s.id,
            name: s.venue_name,
            vertical: s.vertical,
            latitude: s.venue_lat,
            longitude: s.venue_lng,
            slug: s.listing_slug,
            image_url: s.venue_image_url,
            region: s.listing_region,
            day: s.day_number ?? null,
          })))
          const loadedNotes = {}
          for (const s of trail.stops || []) {
            if (s.editorial_copy) loadedNotes[s.listing_id || s.id] = s.editorial_copy
          }
          setNotes(loadedNotes)
        })
        .catch(() => { /* stale link — start fresh on the map */ })
      return
    }
    const d = readDraft()
    if (!d || (!d.stops.length && !d.name)) return
    setName(d.name || '')
    setDesc(d.desc || '')
    setVisibility(d.visibility || 'private')
    setTransportMode(d.transportMode === 'neighbourhood' ? 'drive' : (d.transportMode || 'drive'))
    setNeighbourhoodLabel(d.neighbourhoodLabel || '')
    setStops((d.stops || []).map(normaliseStop))
    setNotes(d.notes || {})
  }, [initialEditId])

  // ── Draft persist (debounced write-through; edits live server-side) ──
  useEffect(() => {
    if (editIdRef.current || editingTrail) return
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      if (!stops.length && !name.trim()) { clearDraft(); return }
      writeDraft({
        name, desc, visibility, transportMode, neighbourhoodLabel,
        stops, notes, savedAt: Date.now(),
      })
    }, 500)
    return () => clearTimeout(draftTimer.current)
  }, [name, desc, visibility, transportMode, neighbourhoodLabel, stops, notes, editingTrail])

  // ── Route (geometry + legs + totals) ──
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const r = await fetchRoute(stops, transportMode)
      if (!cancelled) setRoute(r)
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [stops, transportMode])

  // ── Taste: session Discover picks + saved places, resolved against the
  // in-memory listing set. One shares profile drives every suggestion. ──
  const [savedListingRows, setSavedListingRows] = useState(null)
  useEffect(() => {
    if (!user) { setSavedListingRows(null); return }
    let cancelled = false
    fetch('/api/user/saves')
      .then(r => r.ok ? r.json() : { saves: [] })
      .then(({ saves }) => {
        if (cancelled) return
        setSavedListingRows((saves || []).map(s => s.listing).filter(Boolean))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  const taste = useMemo(() => {
    if (!allListings?.length) return null
    const byId = new Map(allListings.map(l => [String(l.id), l]))
    const pickRows = readDiscoveryPicks().map(id => byId.get(String(id))).filter(Boolean)
    // The trail itself is intent: what they've added colours what we suggest.
    const stopRows = stops.map(s => byId.get(String(s.id))).filter(Boolean)
    const sessionShares = sharesFromListings([...pickRows, ...stopRows])
    const savedShares = sharesFromListings(savedListingRows)
    return mergeTasteProfiles(savedShares, sessionShares)
  }, [allListings, stops, savedListingRows])

  // ── Suggestions (recomputed as the trail changes; instant, client-side) ──
  const suggestions = useMemo(() => {
    if (!open || !stops.length) return []
    return suggestForTrail({ stops, listings: allListings, taste, limit: 6 })
  }, [open, stops, allListings, taste])

  // ── Concierge: which day-moments are still open, and the best fill for
  // each (coffee to start, lunch mid-route, a bed for the night). ──
  const concierge = useMemo(() => {
    if (!open || !stops.length) return { slots: [], openCount: 0 }
    return conciergeSlots({ stops, listings: allListings, taste })
  }, [open, stops, allListings, taste])

  // ── Stop operations ──
  // atIndex === null appends; otherwise the stop is spliced in at that
  // position (the concierge drops coffee at the start, lunch mid-route, a
  // bed at the end). The inserted stop inherits its neighbour's day.
  const addStop = useCallback((venue, atIndex = null) => {
    const v = normaliseStop(venue)
    setStops(prev => {
      if (prev.find(s => String(s.id) === String(v.id))) return prev
      if (prev.length >= MAX_STOPS) return prev
      if (atIndex == null || atIndex >= prev.length) {
        const lastDay = prev.length ? prev[prev.length - 1].day : null
        return [...prev, lastDay != null ? { ...v, day: lastDay } : v]
      }
      const i = Math.max(0, atIndex)
      const neighbourDay = (prev[i]?.day ?? prev[i - 1]?.day) ?? null
      const next = [...prev]
      next.splice(i, 0, neighbourDay != null ? { ...v, day: neighbourDay } : v)
      return next
    })
    setSavedTrail(null)
    // Feed the discovery engine: adding a stop is a strong "I'd visit this".
    try {
      writeDiscoveryPicks([...readDiscoveryPicks(), String(v.id)])
    } catch { /* personalisation only */ }
  }, [])

  const removeStop = useCallback((id) => {
    setStops(prev => {
      const index = prev.findIndex(s => String(s.id) === String(id))
      if (index === -1) return prev
      setLastRemoved({ stop: prev[index], index })
      return prev.filter(s => String(s.id) !== String(id))
    })
    setNotes(prev => { const next = { ...prev }; delete next[id]; return next })
    setSavedTrail(null)
  }, [])

  const undoRemove = useCallback(() => {
    setLastRemoved(lr => {
      if (lr) {
        setStops(prev => {
          if (prev.find(s => String(s.id) === String(lr.stop.id))) return prev
          const next = [...prev]
          next.splice(Math.min(lr.index, next.length), 0, lr.stop)
          return next
        })
      }
      return null
    })
  }, [])

  const reorderStops = useCallback((from, to) => {
    setStops(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      // The day structure belongs to the SLOTS, not the venues: moving a stop
      // shuffles which venue fills which part of which day, so day groups can
      // never interleave out of order.
      const slotDays = prev.map(s => s.day ?? null)
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      if (!slotDays.some(d => d != null)) return next
      return next.map((s, i) => {
        if (slotDays[i] == null) {
          if (s.day == null) return s
          const { day, ...rest } = s
          return rest
        }
        return { ...s, day: slotDays[i] }
      })
    })
    setSavedTrail(null)
  }, [])

  const optimiseOrder = useCallback(() => {
    setStops(prev => clearDays(nearestNeighbourOrder(prev)))
    setSavedTrail(null)
  }, [])

  const optimiseSavingsKm = useMemo(() => optimiseSavings(stops), [stops])

  const splitIntoDays = useCallback(() => {
    setStops(prev => chunkIntoDays(prev, route.legs))
    setSavedTrail(null)
  }, [route.legs])

  const mergeDays = useCallback(() => {
    setStops(prev => clearDays(prev))
    setSavedTrail(null)
  }, [])

  const daysAssigned = useMemo(() => hasDays(stops), [stops])

  // Replace the whole trail (wizard seed / template load / plan-a-stay import).
  const seedStops = useCallback((newStops, { name: newName = '', keepName = false } = {}) => {
    setStops(newStops.slice(0, MAX_STOPS).map(normaliseStop))
    if (newName && !keepName) setName(newName)
    setSavedTrail(null)
    setLastRemoved(null)
    setOpen(true)
  }, [])

  const clearAll = useCallback(() => {
    clearDraft()
    setStops([]); setNotes({}); setName(''); setDesc('')
    setVisibility('private'); setTransportMode('drive'); setNeighbourhoodLabel('')
    setSavedTrail(null); setLastRemoved(null)
    if (editIdRef.current || editingTrail) {
      setEditingTrail(null)
      editIdRef.current = null
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('trail', '1')
        window.history.replaceState(null, '', url.pathname + `?${url.searchParams.toString()}`)
      } catch {}
    }
  }, [editingTrail])

  // ── Save ──
  const canSave = name.trim().length > 0 && stops.length >= 2

  const buildPayload = useCallback(() => ({
    title: name.trim(),
    description: desc.trim(),
    type: 'user',
    visibility,
    transport_mode: transportMode,
    neighbourhood_label: neighbourhoodLabel.trim() || null,
    stops: stops.map((s, i) => ({
      listing_id: s.id,
      vertical: s.vertical,
      venue_name: s.name,
      venue_lat: s.latitude ? parseFloat(s.latitude) : null,
      venue_lng: s.longitude ? parseFloat(s.longitude) : null,
      venue_image_url: s.image_url || null,
      position: i,
      day_number: s.day ?? null,
      editorial_copy: notes[s.id] || '',
      distance_from_previous_km: i > 0 ? route.legs[i - 1]?.km ?? null : null,
      duration_from_previous_minutes: i > 0 ? route.legs[i - 1]?.min ?? null : null,
    })),
  }), [name, desc, visibility, transportMode, neighbourhoodLabel, stops, notes, route.legs])

  const saveTrailAuthed = useCallback(async () => {
    setSaving(true)
    setSaveError(false)
    try {
      const payload = buildPayload()
      const editId = editIdRef.current || editingTrail?.id
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
            body: JSON.stringify(payload),
          })
        }
      } else {
        res = await fetch('/api/trails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      const trail = data.trail || data
      setSavedTrail({ id: trail.id, slug: trail.slug, short_code: trail.short_code, title: trail.title, visibility: trail.visibility || visibility, copied })
      // Keep editing what was just saved — further saves update in place.
      if (!editId && trail.id) {
        editIdRef.current = trail.id
        setEditingTrail({ id: trail.id, title: trail.title })
        clearDraft()
      }
    } catch (err) {
      console.error('[trail] save error:', err)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }, [buildPayload, editingTrail, visibility])

  const saveTrail = useCallback(() => {
    if (!canSave || saving) return
    if (!user) { setAuthOpen(true); return }
    saveTrailAuthed()
  }, [canSave, saving, user, saveTrailAuthed])

  // Email/password sign-in resolves in-modal — finish the save they started.
  const handleAuthSuccess = useCallback((freshUser) => {
    setAuthOpen(false)
    if (freshUser) {
      setUser(freshUser)
      if (stopsRef.current.length >= 2) saveTrailAuthed()
    }
  }, [saveTrailAuthed])

  // ── OAuth resume: they hit Save, signed in with Google, came back ──
  useEffect(() => {
    if (!initialResume || !authChecked || !user || autoSaveTried.current) return
    autoSaveTried.current = true
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('resume')
      window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
    } catch {}
    setTimeout(() => {
      if (stopsRef.current.length >= 2) saveTrailAuthed()
    }, 400)
  }, [initialResume, authChecked, user, saveTrailAuthed])

  return {
    open, setOpen,
    stops, name, setName, desc, setDesc,
    visibility, setVisibility,
    transportMode, setTransportMode,
    notes, setNotes,
    route,
    taste,
    suggestions,
    concierge,
    addStop, removeStop, undoRemove, reorderStops,
    optimiseOrder, optimiseSavingsKm,
    splitIntoDays, mergeDays, daysAssigned,
    seedStops, clearAll,
    lastRemoved,
    canSave, saving, saveError, saveTrail, saveTrailAuthed, savedTrail, setSavedTrail,
    editingTrail,
    user, authChecked, authOpen, setAuthOpen, handleAuthSuccess,
    atCapacity: stops.length >= MAX_STOPS,
  }
}
