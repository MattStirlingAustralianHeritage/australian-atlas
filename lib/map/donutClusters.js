/**
 * Donut cluster markers — clusters rendered as small donut charts whose
 * segments show the mix of Atlas verticals inside, replacing anonymous
 * count bubbles. Follows the official Mapbox "display HTML clusters"
 * pattern: a pooled dictionary of HTML markers keyed by cluster_id,
 * diffed against the viewport on each render so only visible clusters
 * ever exist in the DOM.
 *
 * The source must be created with a `clusterProperties` entry per segment
 * key (a ['+', ['case', …]] accumulator counting that vertical's points).
 *
 * attachDonutClusters(map, sourceId, opts) → { invalidate, detach }
 *   - invalidate(): drop every cached marker (call straight after
 *     source.setData — cluster ids and mixes change with the data).
 *   - detach(): remove handlers + markers (map teardown).
 */

// Donut segment path (two arcs) — adapted from the official example.
function donutSegment(start, end, r, r0, color) {
  if (end - start === 1) end -= 0.00001
  const a0 = 2 * Math.PI * (start - 0.25)
  const a1 = 2 * Math.PI * (end - 0.25)
  const x0 = Math.cos(a0), y0 = Math.sin(a0)
  const x1 = Math.cos(a1), y1 = Math.sin(a1)
  const largeArc = end - start > 0.5 ? 1 : 0
  return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${r + r * y0} A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1} L ${r + r0 * x1} ${r + r0 * y1} A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${r + r0 * y0}" fill="${color}"/>`
}

function abbreviate(n) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function buildDonutElement(props, segments) {
  const counts = segments.map(s => ({ ...s, n: props[s.key] || 0 })).filter(s => s.n > 0)
  const total = props.point_count || counts.reduce((a, s) => a + s.n, 0) || 1

  // Radius steps with cluster size — matches the old circle-step scale.
  const r = total >= 500 ? 28 : total >= 150 ? 24 : total >= 40 ? 20 : 17
  const r0 = r - 5 // donut ring thickness
  const w = r * 2

  let offsets = 0
  let paths = ''
  for (const s of counts) {
    paths += donutSegment(offsets / total, (offsets + s.n) / total, r, r0, s.color)
    offsets += s.n
  }

  const fontSize = r >= 28 ? 15 : r >= 24 ? 14 : 12
  // The OUTER div is the marker root: mapbox repositions it with an inline
  // `transform` every frame, so it must carry no CSS transition — a transition
  // there animates every pan-frame reposition and the donuts swim behind the
  // canvas (and new markers fly in from the corner). Hover scale lives on the
  // INNER .atlas-donut element instead.
  const el = document.createElement('div')
  el.innerHTML =
    `<div class="atlas-donut" style="width:${w}px;height:${w}px;">
      <svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" style="display:block;">
        <circle cx="${r}" cy="${r}" r="${r0}" fill="#FBF9F4"/>
        ${paths}
        <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle"
          style="font-family:Georgia,'Times New Roman',serif;font-size:${fontSize}px;fill:#2A2620;">${abbreviate(total)}</text>
      </svg>
    </div>`
  return el
}

export function attachDonutClusters(mapboxgl, map, sourceId, { segments, onClusterClick }) {
  let markers = {}
  let markersOnScreen = {}

  function updateMarkers() {
    const newMarkersOnScreen = {}
    const features = map.querySourceFeatures(sourceId)

    for (const feature of features) {
      const props = feature.properties
      if (!props.cluster) continue
      const id = props.cluster_id

      let marker = markers[id]
      if (!marker) {
        const el = buildDonutElement(props, segments)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onClusterClick?.(id, feature.geometry.coordinates.slice())
        })
        marker = markers[id] = new mapboxgl.Marker({ element: el }).setLngLat(feature.geometry.coordinates)
      }
      newMarkersOnScreen[id] = marker
      if (!markersOnScreen[id]) marker.addTo(map)
    }

    for (const id in markersOnScreen) {
      if (!newMarkersOnScreen[id]) markersOnScreen[id].remove()
    }
    markersOnScreen = newMarkersOnScreen
  }

  function onRender() {
    if (!map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return
    updateMarkers()
  }
  map.on('render', onRender)

  function invalidate() {
    for (const id in markersOnScreen) markersOnScreen[id].remove()
    markers = {}
    markersOnScreen = {}
  }

  function detach() {
    map.off('render', onRender)
    invalidate()
  }

  return { invalidate, detach }
}
