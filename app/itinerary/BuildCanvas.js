'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DaySection from './DaySection'
import ItineraryMap from './ItineraryMap'
import SaveDialog from './SaveDialog'
import { defaultTitle, dayArc, SLOTS } from './engineShared'

const TRIO = 3

export default function BuildCanvas({ answers, onEditTrip }) {
  const { destination, dayCount, interests, pace } = answers
  const interestParam = interests.join(',')

  const [title, setTitle] = useState(defaultTitle({ regionName: destination.regionName, dayCount }))

  // choices[day][slotKey] = stop object | 'skipped' | undefined
  const [choices, setChoices] = useState({})
  const [offers, setOffers] = useState([])
  const [offersLoading, setOffersLoading] = useState(true)
  const [offerNonce, setOfferNonce] = useState(0)
  const seenRef = useRef({}) // `${day}:${slot}` -> Set of rotated-away ids

  const [routesByDay, setRoutesByDay] = useState({})
  const [pins, setPins] = useState([])
  const [center, setCenter] = useState({ lat: destination.centerLat, lng: destination.centerLng, zoom: destination.mapZoom })
  const [hoverId, setHoverId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)

  // The arc of slots for every day, shaped by pace and trip length.
  const arcs = useMemo(
    () => Array.from({ length: dayCount }, (_, d) => dayArc(pace, d, dayCount)),
    [pace, dayCount]
  )

  // Flat arc order: [{day, slotKey}] — the trip's spine.
  const arcOrder = useMemo(
    () => arcs.flatMap((arc, d) => arc.map((slotKey) => ({ day: d, slotKey }))),
    [arcs]
  )

  // The active slot is the first unanswered one along the spine.
  const activeSlot = useMemo(
    () => arcOrder.find(({ day, slotKey }) => choices[day]?.[slotKey] === undefined) || null,
    [arcOrder, choices]
  )

  // Chosen stops in trip order (feeds the map, routing, and save).
  const stops = useMemo(
    () =>
      arcOrder
        .map(({ day, slotKey }) => {
          const v = choices[day]?.[slotKey]
          return v && v !== 'skipped' ? { ...v, day, slotKey } : null
        })
        .filter(Boolean),
    [arcOrder, choices]
  )

  const mapStops = useMemo(() => {
    const perDay = {}
    return stops.map((s) => {
      perDay[s.day] = (perDay[s.day] || 0) + 1
      return { ...s, dayIndex: perDay[s.day], is_overnight: s.slotKey === 'sleep' }
    })
  }, [stops])

  // The anchor for the active slot: the last thing chosen before it.
  const anchor = useMemo(() => {
    if (!activeSlot) return null
    const idx = arcOrder.findIndex((a) => a.day === activeSlot.day && a.slotKey === activeSlot.slotKey)
    for (let i = idx - 1; i >= 0; i--) {
      const v = choices[arcOrder[i].day]?.[arcOrder[i].slotKey]
      if (v && v !== 'skipped') return { lat: v.lat, lng: v.lng }
    }
    return null
  }, [activeSlot, arcOrder, choices])

  // ── Map pins for the destination (once per destination) ──
  useEffect(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams()
    if (destination.regionSlug) params.set('region', destination.regionSlug)
    params.set('lat', destination.centerLat)
    params.set('lng', destination.centerLng)
    if (destination.mapZoom) params.set('zoom', destination.mapZoom)
    params.set('limit', '1')
    fetch(`/api/itinerary/places?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        setPins(data.pins || [])
        if (data.center) setCenter(data.center)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [destination])

  // ── Offers for the active slot ──
  const activeKey = activeSlot ? `${activeSlot.day}:${activeSlot.slotKey}` : null
  const seedsSig = stops.map((s) => s.id).join(',')
  useEffect(() => {
    if (!activeSlot) {
      setOffers([])
      setOffersLoading(false)
      return
    }
    const ctrl = new AbortController()
    setOffersLoading(true)

    const load = async (clearSeenAndRetry) => {
      const params = new URLSearchParams()
      params.set('slot', activeSlot.slotKey)
      if (anchor) {
        params.set('lat', anchor.lat)
        params.set('lng', anchor.lng)
        params.set('radius', '25')
      } else {
        if (destination.regionSlug) params.set('region', destination.regionSlug)
        params.set('lat', destination.centerLat)
        params.set('lng', destination.centerLng)
        if (destination.mapZoom) params.set('zoom', destination.mapZoom)
      }
      if (interestParam) params.set('interests', interestParam)
      if (seedsSig) params.set('seeds', seedsSig)
      const seen = seenRef.current[activeKey] || new Set()
      const excl = new Set([...stops.map((s) => String(s.id)), ...seen])
      if (excl.size) params.set('exclude', [...excl].join(','))
      params.set('pins', '0')
      params.set('limit', String(TRIO))

      try {
        const res = await fetch(`/api/itinerary/places?${params}`, { signal: ctrl.signal })
        const data = await res.json()
        const suggs = data.suggestions || []
        // Rotated through the whole pool? Start the cycle again.
        if (!suggs.length && seen.size && clearSeenAndRetry) {
          seenRef.current[activeKey] = new Set()
          return load(false)
        }
        setOffers(suggs)
        setOffersLoading(false)
      } catch (e) {
        if (e.name !== 'AbortError') {
          setOffers([])
          setOffersLoading(false)
        }
      }
    }
    load(true)
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, seedsSig, interestParam, offerNonce, destination])

  // ── Slot actions ──
  const choose = useCallback(
    (listing) => {
      if (!activeSlot) return
      const stop = {
        id: String(listing.id),
        name: listing.name,
        vertical: listing.vertical,
        sub_type: listing.sub_type,
        slug: listing.slug,
        lat: parseFloat(listing.lat),
        lng: parseFloat(listing.lng),
        hero_image_url: listing.hero_image_url || null,
        region: listing.region || null,
        suburb: listing.suburb || null,
        state: listing.state || null,
      }
      setChoices((prev) => ({
        ...prev,
        [activeSlot.day]: { ...(prev[activeSlot.day] || {}), [activeSlot.slotKey]: stop },
      }))
    },
    [activeSlot]
  )

  const skip = useCallback(() => {
    if (!activeSlot) return
    setChoices((prev) => ({
      ...prev,
      [activeSlot.day]: { ...(prev[activeSlot.day] || {}), [activeSlot.slotKey]: 'skipped' },
    }))
  }, [activeSlot])

  const refresh = useCallback(() => {
    if (!activeKey) return
    if (!seenRef.current[activeKey]) seenRef.current[activeKey] = new Set()
    offers.forEach((s) => seenRef.current[activeKey].add(String(s.id)))
    setOfferNonce((n) => n + 1)
  }, [activeKey, offers])

  // Reopen a slot (Change) or clear it to skipped (Remove).
  const reopen = useCallback((day, slotKey, opts = {}) => {
    setChoices((prev) => {
      const dayChoices = { ...(prev[day] || {}) }
      if (opts.skip) dayChoices[slotKey] = 'skipped'
      else delete dayChoices[slotKey]
      return { ...prev, [day]: dayChoices }
    })
  }, [])

  const undoSkip = useCallback((day, slotKey) => {
    setChoices((prev) => {
      const dayChoices = { ...(prev[day] || {}) }
      delete dayChoices[slotKey]
      return { ...prev, [day]: dayChoices }
    })
  }, [])

  // A map pin click answers the current question with that place.
  const chooseFromMap = useCallback(
    (listing) => {
      if (activeSlot) choose(listing)
    },
    [activeSlot, choose]
  )

  const removeStopById = useCallback(
    (id) => {
      for (const { day, slotKey } of arcOrder) {
        const v = choices[day]?.[slotKey]
        if (v && v !== 'skipped' && String(v.id) === String(id)) {
          reopen(day, slotKey, { skip: true })
          return
        }
      }
    },
    [arcOrder, choices, reopen]
  )

  // ── Live routing per day (debounced) ──
  const routeSig = useMemo(() => stops.map((s) => `${s.day}:${s.id}`).join('|'), [stops])
  useEffect(() => {
    const timer = setTimeout(async () => {
      const byDay = {}
      for (let d = 0; d < dayCount; d++) {
        const ds = stops.filter((s) => s.day === d)
        if (ds.length < 2) continue
        const coords = ds.map((s) => `${s.lng},${s.lat}`).join(';')
        try {
          const res = await fetch(`/api/itinerary/directions?coords=${coords}`)
          const data = await res.json()
          if (data.geometry) byDay[d] = data
        } catch {
          /* leave day unrouted */
        }
      }
      setRoutesByDay(byDay)
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig, dayCount])

  // ── Save ──
  async function handleSave() {
    if (!stops.length || saving) return
    setSaving(true)
    try {
      const perDayCount = {}
      const stopRows = stops.map((s, i) => {
        const idxInDay = perDayCount[s.day] || 0
        perDayCount[s.day] = idxInDay + 1
        const leg = idxInDay > 0 ? routesByDay[s.day]?.legs?.[idxInDay - 1] : null
        return {
          listing_id: s.id,
          vertical: s.vertical,
          venue_name: s.name,
          venue_lat: s.lat,
          venue_lng: s.lng,
          venue_image_url: s.hero_image_url || null,
          position: i,
          day_number: s.day + 1,
          is_overnight: s.slotKey === 'sleep',
          editorial_copy: SLOTS[s.slotKey]?.label || null,
          distance_from_previous_km: leg?.distance_km ?? null,
          duration_from_previous_minutes: leg?.duration_min ?? null,
        }
      })
      const res = await fetch('/api/trails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || defaultTitle({ regionName: destination.regionName, dayCount }),
          type: 'user',
          visibility: 'public',
          region: destination.regionName || null,
          vertical_focus: interests[0] || null,
          transport_mode: 'drive',
          day_count: Math.min(Math.max(dayCount, 1), 7),
          saved_via: 'share', // allow anonymous save + share
          stops: stopRows,
        }),
      })
      const data = await res.json()
      if (data.trail) {
        setSaveResult({ shortCode: data.trail.short_code, slug: data.trail.slug })
      } else {
        setSaveResult({ error: data.error || 'Something went wrong saving your trip.' })
      }
    } catch {
      setSaveResult({ error: 'Could not reach the server. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const tripComplete = !activeSlot

  return (
    <div className="ie-canvas ie-root">
      {/* Toolbar */}
      <div className="ie-toolbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="ie-title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Trip title" />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', marginTop: 1 }}>
            {destination.regionName}
            {destination.state ? `, ${destination.state}` : ''} · {dayCount} {dayCount === 1 ? 'day' : 'days'} · {stops.length}{' '}
            {stops.length === 1 ? 'place' : 'places'}
          </p>
        </div>
        <button
          onClick={onEditTrip}
          style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Edit trip
        </button>
        <button onClick={handleSave} disabled={!stops.length || saving} className="btn btn-primary btn-sm" style={{ opacity: !stops.length || saving ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          {saving ? 'Saving…' : 'Save & share'}
        </button>
      </div>

      <div className="ie-body">
        {/* The progression */}
        <div className="ie-flow">
          {arcs.map((arc, d) => (
            <DaySection
              key={d}
              day={d}
              dayCount={dayCount}
              arc={arc}
              choices={choices[d] || {}}
              route={routesByDay[d]}
              activeSlotKey={activeSlot && activeSlot.day === d ? activeSlot.slotKey : null}
              offers={offers}
              offersLoading={offersLoading}
              onChoose={choose}
              onSkip={skip}
              onRefresh={refresh}
              onReopen={(slotKey, opts) => reopen(d, slotKey, opts)}
              onUndoSkip={(slotKey) => undoSkip(d, slotKey)}
              onHover={setHoverId}
            />
          ))}

          {/* Save block closes the progression */}
          {(tripComplete || stops.length > 0) && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 24, marginTop: 8 }}>
              {tripComplete && (
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--color-ink)', marginBottom: 10 }}>
                  That’s the whole trip.
                </p>
              )}
              <button onClick={handleSave} disabled={!stops.length || saving} className="btn btn-primary" style={{ opacity: !stops.length || saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save & share this trip'}
              </button>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginTop: 10 }}>
                {stops.length} {stops.length === 1 ? 'place' : 'places'} across {dayCount} {dayCount === 1 ? 'day' : 'days'} — you’ll get a link you can send to anyone.
              </p>
            </div>
          )}
        </div>

        {/* The supporting map */}
        <div className="ie-mapcard">
          <div className="ie-map-hint">
            {activeSlot ? 'Ringed pins are your current choices — tap any pin to pick it' : 'Your trip, plotted'}
          </div>
          <ItineraryMap
            pins={pins}
            stops={mapStops}
            routesByDay={routesByDay}
            initialCenter={center}
            highlightId={hoverId}
            candidateIds={offers.map((o) => String(o.id))}
            onAddStop={chooseFromMap}
            onRemoveStop={removeStopById}
            active
          />
        </div>
      </div>

      {saveResult && <SaveDialog result={saveResult} title={title} onClose={() => setSaveResult(null)} />}
    </div>
  )
}
