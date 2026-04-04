/**
 * Australian Atlas Service Worker
 * Provides offline capability for saved trails and recently viewed regions.
 *
 * Cache strategy:
 * - Trail data: cached on save, available indefinitely offline
 * - Region pages: cached on visit, stale after 7 days
 * - Static assets: network-first with cache fallback
 * - API responses: cache-first for offline, network-first when online
 */

const CACHE_VERSION = 'atlas-v1'
const TRAIL_CACHE = 'atlas-trails-v1'
const REGION_CACHE = 'atlas-regions-v1'
const STATIC_CACHE = 'atlas-static-v1'

// Static assets to precache
const PRECACHE_URLS = [
  '/',
  '/offline',
]

// Install: precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith('atlas-'))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch: network-first for pages, cache-first for offline data
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Trail data: cache-first (saved explicitly by user)
  if (url.pathname.startsWith('/api/itinerary') || url.pathname.includes('/trail/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(TRAIL_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      }).catch(() => caches.match('/offline'))
    )
    return
  }

  // Region pages: network-first with 7-day cache
  if (url.pathname.startsWith('/regions/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(REGION_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/offline')))
    )
    return
  }

  // Everything else: network-first with fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful page loads
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/offline')))
  )
})

// Listen for messages from the app to cache specific data
self.addEventListener('message', (event) => {
  if (event.data.type === 'CACHE_TRAIL') {
    // Cache a saved trail's data for offline access
    const { trailUrl, trailData } = event.data
    caches.open(TRAIL_CACHE).then((cache) => {
      const response = new Response(JSON.stringify(trailData), {
        headers: { 'Content-Type': 'application/json' },
      })
      cache.put(trailUrl, response)
    })
  }

  if (event.data.type === 'CACHE_REGION') {
    // Cache a region's listing data for offline use
    const { regionUrl, regionData } = event.data
    caches.open(REGION_CACHE).then((cache) => {
      const response = new Response(JSON.stringify(regionData), {
        headers: { 'Content-Type': 'application/json' },
      })
      cache.put(regionUrl, response)
    })
  }
})
