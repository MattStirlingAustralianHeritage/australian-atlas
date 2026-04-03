/**
 * Custom dark cartographic Mapbox GL style for Australian Atlas region cards.
 *
 * Palette:
 *   Background / land: #1c1a17 (dark ink)
 *   Water:             #2a3a4a (slate)
 *   Roads (all):       #b8862b (amber) at 40% opacity
 *   Railways:          #b8862b at 20% opacity, dashed
 *   Parks / landuse:   #252320 (dark olive)
 *   Boundaries:        #3a3530 (warm grey)
 *   Labels:            hidden entirely
 *
 * Defined as a code object — not hosted in Mapbox Studio.
 * Requires Mapbox GL JS v3+ and a valid access token.
 */

export const ATLAS_DARK_STYLE = {
  version: 8,
  name: 'Atlas Dark Cartographic',
  sources: {
    'mapbox-streets': {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-streets-v8',
    },
  },
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  layers: [
    // Background
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#1c1a17',
      },
    },

    // Landuse — parks, forests, green areas
    {
      id: 'landuse',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'landuse',
      filter: ['in', 'class', 'park', 'cemetery', 'glacier', 'pitch', 'sand', 'agriculture', 'wood', 'scrub', 'grass'],
      paint: {
        'fill-color': '#252320',
        'fill-opacity': 0.6,
      },
    },

    // Water fill
    {
      id: 'water',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'water',
      paint: {
        'fill-color': '#2a3a4a',
      },
    },

    // Waterways (rivers, streams)
    {
      id: 'waterway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#2a3a4a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2],
      },
    },

    // Admin boundaries
    {
      id: 'admin-boundaries',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'admin',
      filter: ['>=', 'admin_level', 2],
      paint: {
        'line-color': '#3a3530',
        'line-width': 1,
        'line-opacity': 0.6,
      },
    },

    // Roads — tunnels (casing)
    {
      id: 'tunnel',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['==', ['get', 'structure'], 'tunnel'],
      paint: {
        'line-color': '#b8862b',
        'line-opacity': 0.2,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.5],
      },
      layout: {
        'line-cap': 'butt',
      },
    },

    // Roads — all classes
    {
      id: 'road',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['!=', ['get', 'structure'], 'tunnel'],
      paint: {
        'line-color': '#b8862b',
        'line-opacity': 0.4,
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.3,
          8, 0.6,
          12, 1.5,
          16, 3,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    },

    // Railways
    {
      id: 'railway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'major_rail'],
      paint: {
        'line-color': '#b8862b',
        'line-opacity': 0.2,
        'line-width': 1,
        'line-dasharray': [4, 3],
      },
    },

    // Buildings (subtle at high zoom)
    {
      id: 'building',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-color': '#252320',
        'fill-opacity': 0.4,
      },
    },
  ],
}
