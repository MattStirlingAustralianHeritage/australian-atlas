'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const LocationContext = createContext(null)

const STORAGE_KEY = 'atlas_location'
const AUSTRALIA_BOUNDS = { latMin: -44, latMax: -10, lngMin: 112, lngMax: 154 }

function isInAustralia(lat, lng) {
  return (
    lat >= AUSTRALIA_BOUNDS.latMin && lat <= AUSTRALIA_BOUNDS.latMax &&
    lng >= AUSTRALIA_BOUNDS.lngMin && lng <= AUSTRALIA_BOUNDS.lngMax
  )
}

/**
 * LocationProvider — manages user location state across the app.
 *
 * Priority chain:
 *  1. localStorage (instant, no network)
 *  2. Logged-in user's saved profile location (async, on mount)
 *  3. Browser geolocation (requires user prompt)
 *
 * Location is persisted to localStorage always, and to profile if logged in.
 */
export function LocationProvider({ children, savedLocation }) {
  // savedLocation = { lat, lng, name } from server-side profile fetch (or null)
  const [location, setLocationState] = useState(null) // { lat, lng, name }
  const [status, setStatus] = useState('idle') // idle | detecting | ready | denied | overseas | unavailable
  const resolvedRef = useRef(false)

  // ── Hydrate from localStorage or server-provided profile location ──
  useEffect(() => {
    if (resolvedRef.current) return
    resolvedRef.current = true

    // 1. Check localStorage first (fastest)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.lat && parsed.lng) {
          setLocationState(parsed)
          setStatus('ready')
          return
        }
      }
    } catch {}

    // 2. Fall back to profile-saved location (SSR-provided)
    if (savedLocation?.lat && savedLocation?.lng) {
      const loc = { lat: savedLocation.lat, lng: savedLocation.lng, name: savedLocation.name || null }
      setLocationState(loc)
      setStatus('ready')
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)) } catch {}
      return
    }

    // 3. No location yet — stay idle, user must trigger detection
  }, [savedLocation])

  // ── Reverse geocode helper (with client-side timeout) ──
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(`/api/mapbox/geocode?lat=${lat}&lng=${lng}`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      console.log('[Atlas Location] reverse geocode response:', data)
      return data.features?.[0]?.text || null
    } catch (err) {
      console.warn('[Atlas Location] reverse geocode failed:', err.message || err)
      return null
    }
  }, [])

  // ── Persist to profile (fire-and-forget for logged-in users) ──
  const persistToProfile = useCallback((lat, lng, name) => {
    fetch('/api/save-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, name }),
    }).catch(() => {})
  }, [])

  // ── Set location (from any source) ──
  const setLocation = useCallback((lat, lng, name) => {
    const loc = { lat, lng, name }
    setLocationState(loc)
    setStatus('ready')
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)) } catch {}
    persistToProfile(lat, lng, name)
  }, [persistToProfile])

  // ── Detect via browser geolocation ──
  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.warn('[Atlas Location] Geolocation API not available')
      setStatus('unavailable')
      return
    }

    setStatus('detecting')
    console.log('[Atlas Location] Requesting browser geolocation...')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords
          console.log('[Atlas Location] Geolocation success:', { lat, lng })

          if (!isInAustralia(lat, lng)) {
            console.log('[Atlas Location] Outside Australia bounds, setting overseas')
            setStatus('overseas')
            return
          }

          // Reverse geocode for a human-readable name — but don't block on it
          let name = null
          try {
            name = await reverseGeocode(lat, lng)
            console.log('[Atlas Location] Reverse geocode name:', name)
          } catch (rgErr) {
            console.warn('[Atlas Location] Reverse geocode error (non-blocking):', rgErr)
          }

          setLocation(lat, lng, name)
          console.log('[Atlas Location] Location set, status → ready')
        } catch (err) {
          // Catch-all: if anything in the async callback fails,
          // still try to set location from raw coords
          console.error('[Atlas Location] Error in geolocation callback:', err)
          try {
            const { latitude: lat, longitude: lng } = pos.coords
            setLocation(lat, lng, null)
          } catch {
            setStatus('unavailable')
          }
        }
      },
      (err) => {
        console.warn('[Atlas Location] Geolocation error:', err.code, err.message)
        if (err.code === 1) {
          setStatus('denied')
        } else {
          setStatus('unavailable')
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }, [reverseGeocode, setLocation])

  // ── Manual location set (from search/picker) ──
  const setManualLocation = useCallback(async (lat, lng, name) => {
    if (!isInAustralia(lat, lng)) {
      setStatus('overseas')
      return
    }
    const resolvedName = name || await reverseGeocode(lat, lng)
    setLocation(lat, lng, resolvedName)
  }, [reverseGeocode, setLocation])

  // ── Clear location ──
  const clearLocation = useCallback(() => {
    setLocationState(null)
    setStatus('idle')
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  return (
    <LocationContext.Provider value={{
      location,
      status,
      detectLocation,
      setManualLocation,
      clearLocation,
      isReady: status === 'ready' && location !== null,
    }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLocation must be used within LocationProvider')
  return ctx
}
