'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

/**
 * Generic route editing hook.
 *
 * Works with any ordered list of stops that have { id, lat, lng }.
 * Manages toggle state (included/excluded from driving route),
 * debounced persistence, and flush-before-save semantics.
 *
 * Decoupled from any specific data shape — the itinerary page,
 * a future operator tour builder, or any other consumer provides
 * stops and an onPersist callback.
 *
 * @param {Array} stops — Ordered list of stop objects. Each must have:
 *   - id:    unique identifier (string or number)
 *   - lat:   latitude (number)
 *   - lng:   longitude (number)
 *   Any additional fields are preserved and passed through.
 *
 * @param {Object}   options
 * @param {Function} options.onPersist    — Called with the full Map<id, boolean> of
 *                                          toggle states after debounce completes.
 *                                          Consumer wires this to their write path
 *                                          (e.g. PATCH /api/trails/[id]).
 * @param {Function} options.isPinned     — (stop, index, allStops) => boolean.
 *                                          Pinned stops cannot be toggled off.
 *                                          Consumer defines pinning rules.
 * @param {number}   options.debounceMs   — Debounce delay in ms (default 300).
 *
 * @returns {{
 *   stops:              Array,     — Input stops augmented with _included and _pinned
 *   activeStops:        Array,     — Only stops where _included === true
 *   toggle:             Function,  — (stopId) => void
 *   flush:              Function,  — () => Promise<void> — force-persist now
 *   hasPendingChanges:  boolean,
 *   isIncluded:         Function,  — (stopId) => boolean
 *   isPinnedStop:       Function,  — (stopId) => boolean
 * }}
 */
export function useRouteEditor(stops, options = {}) {
  const { onPersist, isPinned, debounceMs = 300 } = options

  // ── Toggle state: Map<stopId, boolean> ──
  // Initialised from stops' included_in_route field, defaulting to true.
  const [included, setIncluded] = useState(() => {
    const map = {}
    for (const s of stops) {
      map[s.id] = s.included_in_route !== false
    }
    return map
  })

  // When the stop list changes (e.g. recommendation added), merge new
  // stops into toggle state without clobbering existing entries.
  const stopIdsKey = useMemo(() => stops.map(s => s.id).join(','), [stops])
  useEffect(() => {
    setIncluded(prev => {
      const next = { ...prev }
      let changed = false
      for (const s of stops) {
        if (!(s.id in next)) {
          next[s.id] = s.included_in_route !== false
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stopIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced persistence ──
  const timerRef = useRef(null)
  const pendingRef = useRef(false)
  const includedRef = useRef(included)
  includedRef.current = included
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  const persist = useCallback(() => {
    pendingRef.current = false
    if (onPersistRef.current) {
      onPersistRef.current({ ...includedRef.current })
    }
  }, [])

  const schedulePersist = useCallback(() => {
    clearTimeout(timerRef.current)
    pendingRef.current = true
    timerRef.current = setTimeout(persist, debounceMs)
  }, [persist, debounceMs])

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // ── Pinning check ──
  const checkPinned = useCallback((stopId) => {
    if (!isPinned) return false
    const idx = stops.findIndex(s => s.id === stopId)
    if (idx < 0) return false
    return isPinned(stops[idx], idx, stops)
  }, [isPinned, stops])

  // ── Toggle a stop's route inclusion ──
  const toggle = useCallback((stopId) => {
    // Pinned stops cannot be toggled
    if (checkPinned(stopId)) return
    setIncluded(prev => {
      const next = { ...prev }
      next[stopId] = !prev[stopId]
      return next
    })
    schedulePersist()
  }, [checkPinned, schedulePersist])

  // ── Flush: force-persist immediately ──
  // Called before Save, Share, or navigation-away to ensure no
  // toggle state is lost to a pending debounce timer.
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current)
    if (pendingRef.current) {
      persist()
    }
  }, [persist])

  // ── Derived: augmented stop list ──
  const augmentedStops = useMemo(() =>
    stops.map((s, i) => ({
      ...s,
      _included: included[s.id] !== false,
      _pinned: isPinned ? isPinned(s, i, stops) : false,
    })),
    [stops, included, isPinned]
  )

  const activeStops = useMemo(
    () => augmentedStops.filter(s => s._included),
    [augmentedStops]
  )

  return {
    stops: augmentedStops,
    activeStops,
    toggle,
    flush,
    hasPendingChanges: pendingRef.current,
    isIncluded: (stopId) => included[stopId] !== false,
    isPinnedStop: checkPinned,
  }
}
