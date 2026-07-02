/**
 * "Atlas Paper" — the light editorial Mapbox GL style for the network map.
 *
 * Companion to ATLAS_DARK_STYLE (region cards): defined as a code object from
 * mapbox-streets-v8, not hosted in Studio, so the palette lives in the repo
 * next to the design tokens it mirrors.
 *
 * Principles (per the cartography canon this was designed against — Stamen,
 * Pale Dawn, Mapbox's own map-design guide):
 *   1. The basemap is paper: every hue is a low-saturation relative of the
 *      site's cream/stone tokens, so the page edge disappears into the map.
 *   2. Saturated colour belongs to the DATA layer only (venue pins, clusters).
 *      No POIs, no transit icons, no road shields — Atlas venues are the only
 *      points of interest on this map.
 *   3. Labels are culled hard at low zoom (capitals first), get cream halos,
 *      and sit ABOVE the venue layers (add pins with beforeId ATLAS_LABEL_ROOF).
 *
 * Palette:
 *   Land / background:  #F1EADB   (between --color-bg #EFE7D8 and cream)
 *   Water:              #B3C5CB   (desaturated grey-blue — never product blue)
 *   Parks / green:      #DEE0C8   (soft sage wash)
 *   Local roads:        #FBFAF6   (near-white negative space)
 *   Arterials:          #E6D9C3   (warm tan)
 *   Motorways:          #DCC9A4   (deeper tan; never brand terracotta)
 *   State borders:      dashed warm ink at low opacity
 *   Labels:             warm ink family, halo = land cream
 */

const LAND = '#F1EADB'
const WATER = '#B3C5CB'
const PARK = '#DEE0C8'
const ROAD_LOCAL = '#FBFAF6'
const ROAD_ARTERIAL = '#E6D9C3'
const ROAD_MOTORWAY = '#DCC9A4'
const INK = '#3E3A33'
const INK_SOFT = '#6B6355'
const INK_FAINT = '#8C8272'
const WATER_LABEL = '#7C939B'
const HALO = 'rgba(241,234,219,0.9)'

// The topmost non-label layer id — venue layers are inserted before the first
// label layer so settlement names always float above the pins (map sandwich).
export const ATLAS_LABEL_ROOF = 'atlas-water-label'

export const ATLAS_PAPER_STYLE = {
  version: 8,
  name: 'Atlas Paper',
  sources: {
    'mapbox-streets': {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-streets-v8',
    },
    'mapbox-dem': {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    },
  },
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': LAND } },

    // Whisper-level warm hillshade — texture for the interior, not topography.
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'mapbox-dem',
      maxzoom: 13,
      paint: {
        'hillshade-shadow-color': '#C9BBA0',
        'hillshade-highlight-color': '#FFFDF6',
        'hillshade-accent-color': '#D8CBB0',
        'hillshade-exaggeration': 0.14,
      },
    },

    // Green cover — parks, reserves, woods. One soft sage, low opacity.
    {
      id: 'landuse-green',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['park', 'grass', 'wood', 'scrub', 'pitch', 'cemetery']]],
      paint: { 'fill-color': PARK, 'fill-opacity': 0.55 },
    },
    // National parks read as a slightly deeper wash so the big reserves
    // (Kakadu, the Alps, Tasmania's west) give the country some structure.
    {
      id: 'national-park',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'landuse_overlay',
      filter: ['==', ['get', 'class'], 'national_park'],
      paint: { 'fill-color': PARK, 'fill-opacity': 0.5 },
    },

    // Water
    {
      id: 'water',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'water',
      paint: { 'fill-color': WATER },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'waterway',
      minzoom: 8,
      paint: {
        'line-color': WATER,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2.5],
      },
    },

    // Aeroways kept as faint texture so airports aren't mystery voids.
    {
      id: 'aeroway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'aeroway',
      minzoom: 10,
      paint: { 'line-color': '#E4DCC9', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 2] },
    },

    // ── Roads: pale negative space on paper. No shields, no casings. ──
    {
      id: 'road-path',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 12,
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['path', 'pedestrian', 'track']]],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#E0D6C0',
        'line-opacity': 0.7,
        'line-dasharray': [2, 1.5],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 1.2],
      },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 11,
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['street', 'street_limited', 'service']]],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROAD_LOCAL,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.5, 16, 4],
      },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 8,
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROAD_ARTERIAL,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.4, 16, 4],
      },
    },
    {
      id: 'road-primary',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']]],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROAD_MOTORWAY,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.1, 12, 2.2, 16, 5],
      },
    },
    {
      id: 'railway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 9,
      filter: ['==', ['get', 'class'], 'major_rail'],
      paint: {
        'line-color': '#D9CDB4',
        'line-width': 0.8,
        'line-dasharray': [4, 3],
      },
    },

    // Buildings — faint print texture at street zoom.
    {
      id: 'building',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#E7DFCC', 'fill-opacity': 0.5 },
    },

    // State borders — first-class wayfinding on a national atlas.
    {
      id: 'admin-state',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'admin',
      filter: ['all', ['==', ['get', 'admin_level'], 1], ['==', ['get', 'maritime'], 'false']],
      paint: {
        'line-color': INK_FAINT,
        'line-opacity': 0.5,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1],
        'line-dasharray': [3, 2.5],
      },
    },

    // ── Labels (everything below stays ABOVE venue pins) ──

    // Water bodies + reefs/bays — italic, sits in the water hue family.
    {
      id: ATLAS_LABEL_ROOF,
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'natural_label',
      minzoom: 4,
      filter: ['in', ['get', 'class'], ['literal', ['sea', 'ocean', 'bay', 'water', 'reservoir', 'strait']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Italic', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 13],
        'text-letter-spacing': 0.08,
        'text-max-width': 7,
      },
      paint: { 'text-color': WATER_LABEL, 'text-halo-color': 'rgba(179,197,203,0.4)', 'text-halo-width': 1 },
    },

    // Settlements — NYT-style culling: capitals only at country zoom, then
    // cities, then towns, then suburbs. symbolrank does the editing for us.
    {
      id: 'settlement-major',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'place_label',
      minzoom: 3,
      maxzoom: 12,
      filter: ['all',
        ['==', ['get', 'class'], 'settlement'],
        ['<=', ['get', 'symbolrank'], 6],
      ],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11.5, 7, 14, 11, 17],
        'text-letter-spacing': 0.04,
        'text-max-width': 8,
        'text-padding': 4,
      },
      paint: { 'text-color': INK, 'text-halo-color': HALO, 'text-halo-width': 1.4 },
    },
    {
      id: 'settlement-minor',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'place_label',
      minzoom: 6,
      maxzoom: 14,
      filter: ['all',
        ['==', ['get', 'class'], 'settlement'],
        ['>', ['get', 'symbolrank'], 6],
        // Reveal progressively: bigger towns from z6, everything by z9.
        ['<=', ['get', 'symbolrank'], ['step', ['zoom'], 9, 7, 11, 8, 14, 9, 99]],
      ],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 10, 12.5, 13, 15],
        'text-letter-spacing': 0.03,
        'text-max-width': 8,
        'text-padding': 3,
      },
      paint: { 'text-color': INK_SOFT, 'text-halo-color': HALO, 'text-halo-width': 1.3 },
    },
    {
      id: 'settlement-subdivision',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'place_label',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'settlement_subdivision'],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12],
        'text-letter-spacing': 0.12,
        'text-transform': 'uppercase',
        'text-padding': 3,
      },
      paint: { 'text-color': INK_FAINT, 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },

    // States — letterspaced small caps, whisper opacity, gone once you're in.
    {
      id: 'state-label',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'place_label',
      minzoom: 3,
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'state'],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13],
        'text-letter-spacing': 0.28,
        'text-transform': 'uppercase',
        'text-max-width': 6,
      },
      paint: { 'text-color': INK_FAINT, 'text-opacity': 0.75, 'text-halo-color': HALO, 'text-halo-width': 1 },
    },

    // Road names — staged by importance so streets are readable when you're
    // in them without papering the whole town in text. NOTE: Australian road
    // features rarely carry name_en in the tiles; text-field must coalesce to
    // plain `name` or nothing renders at all.
    {
      id: 'road-label-major',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 12.5,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10.5, 16, 12.5],
        'text-letter-spacing': 0.02,
        'text-padding': 4,
      },
      paint: { 'text-color': INK_SOFT, 'text-halo-color': HALO, 'text-halo-width': 1.3 },
    },
    {
      id: 'road-label-minor',
      type: 'symbol',
      source: 'mapbox-streets',
      'source-layer': 'road',
      minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'street', 'street_limited']]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 350,
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12],
        'text-letter-spacing': 0.02,
        'text-padding': 4,
      },
      paint: { 'text-color': INK_SOFT, 'text-opacity': 0.9, 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
  ],
}
