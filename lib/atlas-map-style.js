/**
 * Custom dark cartographic Mapbox GL style for Australian Atlas region cards.
 *
 * Palette:
 *   Background / land: #2d2a24 (warm dark brown)
 *   Water:             #3d5a6e (muted slate blue)
 *   Motorways/primary: #b8862b (Atlas amber), 1.5px max
 *   Secondary/tertiary:#8a6520 (muted amber)
 *   Minor roads:       #4a3a1a (dark texture)
 *   Paths/tracks:      #4a3a1a at 40% opacity
 *   Railways:          #6b5218 dashed
 *   Parks / landuse:   #352f24 (subtle texture)
 *   Boundaries:        removed (not needed at card zoom)
 *   Labels:            hidden entirely
 *
 * Principle: only motorways and primary roads glow amber.
 * Everything else is dark texture. The result reads as a dark
 * landscape with a sparse golden road network.
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
    // Background / land
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#2d2a24',
      },
    },

    // Landuse — parks, forests, green areas (subtle texture)
    {
      id: 'landuse',
      type: 'fill',
      source: 'mapbox-streets',
      'source-layer': 'landuse',
      filter: ['in', 'class', 'park', 'cemetery', 'glacier', 'pitch', 'sand', 'agriculture', 'wood', 'scrub', 'grass'],
      paint: {
        'fill-color': '#352f24',
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
        'fill-color': '#3d5a6e',
      },
    },

    // Waterways (rivers, streams)
    {
      id: 'waterway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#3d5a6e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2],
      },
    },

    // Roads — paths and tracks (barely visible texture)
    {
      id: 'road-path',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['path', 'pedestrian', 'track']]],
      ],
      paint: {
        'line-color': '#4a3a1a',
        'line-opacity': 0.4,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 16, 1],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    },

    // Roads — minor streets (dark texture, not colour)
    {
      id: 'road-minor',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['street', 'street_limited', 'service']]],
      ],
      paint: {
        'line-color': '#4a3a1a',
        'line-opacity': 0.7,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 0.8, 16, 1.5],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    },

    // Roads — secondary and tertiary (muted amber)
    {
      id: 'road-secondary',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
      ],
      paint: {
        'line-color': '#8a6520',
        'line-opacity': 0.6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 8, 0.5, 12, 1, 16, 1.5],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    },

    // Roads — motorways and primary (Atlas amber, max 1.5px)
    {
      id: 'road-primary',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['all',
        ['!=', ['get', 'structure'], 'tunnel'],
        ['in', ['get', 'class'], ['literal', ['motorway', 'primary', 'trunk', 'motorway_link', 'trunk_link', 'primary_link']]],
      ],
      paint: {
        'line-color': '#b8862b',
        'line-opacity': 0.7,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 8, 0.7, 12, 1.2, 16, 1.5],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    },

    // Roads — tunnels (all classes, very subtle)
    {
      id: 'tunnel',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['==', ['get', 'structure'], 'tunnel'],
      paint: {
        'line-color': '#4a3a1a',
        'line-opacity': 0.3,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 12, 1],
      },
      layout: {
        'line-cap': 'butt',
      },
    },

    // Railways (muted, dashed)
    {
      id: 'railway',
      type: 'line',
      source: 'mapbox-streets',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'major_rail'],
      paint: {
        'line-color': '#6b5218',
        'line-opacity': 0.5,
        'line-width': 0.8,
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
        'fill-color': '#352f24',
        'fill-opacity': 0.4,
      },
    },
  ],
}
