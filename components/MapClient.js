'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect, useState } from 'react'
import { getVerticalUrl, getVerticalBadge, getVerticalLabel, getVerticalBrandColour, getPublicVerticals } from '@/lib/verticalUrl'
import { listingVerticals } from '@/lib/listings/verticalFilter'

const PRIMARY = '#5f8a7e'
const PREMIUM_COLOR = '#c8943a'

// Brand colour lookup — sourced from lib/verticalUrl.js so all surfaces stay
// in sync. The vertical key list (legend + filter chips) is derived per-render
// from the public-vertical registry passed down from the server (see below).
const verticalColor = (key) => getVerticalBrandColour(key) || PRIMARY

// Sub-type labels per vertical — shown as secondary filter pills
const SUB_TYPE_LABELS = {
  sba: {
    winery: 'Winery', brewery: 'Brewery', distillery: 'Distillery',
    cidery: 'Cidery', meadery: 'Meadery', cellar_door: 'Cellar Door',
    sour_brewery: 'Sour Brewery', non_alcoholic: 'Non-Alcoholic',
  },
  collection: {
    museum: 'Museum', gallery: 'Gallery', heritage_site: 'Heritage Site',
    botanical_garden: 'Botanical Garden', cultural_centre: 'Cultural Centre',
  },
  craft: {
    ceramics_clay: 'Ceramics & Clay', visual_art: 'Visual Art',
    jewellery_metalwork: 'Jewellery & Metalwork', textile_fibre: 'Textile & Fibre',
    wood_furniture: 'Wood & Furniture', glass: 'Glass', printmaking: 'Printmaking',
    leathermaker: 'Leatherwork', shoemaker: 'Shoemaking',
  },
  fine_grounds: {
    roaster: 'Roaster', cafe: 'Cafe',
  },
  rest: {
    boutique_hotel: 'Boutique Hotel', guesthouse: 'Guesthouse', bnb: 'B&B',
    farm_stay: 'Farm Stay', glamping: 'Glamping', cottage: 'Cottage',
    self_contained: 'Self Contained',
  },
  field: {
    swimming_hole: 'Swimming Hole', waterfall: 'Waterfall', lookout: 'Lookout',
    gorge: 'Gorge', coastal_walk: 'Coastal Walk', hot_spring: 'Hot Spring',
    cave: 'Cave', national_park: 'National Park',
    wildlife_zoo: 'Wildlife & Zoo', bush_walk: 'Bush Walk',
    botanic_garden: 'Botanic Garden', nature_reserve: 'Nature Reserve',
  },
  corner: {
    bookshop: 'Bookshop', records: 'Records', homewares: 'Homewares',
    stationery: 'Stationery', jewellery: 'Jewellery', toys: 'Toys',
    general: 'General', clothing: 'Clothing', food_drink: 'Food & Drink',
    plants: 'Plants',
  },
  found: {
    vintage_clothing: 'Vintage Clothing', vintage_furniture: 'Vintage Furniture',
    vintage_store: 'Vintage Store', antiques: 'Antiques', op_shop: 'Op Shop',
    books_ephemera: 'Books & Ephemera', art_objects: 'Art & Objects', market: 'Market',
  },
  table: {
    restaurant: 'Restaurant', bakery: 'Bakery', market: 'Market',
    farm_gate: 'Farm Gate', artisan_producer: 'Artisan Producer',
    specialty_retail: 'Specialty Retail', destination: 'Destination',
    cooking_school: 'Cooking School', providore: 'Providore', food_trail: 'Food Trail',
  },
}

const STATES = ['All States', 'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const STATE_BOUNDS = {
  'NSW':  [140.99, -37.51, 153.64, -28.16],
  'VIC':  [140.96, -39.16, 149.97, -33.98],
  'QLD':  [137.99, -29.18, 153.55, -10.68],
  'SA':   [129.00, -38.06, 141.00, -26.00],
  'WA':   [112.92, -35.13, 129.00, -13.69],
  'TAS':  [143.83, -43.65, 148.48, -39.57],
  'NT':   [129.00, -26.00, 138.00, -10.97],
  'ACT':  [148.76, -35.92, 149.40, -35.12],
}

// Mainland + Tasmania. The initial camera and the "All States" reset both
// fit these bounds so the country fills the viewport on any screen size or
// aspect ratio — a fixed centre/zoom either strands Australia in a sea of
// empty ocean on large monitors or crops the coasts on small ones.
const AUSTRALIA_BOUNDS = [[112.7, -43.9], [153.9, -10.4]]

// Zoom-out floor — keeps the map from shrinking to a speck. Deliberately NOT
// a maxBounds cage: on portrait phones, fitting Australia's width means the
// viewport spans far more latitude than any sane cage allows, and Mapbox
// resolves that conflict by force-zooming in and cropping the coasts.
const MIN_ZOOM = 2

function australiaFitPadding(isEmbedded) {
  if (typeof window === 'undefined' || isEmbedded) return 40
  const mobile = window.matchMedia('(max-width: 768px)').matches
  // Desktop top padding clears the overlaid toolbar; mobile clears the tab toggle.
  return mobile
    ? { top: 84, bottom: 48, left: 28, right: 28 }
    : { top: 132, bottom: 64, left: 80, right: 80 }
}

// Reverse of the slug map in app/map/page.js — used to keep the URL in sync
// with the active filters so map views are shareable / refresh-safe.
const SLUG_BY_KEY = {
  sba: 'small-batch', collection: 'collections', craft: 'craft',
  fine_grounds: 'fine-grounds', rest: 'rest', field: 'field',
  corner: 'corner', found: 'found', table: 'table', way: 'way',
}

// Listing names/descriptions are DB content rendered into popup HTML strings.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const placesLabel = (n) => `${n.toLocaleString()} ${n === 1 ? 'place' : 'places'}`

/**
 * MapClient
 *
 * mode='fullscreen' (default) — the network-wide /map page. Locks body scroll,
 *   hides nav/footer, fetches all listings, renders all chrome (filters,
 *   geocoding search, legend, mobile sheet, builder tab toggle).
 *
 * mode='embedded' — for in-page sections (e.g. /place/[slug] "Nearby on
 *   Australian Atlas"). No body lock, no nav/footer hiding, no chrome.
 *   Caller must pass `prefilteredListings` (skips the /api/map fetch) and
 *   may pass `initialBounds` to constrain the view and `highlightListingId`
 *   to render the matching pin distinctly.
 */
export default function MapClient({
  initialVertical = '',
  initialState = '',
  initialCenter = null,  // [lng, lat] — overrides the Australia-overview default
  initialZoom = null,    // number — used with initialCenter
  mode = 'fullscreen',
  prefilteredListings = null,
  initialBounds = null,
  highlightListingId = null,
  publicVerticals = null,
}) {
  const isEmbedded = mode === 'embedded'

  // Legend + filter chips derive from the public-vertical list. Fullscreen
  // /map passes it from the server so the WAY_ATLAS_PUBLIC override is honoured;
  // other callers fall back to the registry default (gated verticals excluded).
  const verticalKeys = publicVerticals || getPublicVerticals()
  const verticalFilters = [{ key: 'all', label: 'All' }, ...verticalKeys.map(k => ({ key: k, label: getVerticalBadge(k) }))]
  const mapContainer = useRef(null)
  const map = useRef(null)
  const popup = useRef(null)
  const hoverTip = useRef(null)

  const [allListings, setAllListings] = useState([])
  // Multi-select vertical filter — empty Set = "all"
  const [selectedVerticals, setSelectedVerticals] = useState(() => {
    if (initialVertical && initialVertical !== 'all') return new Set([initialVertical])
    return new Set()
  })
  const [subTypeFilter, setSubTypeFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState(initialState || 'All States')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('map') // 'map' | 'builder'

  // Geocoding place search state
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState([])
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false)
  const placeSearchRef = useRef(null)

  // Name search dropdown state — typing filters the pins live (as before),
  // and a results list lets the user jump straight to a venue.
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const nameSearchRef = useRef(null)

  const listingsRef = useRef([])
  useEffect(() => { listingsRef.current = allListings }, [allListings])

  // Multi-select vertical toggle
  function toggleVertical(key) {
    setSubTypeFilter('all') // reset sub-type when vertical selection changes
    if (key === 'all') {
      setSelectedVerticals(new Set())
      return
    }
    setSelectedVerticals(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Derived: single-selected vertical for sub-type pills
  const singleSelectedVertical = selectedVerticals.size === 1 ? [...selectedVerticals][0] : null

  // Debounced geocoding search
  useEffect(() => {
    if (!placeQuery || placeQuery.length < 2) { setPlaceResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeQuery)}.json?country=AU&types=country,region,postcode,district,place,locality,neighborhood,address&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`)
        const data = await res.json()
        setPlaceResults(data.features || [])
        setShowPlaceDropdown(true)
      } catch (e) { console.error('Geocoding error:', e) }
    }, 400)
    return () => clearTimeout(timer)
  }, [placeQuery])

  useEffect(() => {
    function handleClickOutside(e) {
      if (placeSearchRef.current && !placeSearchRef.current.contains(e.target)) setShowPlaceDropdown(false)
      if (nameSearchRef.current && !nameSearchRef.current.contains(e.target)) setShowNameDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Jump to a venue picked from the name-search results: fly the camera in
  // and open its full popup. The pin itself is guaranteed visible because the
  // same search string is also the live pin filter.
  function flyToListing(l) {
    if (!map.current || l?.lat == null || l?.lng == null) return
    const coords = [parseFloat(l.lng), parseFloat(l.lat)]
    setShowNameDropdown(false)
    setMobileSheetOpen(false)
    map.current.flyTo({ center: coords, zoom: Math.max(map.current.getZoom(), 12.5), duration: 1400 })
    if (popup.current) {
      popup.current.setLngLat(coords).setHTML(buildPopupHTML(listingToProps(l))).addTo(map.current)
    }
  }

  function getZoomForPlaceType(placeType) {
    const zooms = { country: 4, region: 6, postcode: 9, district: 9, place: 11, locality: 13, neighborhood: 13, address: 15 }
    return zooms[placeType] || 11
  }

  function handlePlaceSelect(feature) {
    const [lng, lat] = feature.center
    const placeType = feature.place_type?.[0] || 'place'
    map.current?.flyTo({ center: [lng, lat], zoom: getZoomForPlaceType(placeType), duration: 1500 })
    setPlaceQuery(feature.place_name)
    setShowPlaceDropdown(false)
  }

  // Lock body scroll and hide footer + nav so the map takes full viewport.
  // Skipped for embedded mode — the map is just a section in a normal page.
  useEffect(() => {
    if (isEmbedded) return
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100dvh'
    // Hide footer — it's rendered by the root layout outside our control
    const footer = document.querySelector('footer')
    if (footer) footer.style.display = 'none'
    // Hide the sticky nav — the map has its own toolbar
    const nav = document.querySelector('nav')
    if (nav) nav.style.display = 'none'
    return () => {
      document.body.style.overflow = ''
      document.body.style.height = ''
      if (footer) footer.style.display = ''
      if (nav) nav.style.display = ''
    }
  }, [isEmbedded])

  // Listings source: embedded callers pass a pre-filtered array; fullscreen
  // mode fetches the full network listing set from /api/map.
  useEffect(() => {
    if (prefilteredListings) {
      setAllListings(prefilteredListings)
      setCount(prefilteredListings.length)
      setLoading(false)
      return
    }
    async function fetchData() {
      try {
        const res = await fetch('/api/map')
        if (!res.ok) throw new Error('fetch failed')
        const { listings: data } = await res.json()
        setAllListings(data || [])
        setCount(data?.length || 0)
      } catch (err) {
        console.error('[map] Fetch error:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [prefilteredListings])

  // Sub-type reset is handled inside toggleVertical()

  // Build map once listings are loaded
  useEffect(() => {
    if (!allListings.length || !mapContainer.current) return
    if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }

    // Cancellation guard for the async import + 'load' callback below. If the
    // effect re-runs (or unmounts) while the import is still in flight, the
    // stale closure must not build a second map — and because the handlers
    // capture the instance `m` (never the live `map.current` ref), a late
    // 'load' can't double-add sources to whichever map is current.
    let cancelled = false
    import('mapbox-gl').then(mapboxgl => {
      if (cancelled || !mapContainer.current) return
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const m = new mapboxgl.default.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        // Default camera fits the whole country to the actual viewport.
        // An explicit centre/zoom (from a "View on full map →" link) wins.
        ...(initialCenter
          ? { center: initialCenter, zoom: initialZoom != null ? initialZoom : 3.8 }
          : { bounds: AUSTRALIA_BOUNDS, fitBoundsOptions: { padding: australiaFitPadding(isEmbedded) } }),
        // Flat utility map: no globe-with-stars at low zoom, no accidental
        // rotation/pitch. The globe treatment stays on the homepage section.
        projection: 'mercator',
        minZoom: MIN_ZOOM,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        // Embedded maps drop the scroll-zoom hijack; mobile users still get
        // pinch + double-tap, desktop users use the +/- nav control.
        scrollZoom: !isEmbedded,
      })
      map.current = m

      m.addControl(new mapboxgl.default.AttributionControl({ compact: true }), 'bottom-left')
      m.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'bottom-right')
      if (!isEmbedded) {
        // Desktop gets a locate button too (mobile keeps its bigger FAB —
        // the control is hidden there via CSS below).
        m.addControl(new mapboxgl.default.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          showUserHeading: false,
        }), 'bottom-right')
      }

      if (initialBounds) {
        m.fitBounds(initialBounds, { padding: 60, animate: false })
      }

      popup.current = new mapboxgl.default.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '280px',
        offset: 12,
      })

      // Lightweight name tooltip for desktop hover — saves a click per pin
      // when scanning an area. pointer-events: none (see CSS) so it can
      // never trap the cursor and flicker.
      hoverTip.current = new mapboxgl.default.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '240px',
        offset: 12,
        className: 'map-hover-tip',
      })
      const hoverEnabled = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

      m.on('load', () => {
        if (cancelled) return
        const filtered = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter, search)

        m.addSource('listings-clustered', {
          type: 'geojson',
          cluster: true,
          clusterMaxZoom: 10,
          clusterMinPoints: 10,
          clusterRadius: 50,
          data: buildGeoJSON(filtered),
        })

        // Clusters
        m.addLayer({
          id: 'clusters', type: 'circle', source: 'listings-clustered',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': ['step', ['get', 'point_count'], '#8AAFA5', 50, PRIMARY, 200, '#3D6B60'],
            'circle-radius': ['step', ['get', 'point_count'], 18, 50, 24, 200, 32],
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.9,
          },
        })
        m.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'listings-clustered',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 13 },
          paint: { 'text-color': '#ffffff' },
        })

        // Standard pins — radius scales with zoom so dots stay visible at the
        // national view and grow into comfortable tap targets up close.
        m.addLayer({
          id: 'pins-basic', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'featured'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4.5, 6, 6, 10, 7, 14, 9],
            'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 1,
          },
        })

        // Featured pins — larger with glow
        m.addLayer({
          id: 'pins-featured-glow', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 14, 10, 15, 14, 17],
            'circle-color': 'transparent', 'circle-stroke-width': 1.5, 'circle-stroke-color': PREMIUM_COLOR, 'circle-stroke-opacity': 0.5, 'circle-opacity': 0,
          },
        })
        m.addLayer({
          id: 'pins-featured', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 6, 9, 10, 10, 14, 12],
            'circle-color': PREMIUM_COLOR, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff', 'circle-opacity': 1,
          },
        })

        // Highlight pin — only used in embedded mode to mark the current
        // listing on the page. Larger ring + dot, on top of standard pins.
        if (highlightListingId) {
          m.addLayer({
            id: 'pin-highlight-ring', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightListingId]],
            paint: { 'circle-radius': 16, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0.45 },
          })
          m.addLayer({
            id: 'pin-highlight', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightListingId]],
            paint: { 'circle-radius': 10, 'circle-color': ['get', 'color'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
          })
        }

        // Click + hover handlers
        const pinLayers = ['pins-basic', 'pins-featured-glow', 'pins-featured']
        if (highlightListingId) pinLayers.push('pin-highlight-ring', 'pin-highlight')
        pinLayers.forEach(layer => {
          m.on('mouseenter', layer, (e) => {
            m.getCanvas().style.cursor = 'pointer'
            if (!hoverEnabled || !e.features?.length) return
            const p = e.features[0].properties
            const sub = p.subTypeLabel && p.subTypeLabel !== 'null' ? p.subTypeLabel : p.verticalLabel
            hoverTip.current.setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(
              `<div style="font-family:system-ui,-apple-system,sans-serif;padding:1px 2px;">
                <div style="font-family:Georgia,serif;font-size:13px;color:#1a1614;line-height:1.25;">${esc(p.name)}</div>
                <div style="font-size:10px;color:#9a8878;margin-top:2px;">${esc(sub)}${p.location && p.location !== 'null' ? ` · ${esc(p.location)}` : ''}</div>
              </div>`
            ).addTo(m)
          })
          m.on('mouseleave', layer, () => {
            m.getCanvas().style.cursor = ''
            hoverTip.current?.remove()
          })
          m.on('click', layer, (e) => {
            const props = e.features[0].properties
            const coords = e.features[0].geometry.coordinates.slice()
            hoverTip.current?.remove()
            // The pin for the current listing (when highlightListingId is
            // set) shows a "You are here" badge instead of a self-linking
            // "View listing →" button — clicking the page you're already on
            // would be a dead end.
            const isCurrent = highlightListingId && props.id === highlightListingId
            popup.current.setLngLat(coords).setHTML(buildPopupHTML(props, { isCurrent })).addTo(m)
          })
        })

        // Dismiss popup on empty click
        m.on('click', (e) => {
          const features = m.queryRenderedFeatures(e.point, { layers: pinLayers })
          if (!features.length && popup.current) popup.current.remove()
        })

        // Cluster click → zoom in
        m.on('click', 'clusters', (e) => {
          const features = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })
          const clusterId = features[0].properties.cluster_id
          m.getSource('listings-clustered').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return
            m.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 })
          })
        })
        m.on('mouseenter', 'clusters', () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', 'clusters', () => { m.getCanvas().style.cursor = '' })

        setMapReady(true)
      })
    })

    return () => {
      cancelled = true
      if (popup.current) popup.current.remove()
      if (hoverTip.current) hoverTip.current.remove()
      if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }
    }
  }, [allListings])

  // Update map source when filters change
  const prevFilterKey = useRef(null)
  useEffect(() => {
    if (!mapReady || !map.current) return
    const filtered = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter, search)
    setCount(filtered.length)
    const source = map.current.getSource('listings-clustered')
    if (source) source.setData(buildGeoJSON(filtered))
    // Close an open popup when the filters actually change — its pin may have
    // just been filtered away, leaving an orphaned card floating on the map.
    const key = [...selectedVerticals].sort().join(',') + '|' + subTypeFilter + '|' + stateFilter
    if (prevFilterKey.current !== null && prevFilterKey.current !== key) popup.current?.remove()
    prevFilterKey.current = key
  }, [allListings, selectedVerticals, subTypeFilter, stateFilter, search, mapReady])

  // Keep vertical/state in the URL so a filtered view survives refresh and
  // can be shared. Only a single-vertical selection maps onto the ?vertical=
  // param (the server only parses one); multi-select just drops it.
  useEffect(() => {
    if (isEmbedded || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const single = selectedVerticals.size === 1 ? [...selectedVerticals][0] : null
    if (single && SLUG_BY_KEY[single]) url.searchParams.set('vertical', SLUG_BY_KEY[single])
    else url.searchParams.delete('vertical')
    if (stateFilter && stateFilter !== 'All States') url.searchParams.set('state', stateFilter)
    else url.searchParams.delete('state')
    window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
  }, [selectedVerticals, stateFilter, isEmbedded])

  // Mapbox canvases don't track size while display:none — recalc when the
  // user switches back from the Build-a-trail tab.
  useEffect(() => {
    if (activeTab === 'map' && map.current) map.current.resize()
  }, [activeTab])

  // Zoom to state — only relevant when the state filter is in play.
  // Skipped on the initial render when initialCenter was supplied, so a
  // "View on full map →" link stays centred on the listing rather than
  // snapping back to the Australia overview.
  const hasUserChangedState = useRef(false)
  useEffect(() => {
    if (!mapReady || !map.current || isEmbedded) return
    if (initialCenter && !hasUserChangedState.current) {
      hasUserChangedState.current = true
      return
    }
    hasUserChangedState.current = true
    if (stateFilter === 'All States') {
      map.current.fitBounds(AUSTRALIA_BOUNDS, { padding: australiaFitPadding(isEmbedded), duration: 800 })
    } else {
      const bounds = STATE_BOUNDS[stateFilter]
      if (bounds) map.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: 800 })
    }
  }, [stateFilter, mapReady, isEmbedded, initialCenter])

  const isAllVerticals = selectedVerticals.size === 0
  const activeFilterCount = (!isAllVerticals ? 1 : 0) + (subTypeFilter !== 'all' ? 1 : 0) + (stateFilter !== 'All States' ? 1 : 0) + (search ? 1 : 0)

  function clearAllFilters() {
    setSelectedVerticals(new Set())
    setSubTypeFilter('all')
    setStateFilter('All States')
    setSearch('')
  }

  // Top name-search matches for the jump-to-venue dropdown. Prefix matches
  // rank above substring matches; capped at 8 rows.
  const nameMatches = (() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    const starts = [], contains = []
    for (const l of allListings) {
      const n = l.name ? l.name.toLowerCase() : ''
      if (n.startsWith(q)) { starts.push(l); if (starts.length >= 8) break }
      else if (n.includes(q) && contains.length < 8) contains.push(l)
    }
    return [...starts, ...contains].slice(0, 8)
  })()

  // Sub-type pills only shown when exactly one vertical is selected
  const currentSubTypes = singleSelectedVertical ? SUB_TYPE_LABELS[singleSelectedVertical] || {} : {}
  const hasSubTypes = Object.keys(currentSubTypes).length > 0

  const rootStyle = isEmbedded
    ? { position: 'relative', width: '100%', height: '100%', background: '#faf8f5' }
    : { position: 'fixed', inset: 0, zIndex: 50, background: '#faf8f5' }

  return (
    <div style={rootStyle}>
      {/* ── TAB TOGGLE: Map / Build a trail (skipped in embedded mode) ── */}
      {!isEmbedded && (
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px 0 0',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'inline-flex', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden',
          pointerEvents: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {[{ key: 'map', label: 'Map' }, { key: 'builder', label: 'Build a trail' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400,
              fontFamily: 'var(--font-sans)', minHeight: 44,
              background: activeTab === tab.key ? PRIMARY : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'var(--color-muted)',
              transition: 'all 0.15s',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>
      )}

      {/* ── BUILDER TAB (iframe) — fullscreen mode only ── */}
      {!isEmbedded && activeTab === 'builder' && (
        <div style={{ position: 'absolute', inset: 0, paddingTop: 42 }}>
          <iframe
            src="/trails/builder?embed=1&tab=builder"
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Trail Builder"
          />
        </div>
      )}

      {/* ── MAP — fills the container ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', display: !isEmbedded && activeTab === 'builder' ? 'none' : 'block' }}>
        {/* ── DESKTOP TOOLBAR (overlays map) — fullscreen mode only ── */}
        {!isEmbedded && (
        <div className="map-desktop-toolbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          {/* Row 1: vertical + state filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '42px 20px 8px', borderBottom: hasSubTypes ? 'none' : '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
            <div ref={nameSearchRef} style={{ position: 'relative' }}>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowNameDropdown(!!e.target.value) }}
                onFocus={() => { if (nameMatches.length) setShowNameDropdown(true) }}
                onKeyDown={e => { if (e.key === 'Enter' && nameMatches.length) flyToListing(nameMatches[0]); if (e.key === 'Escape') setShowNameDropdown(false) }}
                placeholder="Search by name…"
                aria-label="Search venues by name"
                style={{ padding: '6px 12px', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 12, outline: 'none', borderRadius: 2, width: 170, fontFamily: 'var(--font-sans)' }}
              />
              {showNameDropdown && nameMatches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, width: 280, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000, maxHeight: 300, overflowY: 'auto' }}>
                  {nameMatches.map(l => (
                    <button key={l.id} onClick={() => flyToListing(l)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(l.vertical), flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{[getVerticalBadge(l.vertical), l.region, l.state].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Geocoding place search */}
            <div ref={placeSearchRef} style={{ position: 'relative', minWidth: 150, maxWidth: 200 }}>
              <input type="text" placeholder="Search a location..." value={placeQuery}
                onChange={e => { setPlaceQuery(e.target.value); if (!e.target.value) setShowPlaceDropdown(false) }}
                onFocus={() => { if (placeResults.length) setShowPlaceDropdown(true) }}
                onKeyDown={e => { if (e.key === 'Enter' && placeResults.length) handlePlaceSelect(placeResults[0]); if (e.key === 'Escape') setShowPlaceDropdown(false) }}
                aria-label="Search a location"
                style={{ padding: '6px 12px', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 12, outline: 'none', borderRadius: 2, width: '100%', fontFamily: 'var(--font-sans)' }} />
              {showPlaceDropdown && placeResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000, maxHeight: 260, overflowY: 'auto' }}>
                  {placeResults.map(f => (
                    <button key={f.id} onClick={() => handlePlaceSelect(f)} style={{ display: 'block', width: '100%', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: 12, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.3 }}>{f.text}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{f.place_name.replace(f.text + ', ', '')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
            {verticalFilters.map(v => {
              const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
              return (
                <button key={v.key} onClick={() => toggleVertical(v.key)} aria-pressed={active} style={{
                  padding: '5px 12px', borderRadius: 2, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-sans)',
                  background: active ? verticalColor(v.key) : 'rgba(95,138,126,0.1)',
                  color: active ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>{v.label}</button>
              )
            })}
            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
            {STATES.map(s => (
              <button key={s} onClick={() => setStateFilter(s)} aria-pressed={stateFilter === s} style={{
                padding: '5px 9px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: stateFilter === s ? 'rgba(95,138,126,0.15)' : 'transparent',
                color: stateFilter === s ? 'var(--color-ink)' : 'var(--color-muted)', transition: 'all 0.15s',
              }}>{s}</button>
            ))}
            <div role="status" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--color-muted)' }}>
              <span>{loading ? 'Loading…' : placesLabel(count)}</span>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Row 2: sub-type pills (only visible when a vertical is selected) */}
          {hasSubTypes && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px 10px', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', marginRight: 4 }}>Type</span>
              <button onClick={() => setSubTypeFilter('all')} style={{
                padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'transparent',
                color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
              }}>All</button>
              {Object.entries(currentSubTypes).map(([key, label]) => (
                <button key={key} onClick={() => setSubTypeFilter(key)} style={{
                  padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                  cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                  background: subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'transparent',
                  color: subTypeFilter === key ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        )}
        {/* Map canvas */}
        <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

        {/* Loading overlay — the canvas stays blank until pins arrive, so say so */}
        {!isEmbedded && loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '12px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <span className="map-spinner" />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>Loading the atlas…</span>
            </div>
          </div>
        )}

        {/* Empty state — every pin filtered away */}
        {!isEmbedded && !loading && mapReady && count === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', textAlign: 'center', background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '20px 26px', boxShadow: '0 4px 20px rgba(0,0,0,0.10)', maxWidth: 300 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: 'var(--color-ink)', marginBottom: 6 }}>No places match these filters</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 14 }}>Try a different spelling, or widen the category and state filters.</div>
              <button onClick={clearAllFilters} style={{ padding: '8px 18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 2, cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {/* Mobile count chip — the toolbar (and its count) is desktop-only */}
        {!isEmbedded && !mobileSheetOpen && (
          <div className="map-mobile-only" role="status" style={{
            position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 9,
            background: 'rgba(250,248,245,0.95)', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: '4px 12px', pointerEvents: 'none', alignItems: 'center',
            fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-muted)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            {loading ? 'Loading…' : placesLabel(count)}
          </div>
        )}

        {/* Desktop legend — fullscreen mode only */}
        {!isEmbedded && (
        <div className="map-desktop-toolbar" style={{ position: 'absolute', bottom: 40, left: 16, background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 4, zIndex: 5, overflow: 'hidden' }}>
          <button onClick={() => setLegendCollapsed(c => !c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', gap: 24 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>Legend</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" style={{ transform: legendCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {!legendCollapsed && (
            <div style={{ padding: '0 14px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>Atlas Verticals</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {verticalKeys.map(v => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(v), display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{getVerticalBadge(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>Listing Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9a8878', display: 'inline-block' }} /><span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Standard</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: PREMIUM_COLOR, display: 'inline-block' }} /><span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Featured</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── MOBILE FABs — fullscreen mode only ── */}
        {!isEmbedded && (
        <>
        <button className="map-mobile-only" onClick={() => setMobileSheetOpen(o => !o)} style={{
          position: 'absolute', bottom: 100, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: mobileSheetOpen ? PRIMARY : 'rgba(250,248,245,0.97)',
          border: `1px solid ${mobileSheetOpen ? PRIMARY : 'var(--color-border)'}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
        }}>
          {mobileSheetOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeFilterCount > 0 ? PRIMARY : 'var(--color-muted)'} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          }
          {activeFilterCount > 0 && !mobileSheetOpen && (
            <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: PRIMARY, border: '1.5px solid white' }} />
          )}
        </button>

        <button className="map-mobile-only" onClick={() => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12, duration: 1200 })
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000 }
          )
        }} style={{
          position: 'absolute', bottom: 160, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }} aria-label="Use my location">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>

        <button className="map-mobile-only" onClick={() => setMobileLegendOpen(o => !o)} style={{
          position: 'absolute', bottom: 220, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--color-muted)', fontWeight: 600,
        }}>ⓘ</button>

        {/* Mobile legend popover */}
        {mobileLegendOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', bottom: 280, right: 16, zIndex: 10,
            flexDirection: 'column',
            background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>Atlas Verticals</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {verticalKeys.map(v => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(v), display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{getVerticalBadge(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MOBILE BOTTOM SHEET ── */}
        {mobileSheetOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            // .map-mobile-only forces display:flex — without an explicit
            // column direction the sheet's sections lay out side by side.
            flexDirection: 'column',
            background: 'rgba(250,248,245,0.99)', borderTop: '1px solid var(--color-border)',
            borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            padding: '8px 0 32px', maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '4px auto 16px' }} />

            {/* Search */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>Search by name</div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. venue name…"
                aria-label="Search venues by name"
                style={{ width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 13, outline: 'none', borderRadius: 4, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
              {nameMatches.length > 0 && (
                <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                  {nameMatches.slice(0, 5).map(l => (
                    <button key={l.id} onClick={() => flyToListing(l)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', minHeight: 44, background: '#fff', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: verticalColor(l.vertical), flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{[getVerticalBadge(l.vertical), l.region, l.state].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vertical filters */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {verticalFilters.map(v => {
                  const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
                  return (
                    <button key={v.key} onClick={() => toggleVertical(v.key)} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${active ? verticalColor(v.key) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: active ? verticalColor(v.key) : 'transparent',
                      color: active ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                    }}>{v.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Sub-type filters (only when vertical is selected) */}
            {hasSubTypes && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>Type</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => setSubTypeFilter('all')} style={{
                    padding: '10px 16px', borderRadius: 20, minHeight: 44,
                    border: `1px solid ${subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    background: subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'transparent',
                    color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                  }}>All</button>
                  {Object.entries(currentSubTypes).map(([key, label]) => (
                    <button key={key} onClick={() => { setSubTypeFilter(key); setMobileSheetOpen(false) }} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'transparent',
                      color: subTypeFilter === key ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* State filters */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>State</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STATES.map(s => (
                  <button key={s} onClick={() => { setStateFilter(s); setMobileSheetOpen(false) }} style={{
                    padding: '10px 16px', borderRadius: 20, minHeight: 44,
                    border: `1px solid ${stateFilter === s ? PRIMARY : 'var(--color-border)'}`,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    background: stateFilter === s ? PRIMARY : 'transparent',
                    color: stateFilter === s ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                  }}>{s}</button>
                ))}
              </div>
            </div>

            {/* Count + clear */}
            <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span role="status" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)' }}>
                {loading ? 'Loading…' : placesLabel(count)}
              </span>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <style>{`
        .mapboxgl-popup-content { border-radius: 4px !important; padding: 14px 16px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important; border: 1px solid rgba(95,138,126,0.15) !important; background: #faf8f5 !important; }
        .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-popup-close-button { font-size: 18px !important; padding: 4px 8px !important; color: #9a8878 !important; }
        .map-hover-tip { pointer-events: none !important; }
        .map-hover-tip .mapboxgl-popup-content { padding: 8px 11px !important; box-shadow: 0 2px 10px rgba(0,0,0,0.10) !important; }
        .map-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(95,138,126,0.25); border-top-color: #5f8a7e; animation: map-spin 0.8s linear infinite; display: inline-block; flex-shrink: 0; }
        @keyframes map-spin { to { transform: rotate(360deg); } }
        .map-mobile-only { display: none !important; }
        @media (max-width: 768px) {
          .map-desktop-toolbar { display: none !important; }
          .map-mobile-only { display: flex !important; }
          /* Mobile keeps the larger locate FAB; hide the duplicate Mapbox control */
          .mapboxgl-ctrl-group:has(.mapboxgl-ctrl-geolocate) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Helpers ──

function getFiltered(listings, selectedVerticals, subTypeFilter, stateFilter, search) {
  return listings.filter(l => {
    const matchVertical = selectedVerticals.size === 0 || listingVerticals(l).some(v => selectedVerticals.has(v))
    const matchSubType = subTypeFilter === 'all' || l.sub_type === subTypeFilter
    const matchState = stateFilter === 'All States' || l.state === stateFilter
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase())
    return matchVertical && matchSubType && matchState && matchSearch
  })
}

// Shared between the GeoJSON pin source and the search-result fly-to popup,
// so a popup opened either way renders identically.
function listingToProps(l) {
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    verticalLabel: getVerticalBadge(l.vertical),
    verticalSite: getVerticalLabel(l.vertical),
    subTypeLabel: subTypes[l.sub_type] || null,
    color: verticalColor(l.vertical),
    featured: l.is_featured || false,
    location: [l.region, l.state].filter(Boolean).join(', '),
    description: l.description || '',
    url: `/place/${l.slug}`,
  }
}

// `props` is either listingToProps() output or mapbox feature.properties —
// the latter stringifies values, hence the 'null'/'true' string checks.
function buildPopupHTML(props, { isCurrent = false } = {}) {
  const desc = props.description && props.description !== 'null'
    ? (props.description.length > 120 ? props.description.slice(0, 120).trimEnd() + '…' : props.description)
    : ''
  const featuredBadge = props.featured === true || props.featured === 'true'
    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(200,148,58,0.12);border:1px solid rgba(200,148,58,0.3);padding:2px 7px;border-radius:2px;font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${PREMIUM_COLOR};">★ Featured</span>`
    : ''
  const subLabel = props.subTypeLabel && props.subTypeLabel !== 'null'
    ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(95,138,126,0.08);border:1px solid rgba(95,138,126,0.2);padding:3px 9px;border-radius:2px;"><span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b6560;">${esc(props.subTypeLabel)}</span></span>`
    : ''

  // The pin for the current listing (embedded mode) shows a "You are here"
  // badge instead of a self-linking "View listing →" button — clicking the
  // page you're already on would be a dead end.
  const ctaHtml = isCurrent
    ? `<div style="display:block;margin-top:10px;padding:7px 0;text-align:center;background:rgba(95,138,126,0.10);color:${PRIMARY};font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-radius:2px;border:1px dashed rgba(95,138,126,0.35);">You are here</div>`
    : `<a href="${esc(props.url)}" style="display:block;margin-top:10px;padding:7px 0;text-align:center;background:${PRIMARY};color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border-radius:2px;">View listing →</a>`

  return (
    `<div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 2px;max-width:260px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:5px;background:${props.color}18;border:1px solid ${props.color}33;padding:3px 9px;border-radius:2px;">
          <span style="width:5px;height:5px;border-radius:50%;background:${props.color};display:inline-block;"></span>
          <span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${props.color};">${esc(props.verticalLabel)}</span>
        </span>${subLabel}${featuredBadge}
      </div>
      <div style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1a1614;margin-bottom:3px;letter-spacing:-0.01em;line-height:1.2;">${esc(props.name)}</div>
      <div style="font-size:11px;color:#9a8878;margin-bottom:${desc ? 8 : 10}px;">${esc(props.location)}</div>
      ${desc ? `<div style="font-size:12px;color:#5a4e45;line-height:1.5;margin-bottom:10px;">${esc(desc)}</div>` : ''}
      ${ctaHtml}
    </div>`
  )
}

function buildGeoJSON(listings) {
  return {
    type: 'FeatureCollection',
    features: listings.filter(l => l.lat && l.lng && !l.address_on_request).map(l => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(l.lng), parseFloat(l.lat)] },
      properties: listingToProps(l),
    })),
  }
}
