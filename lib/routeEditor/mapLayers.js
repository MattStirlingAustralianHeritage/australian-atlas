/**
 * Route editor map layer helpers.
 *
 * Pure functions that produce Mapbox GL source data and layer specs
 * for included vs excluded stops. No React, no state — just data in,
 * config out. Any map component can consume these.
 *
 * Reusable across the itinerary page, a future operator tour builder,
 * or any context that shows an editable route on a Mapbox GL map.
 */

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

/**
 * Build a GeoJSON FeatureCollection from an augmented stop list.
 * Each feature carries properties used by the circle/symbol layers
 * to render included vs excluded visual states.
 *
 * @param {Array} stops — Stops with _included, _pinned, _idx, _day, _accom fields
 * @returns {Object} GeoJSON FeatureCollection
 */
export function stopsToGeoJSON(stops) {
  return {
    type: 'FeatureCollection',
    features: stops
      .filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))
      .map(s => {
        const vertColor = VERTICAL_COLORS[s.vertical] || '#1a1a1a'
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(s.lng), parseFloat(s.lat)],
          },
          properties: {
            id: String(s.id),
            number: s._accom ? '⌂' : String(s._idx),
            name: s.venue_name || s.name || '',
            vertical: s.vertical || '',
            verticalColor: vertColor,
            isAccom: s._accom || false,
            day: s._day ?? 0,
            included: s._included !== false,
            pinned: s._pinned || false,
            // visible is used for the reveal animation; starts false
            visible: false,
          },
        }
      }),
  }
}

/**
 * Layer spec for included stops — filled circles.
 */
export function includedCircleLayer(sourceId = 'trail-stops') {
  return {
    id: 'trail-stops-circle',
    type: 'circle',
    source: sourceId,
    filter: ['all',
      ['==', ['get', 'visible'], true],
      ['==', ['get', 'included'], true],
    ],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'isAccom'], true], 15, 14],
      'circle-color': ['get', 'verticalColor'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

/**
 * Layer spec for excluded stops — outline-only circles.
 */
export function excludedCircleLayer(sourceId = 'trail-stops') {
  return {
    id: 'trail-stops-circle-excluded',
    type: 'circle',
    source: sourceId,
    filter: ['all',
      ['==', ['get', 'visible'], true],
      ['==', ['get', 'included'], false],
    ],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'isAccom'], true], 15, 14],
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': ['get', 'verticalColor'],
      'circle-opacity': 0.7,
      'circle-stroke-opacity': 0.5,
    },
  }
}

/**
 * Layer spec for stop numbers on included stops.
 */
export function includedNumberLayer(sourceId = 'trail-stops') {
  return {
    id: 'trail-stops-number',
    type: 'symbol',
    source: sourceId,
    filter: ['all',
      ['==', ['get', 'visible'], true],
      ['==', ['get', 'included'], true],
    ],
    layout: {
      'text-field': ['get', 'number'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-allow-overlap': true,
      'icon-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  }
}

/**
 * Layer spec for stop numbers on excluded stops.
 */
export function excludedNumberLayer(sourceId = 'trail-stops') {
  return {
    id: 'trail-stops-number-excluded',
    type: 'symbol',
    source: sourceId,
    filter: ['all',
      ['==', ['get', 'visible'], true],
      ['==', ['get', 'included'], false],
    ],
    layout: {
      'text-field': ['get', 'number'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-allow-overlap': true,
      'icon-allow-overlap': true,
    },
    paint: {
      'text-color': ['get', 'verticalColor'],
      'text-opacity': 0.5,
    },
  }
}

/**
 * All stop layers in render order (bottom to top).
 * Add these after route line layers so stops draw on top.
 */
export function allStopLayers(sourceId = 'trail-stops') {
  return [
    excludedCircleLayer(sourceId),
    excludedNumberLayer(sourceId),
    includedCircleLayer(sourceId),
    includedNumberLayer(sourceId),
  ]
}
