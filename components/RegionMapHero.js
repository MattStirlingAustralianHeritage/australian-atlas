'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ATLAS_PAPER_STYLE, ATLAS_LABEL_ROOF } from '@/lib/map/atlasPaperStyle'
import { attachDonutClusters } from '@/lib/map/donutClusters'
import { VERTICAL_ACCENTS, getVerticalBadge } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import {
  annotateDisplayGeometry, displayCoords, tokenizeQuery, matchesPinQuery,
  requiredSubtypes, passesCategory, SUBTYPE_WORD_INDEX, escHtml,
} from '@/lib/map/pinFilter'

const verticalColor = (v) => VERTICAL_ACCENTS[v] || '#888'

// Pin GeoJSON — carries the props the layers, labels and popups read.
function buildGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: points
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: displayCoords(p) },
        properties: {
          id: p.id,
          name: p.name || '',
          slug: p.slug || '',
          vertical: p.vertical,
          sub_type: p.sub_type || '',
          color: verticalColor(p.vertical),
          featured: !!p.is_featured,
          labelShow: p._labelShow !== false,
        },
      })),
  }
}

/**
 * Interactive Atlas Paper hero for region pages.
 *
 * Same cartography + donut clusters as the network /map, but scoped to one
 * region and fitted to its venues. A live filter box lights the pins that
 * match a keyword (instant local tokens ∪ the semantic /api/search pool scoped
 * to this region) and greys the rest; pressing Enter opens the full Search 3.0
 * results page for the region.
 */
export default function RegionMapHero({ points, regionName, stateName, regionSlug, centerLat, centerLng, zoom }) {
  const router = useRouter()
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const donutsRef = useRef(null)
  const dataRef = useRef([])          // annotated points (with _hay / _labelShow / _dlng…)
  const readyRef = useRef(false)
  const hoveredRef = useRef(null)
  const semanticRef = useRef(null)    // { query, ids:Set }
  const appliedRef = useRef('')       // the query the sources currently reflect

  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')     // debounced query
  const [semLoading, setSemLoading] = useState(false)
  const [matchCount, setMatchCount] = useState(null)

  const hasPoints = points?.length > 0

  // Split the annotated pool into matches (coloured) + rest (greyed), push to
  // the two sources, refresh the donuts, and report the count. Pure re-read of
  // refs so it can run from the load handler or any filter change.
  const applyFilter = useCallback(() => {
    const map = mapInstance.current
    if (!map || !readyRef.current) return
    const src = map.getSource('region-clustered')
    const dim = map.getSource('region-dimmed')
    if (!src || !dim) return

    const q = appliedRef.current
    const tokens = tokenizeQuery(q)
    const base = dataRef.current

    if (tokens.length === 0) {
      src.setData(buildGeoJSON(base))
      dim.setData({ type: 'FeatureCollection', features: [] })
      donutsRef.current?.invalidate()
      setMatchCount(null)
      return
    }

    const sem = semanticRef.current && semanticRef.current.query === q ? semanticRef.current : null
    const reqSub = requiredSubtypes(tokens)
    const catTokens = tokens.filter(t => SUBTYPE_WORD_INDEX[t])
    const isMatch = (l) => passesCategory(l, reqSub, catTokens) &&
      (matchesPinQuery(l, tokens) || (sem !== null && sem.ids.has(l.id)))

    const matches = base.filter(isMatch)
    const rest = base.filter(l => !isMatch(l))

    src.setData(buildGeoJSON(matches))
    dim.setData(buildGeoJSON(rest))
    donutsRef.current?.invalidate()
    setMatchCount(matches.length)
  }, [])

  // ── Build the map once for the given point set ──
  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !mapRef.current) return

      // Headless / hidden-tab preview never fires rAF, so mapbox-gl stalls and
      // the style never parses. Dev-only shim; prod untouched.
      if (process.env.NODE_ENV !== 'production' && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        const nativeRaf = window.requestAnimationFrame?.bind(window)
        if (nativeRaf) {
          let shimming = true
          document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') shimming = false }, { once: true })
          window.requestAnimationFrame = (cb) => shimming ? setTimeout(() => cb(performance.now()), 33) : nativeRaf(cb)
        }
      }

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const annotated = hasPoints ? annotateDisplayGeometry(points) : []
      dataRef.current = annotated

      const opts = {
        container: mapRef.current,
        style: ATLAS_PAPER_STYLE,
        attributionControl: false,
        interactive: true,
        cooperativeGestures: false,
      }
      if (hasPoints && annotated.length > 1) {
        const lngs = annotated.map(p => p._dlng ?? p.lng)
        const lats = annotated.map(p => p._dlat ?? p.lat)
        opts.bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
        opts.fitBoundsOptions = { padding: { top: 70, bottom: 60, left: 60, right: 60 }, maxZoom: 12 }
      } else if (hasPoints && annotated.length === 1) {
        opts.center = [annotated[0]._dlng ?? annotated[0].lng, annotated[0]._dlat ?? annotated[0].lat]
        opts.zoom = 11
      } else if (centerLat && centerLng) {
        opts.center = [centerLng, centerLat]
        opts.zoom = (zoom || 9) - 1
      } else {
        opts.center = [134, -28]; opts.zoom = 4
      }

      const map = new mapboxgl.Map(opts)
      mapInstance.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') window.__regionMap = map

      map.on('load', () => {
        if (cancelled) return
        if (!hasPoints) { readyRef.current = true; return }

        // Only the verticals actually present get a cluster accumulator.
        const presentVerticals = [...new Set(annotated.map(p => p.vertical))]
        const clusterProperties = {}
        for (const k of presentVerticals) {
          clusterProperties[k] = ['+', ['case', ['==', ['get', 'vertical'], k], 1, 0]]
        }

        map.addSource('region-clustered', {
          type: 'geojson',
          cluster: true,
          clusterMaxZoom: 12,
          clusterMinPoints: 4,
          clusterRadius: 46,
          clusterProperties,
          promoteId: 'id',
          data: buildGeoJSON(annotated),
        })
        map.addSource('region-dimmed', {
          type: 'geojson',
          cluster: false,
          promoteId: 'id',
          data: { type: 'FeatureCollection', features: [] },
        })

        const unclustered = ['!', ['has', 'point_count']]

        // Greyed non-matches (only during an active filter).
        map.addLayer({
          id: 'region-pins-dimmed',
          type: 'circle',
          source: 'region-dimmed',
          paint: {
            'circle-radius': 4,
            'circle-color': '#B4AE9E',
            'circle-opacity': 0.5,
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(255,255,255,0.7)',
          },
        }, ATLAS_LABEL_ROOF)

        // Hover halo (feature-state driven).
        map.addLayer({
          id: 'region-pins-halo',
          type: 'circle',
          source: 'region-clustered',
          filter: unclustered,
          paint: {
            'circle-radius': ['case', ['boolean', ['get', 'featured'], false], 15, 13],
            'circle-color': ['get', 'color'],
            'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0],
          },
        }, ATLAS_LABEL_ROOF)

        // Venue pins, coloured by vertical (featured a touch larger).
        map.addLayer({
          id: 'region-pins',
          type: 'circle',
          source: 'region-clustered',
          filter: unclustered,
          paint: {
            'circle-radius': ['case', ['boolean', ['get', 'featured'], false], 8, 6],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.95,
            'circle-stroke-width': ['case', ['boolean', ['get', 'featured'], false], 2.5, 1.8],
            'circle-stroke-color': '#FBF9F4',
          },
        }, ATLAS_LABEL_ROOF)

        // Names at street zoom, deduped by _labelShow.
        map.addLayer({
          id: 'region-pin-labels',
          type: 'symbol',
          source: 'region-clustered',
          filter: ['all', unclustered, ['==', ['get', 'labelShow'], true]],
          minzoom: 10.5,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10.5, 15, 13],
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-max-width': 9,
            'text-padding': 6,
            'text-optional': true,
          },
          paint: {
            'text-color': '#3E3A33',
            'text-halo-color': 'rgba(251,249,244,0.95)',
            'text-halo-width': 1.4,
          },
        })

        // Donut clusters — vertical mix per cluster.
        donutsRef.current = attachDonutClusters(mapboxgl, map, 'region-clustered', {
          segments: presentVerticals.map(k => ({ key: k, color: verticalColor(k) })),
          onClusterClick: (clusterId, coords) => {
            map.getSource('region-clustered').getClusterExpansionZoom(clusterId, (err, z) => {
              if (err) return
              map.easeTo({ center: coords, zoom: z + 0.4, duration: 600, padding: 40 })
            })
          },
        })

        // Hover feature-state.
        map.on('mousemove', 'region-pins', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const id = e.features[0].id
          if (hoveredRef.current === id) return
          if (hoveredRef.current != null) map.setFeatureState({ source: 'region-clustered', id: hoveredRef.current }, { hover: false })
          hoveredRef.current = id
          map.setFeatureState({ source: 'region-clustered', id }, { hover: true })
        })
        map.on('mouseleave', 'region-pins', () => {
          map.getCanvas().style.cursor = ''
          if (hoveredRef.current != null) map.setFeatureState({ source: 'region-clustered', id: hoveredRef.current }, { hover: false })
          hoveredRef.current = null
        })

        // Pin popup → /place/[slug].
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 15, maxWidth: '250px' })
        map.on('click', 'region-pins', (e) => {
          const f = e.features[0].properties
          const color = f.color || '#888'
          const subLabel = (SUB_TYPE_LABELS[f.vertical] || {})[f.sub_type] || getVerticalBadge(f.vertical)
          const url = f.slug ? `/place/${f.slug}` : '#'
          popup.setLngLat(e.lngLat).setHTML(
            `<div style="font-family:var(--font-body,system-ui);padding:2px 0;">
              <div style="font-family:var(--font-display,Georgia);font-size:15px;color:#1C1A17;margin-bottom:3px;">${escHtml(f.name)}</div>
              <div style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${color};margin-bottom:7px;">${escHtml(subLabel)}</div>
              <a href="${url}" style="font-size:12px;color:${color};text-decoration:none;font-weight:500;">View place &rarr;</a>
            </div>`
          ).addTo(map)
        })

        readyRef.current = true
        appliedRef.current = ''
        applyFilter()
      })
    })

    return () => {
      cancelled = true
      readyRef.current = false
      donutsRef.current?.detach()
      donutsRef.current = null
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
    // Rebuild only when the point set identity changes (region navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  // Height change → resize the existing map, never rebuild.
  useEffect(() => {
    const t = setTimeout(() => mapInstance.current?.resize(), 320)
    return () => clearTimeout(t)
  }, [expanded])

  // Debounce the raw input into the applied query.
  useEffect(() => {
    const t = setTimeout(() => setApplied(query.trim()), 280)
    return () => clearTimeout(t)
  }, [query])

  // Applied query changed → refresh semantic pool (region-scoped) + re-filter.
  useEffect(() => {
    appliedRef.current = applied
    applyFilter()

    if (applied.length < 3) {
      semanticRef.current = null
      setSemLoading(false)
      return
    }

    const ctrl = new AbortController()
    setSemLoading(true)
    const params = new URLSearchParams({ q: applied, limit: '120' })
    if (regionSlug) params.set('region', regionSlug)
    fetch(`/api/search?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data.pins)) return
        semanticRef.current = { query: applied, ids: new Set(data.pins.map(p => p.id)) }
        setSemLoading(false)
        applyFilter()
      })
      .catch(() => { /* fail open to local-only */ })
      .finally(() => { if (!ctrl.signal.aborted) setSemLoading(false) })

    return () => ctrl.abort()
  }, [applied, regionSlug, applyFilter])

  const submitFull = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    const p = new URLSearchParams({ q })
    // The region NAME resolves the same as the slug but reads cleanly as the
    // scope chip on /search ("Central Victoria", not "central-victoria").
    if (regionName) p.set('region', regionName)
    router.push(`/search?${p}`)
  }

  const busy = semLoading || query.trim() !== applied
  const showStatus = applied.length > 0
  const statusText = busy
    ? 'Searching…'
    : matchCount === 0
      ? 'No matches — press Enter to search all'
      : matchCount != null
        ? `${matchCount} ${matchCount === 1 ? 'place' : 'places'}`
        : ''

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: expanded ? '640px' : 'clamp(320px, 46vh, 480px)',
          transition: 'height 0.3s ease',
          background: '#F1EADB',
        }}
      />

      {/* ── Region-scoped search / filter ── */}
      {hasPoints && (
        <form
          onSubmit={submitFull}
          style={{
            position: 'absolute', top: '14px', left: '14px', zIndex: 6,
            width: 'min(380px, calc(100% - 96px))',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(251,249,244,0.94)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(62,58,51,0.14)',
              borderRadius: '11px',
              padding: '9px 12px',
              boxShadow: '0 4px 18px rgba(40,30,15,0.14)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
              <circle cx="11" cy="11" r="7" stroke="#3E3A33" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="#3E3A33" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${regionName}…`}
              aria-label={`Search ${regionName} — try a category like wineries or coffee`}
              enterKeyHint="search"
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: '13.5px', fontWeight: 400, color: '#2D2A26',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{
                  flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: '#8C8272', fontSize: '17px', lineHeight: 1, padding: '0 2px',
                }}
              >
                &times;
              </button>
            )}
          </div>
          {showStatus && (
            <div
              style={{
                marginTop: '7px', display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontFamily: 'var(--font-body)', fontSize: '11.5px', fontWeight: 500,
                color: matchCount === 0 && !busy ? '#B0503A' : '#4A6B52',
                background: 'rgba(251,249,244,0.9)', backdropFilter: 'blur(8px)',
                padding: '3px 9px', borderRadius: '100px', boxShadow: '0 1px 6px rgba(40,30,15,0.1)',
              }}
            >
              {statusText}
            </div>
          )}
        </form>
      )}

      {/* Region name overlay */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(20,18,14,0.5) 0%, rgba(20,18,14,0.12) 45%, transparent 100%)',
          padding: 'clamp(1.25rem, 3vw, 2.5rem)',
        }}
      >
        <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block', fontFamily: 'var(--font-body)', fontWeight: 500,
              fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff',
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
              padding: '0.25rem 0.625rem', borderRadius: '100px', marginBottom: '0.625rem',
            }}
          >
            {stateName}
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', color: '#fff', lineHeight: 1.1,
              margin: 0, textShadow: '0 2px 14px rgba(0,0,0,0.4)',
            }}
          >
            {regionName}
          </h1>
        </div>
      </div>

      {/* Expand / collapse toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          position: 'absolute', bottom: '12px', right: '12px',
          fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
          padding: '6px 12px', borderRadius: '6px', border: 'none',
          background: 'rgba(251,249,244,0.94)', color: '#2D2A26', cursor: 'pointer',
          boxShadow: '0 1px 6px rgba(40,30,15,0.18)', zIndex: 5,
        }}
      >
        {expanded ? 'Collapse map' : 'Expand map'}
      </button>
    </div>
  )
}
