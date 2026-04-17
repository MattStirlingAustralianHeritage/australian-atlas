'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect, useState } from 'react'
import { getVerticalUrl, getVerticalBadge, getVerticalLabel } from '@/lib/verticalUrl'

const PRIMARY = '#5f8a7e'
const PREMIUM_COLOR = '#c8943a'

const VERTICAL_COLORS = {
  sba:          '#C49A3C',
  collection:   '#7A6B8A',
  craft:        '#C1603A',
  fine_grounds: '#8A7055',
  rest:         '#5A8A9A',
  field:        '#4A7C59',
  corner:       '#5F8A7E',
  found:        '#D4956A',
  table:        '#C4634F',
}

const VERTICAL_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sba', label: 'Small Batch' },
  { key: 'craft', label: 'Craft' },
  { key: 'collection', label: 'Culture' },
  { key: 'fine_grounds', label: 'Fine Grounds' },
  { key: 'rest', label: 'Rest' },
  { key: 'field', label: 'Field' },
  { key: 'corner', label: 'Corner' },
  { key: 'found', label: 'Found' },
  { key: 'table', label: 'Table' },
]

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
  },
  corner: {
    bookshop: 'Bookshop', records: 'Records', homewares: 'Homewares',
    stationery: 'Stationery', jewellery: 'Jewellery', toys: 'Toys',
    general: 'General', clothing: 'Clothing', food_drink: 'Food & Drink',
    plants: 'Plants', art_supplies: 'Art Supplies',
  },
  found: {
    vintage_clothing: 'Vintage Clothing', vintage_furniture: 'Vintage Furniture',
    antiques: 'Antiques', op_shop: 'Op Shop', books_ephemera: 'Books & Ephemera',
    art_objects: 'Art & Objects', market: 'Market',
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

export default function MapClient({ initialVertical = '', initialState = '' }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const popup = useRef(null)

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
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // Lock body scroll and hide footer + nav so the map takes full viewport
  useEffect(() => {
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
  }, [])

  // Fetch all listings from dedicated map API (paginated server-side)
  useEffect(() => {
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
  }, [])

  // Sub-type reset is handled inside toggleVertical()

  // Build map once listings are loaded
  useEffect(() => {
    if (!allListings.length || !mapContainer.current) return
    if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }

    import('mapbox-gl').then(mapboxgl => {
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      map.current = new mapboxgl.default.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        center: [134, -27],
        zoom: 3.8,
        attributionControl: false,
      })

      map.current.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'bottom-right')

      popup.current = new mapboxgl.default.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '280px',
        offset: 12,
      })

      map.current.on('load', () => {
        const filtered = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter, search)

        map.current.addSource('listings-clustered', {
          type: 'geojson',
          cluster: true,
          clusterMaxZoom: 10,
          clusterMinPoints: 10,
          clusterRadius: 50,
          data: buildGeoJSON(filtered),
        })

        // Clusters
        map.current.addLayer({
          id: 'clusters', type: 'circle', source: 'listings-clustered',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': ['step', ['get', 'point_count'], '#8AAFA5', 50, PRIMARY, 200, '#3D6B60'],
            'circle-radius': ['step', ['get', 'point_count'], 18, 50, 24, 200, 32],
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.9,
          },
        })
        map.current.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'listings-clustered',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 13 },
          paint: { 'text-color': '#ffffff' },
        })

        // Standard pins
        map.current.addLayer({
          id: 'pins-basic', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'featured'], true]],
          paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 1 },
        })

        // Featured pins — larger with glow
        map.current.addLayer({
          id: 'pins-featured-glow', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
          paint: { 'circle-radius': 14, 'circle-color': 'transparent', 'circle-stroke-width': 1.5, 'circle-stroke-color': PREMIUM_COLOR, 'circle-stroke-opacity': 0.5, 'circle-opacity': 0 },
        })
        map.current.addLayer({
          id: 'pins-featured', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
          paint: { 'circle-radius': 9, 'circle-color': PREMIUM_COLOR, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff', 'circle-opacity': 1 },
        })

        // Click + hover handlers
        const pinLayers = ['pins-basic', 'pins-featured-glow', 'pins-featured']
        pinLayers.forEach(layer => {
          map.current.on('mouseenter', layer, () => { map.current.getCanvas().style.cursor = 'pointer' })
          map.current.on('mouseleave', layer, () => { map.current.getCanvas().style.cursor = '' })
          map.current.on('click', layer, (e) => {
            const props = e.features[0].properties
            const coords = e.features[0].geometry.coordinates.slice()
            const desc = props.description && props.description !== 'null'
              ? (props.description.length > 120 ? props.description.slice(0, 120).trimEnd() + '…' : props.description)
              : ''
            const featuredBadge = props.featured === true || props.featured === 'true'
              ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(200,148,58,0.12);border:1px solid rgba(200,148,58,0.3);padding:2px 7px;border-radius:2px;font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${PREMIUM_COLOR};">★ Featured</span>`
              : ''
            const subLabel = props.subTypeLabel && props.subTypeLabel !== 'null'
              ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(95,138,126,0.08);border:1px solid rgba(95,138,126,0.2);padding:3px 9px;border-radius:2px;"><span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b6560;">${props.subTypeLabel}</span></span>`
              : ''

            popup.current.setLngLat(coords).setHTML(
              `<div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 2px;max-width:260px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                  <span style="display:inline-flex;align-items:center;gap:5px;background:${props.color}18;border:1px solid ${props.color}33;padding:3px 9px;border-radius:2px;">
                    <span style="width:5px;height:5px;border-radius:50%;background:${props.color};display:inline-block;"></span>
                    <span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${props.color};">${props.verticalLabel}</span>
                  </span>${subLabel}${featuredBadge}
                </div>
                <div style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1a1614;margin-bottom:3px;letter-spacing:-0.01em;line-height:1.2;">${props.name}</div>
                <div style="font-size:11px;color:#9a8878;margin-bottom:${desc ? 8 : 10}px;">${props.location}</div>
                ${desc ? `<div style="font-size:12px;color:#5a4e45;line-height:1.5;margin-bottom:10px;">${desc}</div>` : ''}
                <a href="${props.url}" style="display:block;margin-top:10px;padding:7px 0;text-align:center;background:${PRIMARY};color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border-radius:2px;">View listing →</a>
              </div>`
            ).addTo(map.current)
          })
        })

        // Dismiss popup on empty click
        map.current.on('click', (e) => {
          const features = map.current.queryRenderedFeatures(e.point, { layers: pinLayers })
          if (!features.length && popup.current) popup.current.remove()
        })

        // Cluster click → zoom in
        map.current.on('click', 'clusters', (e) => {
          const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] })
          const clusterId = features[0].properties.cluster_id
          map.current.getSource('listings-clustered').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return
            map.current.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 1 })
          })
        })
        map.current.on('mouseenter', 'clusters', () => { map.current.getCanvas().style.cursor = 'pointer' })
        map.current.on('mouseleave', 'clusters', () => { map.current.getCanvas().style.cursor = '' })

        setMapReady(true)
      })
    })

    return () => {
      if (popup.current) popup.current.remove()
      if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }
    }
  }, [allListings])

  // Update map source when filters change
  useEffect(() => {
    if (!mapReady || !map.current) return
    const filtered = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter, search)
    setCount(filtered.length)
    const source = map.current.getSource('listings-clustered')
    if (source) source.setData(buildGeoJSON(filtered))
  }, [allListings, selectedVerticals, subTypeFilter, stateFilter, search, mapReady])

  // Zoom to state
  useEffect(() => {
    if (!mapReady || !map.current) return
    if (stateFilter === 'All States') {
      map.current.flyTo({ center: [134, -27], zoom: 3.8, duration: 800 })
    } else {
      const bounds = STATE_BOUNDS[stateFilter]
      if (bounds) map.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: 800 })
    }
  }, [stateFilter, mapReady])

  const isAllVerticals = selectedVerticals.size === 0
  const activeFilterCount = (!isAllVerticals ? 1 : 0) + (subTypeFilter !== 'all' ? 1 : 0) + (stateFilter !== 'All States' ? 1 : 0) + (search ? 1 : 0)

  // Sub-type pills only shown when exactly one vertical is selected
  const currentSubTypes = singleSelectedVertical ? SUB_TYPE_LABELS[singleSelectedVertical] || {} : {}
  const hasSubTypes = Object.keys(currentSubTypes).length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#faf8f5' }}>
      {/* ── TAB TOGGLE: Map / Build a trail ── */}
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

      {/* ── BUILDER TAB (iframe) ── */}
      {activeTab === 'builder' && (
        <div style={{ position: 'absolute', inset: 0, paddingTop: 42 }}>
          <iframe
            src="/trails/builder?embed=1&tab=builder"
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Trail Builder"
          />
        </div>
      )}

      {/* ── MAP (fills entire viewport, nav is hidden) ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', display: activeTab === 'map' ? 'block' : 'none' }}>
        {/* ── DESKTOP TOOLBAR (overlays map) ── */}
        <div className="map-desktop-toolbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          {/* Row 1: vertical + state filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '42px 20px 8px', borderBottom: hasSubTypes ? 'none' : '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ padding: '6px 12px', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 12, outline: 'none', borderRadius: 2, width: 170, fontFamily: 'var(--font-sans)' }}
            />
            {/* Geocoding place search */}
            <div ref={placeSearchRef} style={{ position: 'relative', minWidth: 150, maxWidth: 200 }}>
              <input type="text" placeholder="Search a location..." value={placeQuery}
                onChange={e => { setPlaceQuery(e.target.value); if (!e.target.value) setShowPlaceDropdown(false) }}
                onFocus={() => { if (placeResults.length) setShowPlaceDropdown(true) }}
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
            {VERTICAL_FILTERS.map(v => {
              const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
              return (
                <button key={v.key} onClick={() => toggleVertical(v.key)} style={{
                  padding: '5px 12px', borderRadius: 2, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-sans)',
                  background: active ? (VERTICAL_COLORS[v.key] || PRIMARY) : 'rgba(95,138,126,0.1)',
                  color: active ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>{v.label}</button>
              )
            })}
            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
            {STATES.map(s => (
              <button key={s} onClick={() => setStateFilter(s)} style={{
                padding: '5px 9px', borderRadius: 2, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: stateFilter === s ? 'rgba(95,138,126,0.15)' : 'transparent',
                color: stateFilter === s ? 'var(--color-ink)' : 'var(--color-muted)', transition: 'all 0.15s',
              }}>{s}</button>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-muted)' }}>
              {loading ? 'Loading…' : `${count.toLocaleString()} listings`}
            </div>
          </div>

          {/* Row 2: sub-type pills (only visible when a vertical is selected) */}
          {hasSubTypes && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px 10px', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', marginRight: 4 }}>Type</span>
              <button onClick={() => setSubTypeFilter('all')} style={{
                padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === 'all' ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'var(--color-border)'}`,
                cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: subTypeFilter === 'all' ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'transparent',
                color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
              }}>All</button>
              {Object.entries(currentSubTypes).map(([key, label]) => (
                <button key={key} onClick={() => setSubTypeFilter(key)} style={{
                  padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === key ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'var(--color-border)'}`,
                  cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                  background: subTypeFilter === key ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'transparent',
                  color: subTypeFilter === key ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        {/* Map canvas */}
        <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

        {/* Desktop legend */}
        <div className="map-desktop-toolbar" style={{ position: 'absolute', bottom: 40, left: 16, background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 4, zIndex: 5, overflow: 'hidden' }}>
          <button onClick={() => setLegendCollapsed(c => !c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', gap: 24 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>Legend</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" style={{ transform: legendCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {!legendCollapsed && (
            <div style={{ padding: '0 14px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>Atlas Verticals</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {Object.entries(VERTICAL_COLORS).map(([v, color]) => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
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

        {/* ── MOBILE FABs ── */}
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
            background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>Atlas Verticals</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {Object.entries(VERTICAL_COLORS).map(([v, color]) => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
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
            background: 'rgba(250,248,245,0.99)', borderTop: '1px solid var(--color-border)',
            borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            padding: '8px 0 32px', maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '4px auto 16px' }} />

            {/* Search */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>Search by name</div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. venue name…"
                style={{ width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 13, outline: 'none', borderRadius: 4, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
            </div>

            {/* Vertical filters */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {VERTICAL_FILTERS.map(v => {
                  const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
                  return (
                    <button key={v.key} onClick={() => toggleVertical(v.key)} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${active ? (VERTICAL_COLORS[v.key] || PRIMARY) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: active ? (VERTICAL_COLORS[v.key] || PRIMARY) : 'transparent',
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
                    border: `1px solid ${subTypeFilter === 'all' ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'var(--color-border)'}`,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    background: subTypeFilter === 'all' ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'transparent',
                    color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                  }}>All</button>
                  {Object.entries(currentSubTypes).map(([key, label]) => (
                    <button key={key} onClick={() => { setSubTypeFilter(key); setMobileSheetOpen(false) }} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${subTypeFilter === key ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: subTypeFilter === key ? (VERTICAL_COLORS[singleSelectedVertical] || PRIMARY) : 'transparent',
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
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)' }}>
                {loading ? 'Loading…' : `${count.toLocaleString()} listings`}
              </span>
              {activeFilterCount > 0 && (
                <button onClick={() => { setSelectedVerticals(new Set()); setSubTypeFilter('all'); setStateFilter('All States'); setSearch('') }}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .mapboxgl-popup-content { border-radius: 4px !important; padding: 14px 16px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important; border: 1px solid rgba(95,138,126,0.15) !important; background: #faf8f5 !important; }
        .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-popup-close-button { font-size: 18px !important; padding: 4px 8px !important; color: #9a8878 !important; }
        .map-mobile-only { display: none !important; }
        @media (max-width: 768px) {
          .map-desktop-toolbar { display: none !important; }
          .map-mobile-only { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

// ── Helpers ──

function getFiltered(listings, selectedVerticals, subTypeFilter, stateFilter, search) {
  return listings.filter(l => {
    const matchVertical = selectedVerticals.size === 0 || selectedVerticals.has(l.vertical)
    const matchSubType = subTypeFilter === 'all' || l.sub_type === subTypeFilter
    const matchState = stateFilter === 'All States' || l.state === stateFilter
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase())
    return matchVertical && matchSubType && matchState && matchSearch
  })
}

function buildGeoJSON(listings) {
  return {
    type: 'FeatureCollection',
    features: listings.filter(l => l.lat && l.lng && !l.address_on_request).map(l => {
      const color = VERTICAL_COLORS[l.vertical] || PRIMARY
      const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [parseFloat(l.lng), parseFloat(l.lat)] },
        properties: {
          id: l.id,
          name: l.name,
          slug: l.slug,
          vertical: l.vertical,
          verticalLabel: getVerticalBadge(l.vertical),
          verticalSite: getVerticalLabel(l.vertical),
          subTypeLabel: subTypes[l.sub_type] || null,
          color,
          featured: l.is_featured || false,
          location: [l.region, l.state].filter(Boolean).join(', '),
          description: l.description || '',
          url: `/place/${l.slug}`,
        },
      }
    }),
  }
}
