// Maximum total route distance (km) by mode, duration, and fitness.
// These are round-trip / loop distances. Tune as needed.

export const ROUTE_DISTANCE_BUDGET = {
  // Car — fitness irrelevant
  driving: {
    passing_through: { any: 200 },
    day_trip:        { any: 400 },
    '2_days':        { any: 800 },
    '3_days':        { any: 1200 },
    '4_plus':        { any: 1600 },
    half_day:        { any: 200 },
    full_day:        { any: 400 },
    weekend:         { any: 800 },
  },
  // Bike — fitness matters
  cycling: {
    half_day: { relaxed: 35,  moderate: 55,  strong: 80  },
    full_day: { relaxed: 60,  moderate: 100, strong: 150 },
    weekend:  { relaxed: 120, moderate: 200, strong: 300 },
  },
}

// Target stop counts by duration
export const STOP_COUNT_LIMITS = {
  half_day: { min: 2, max: 3 },
  full_day: { min: 3, max: 5 },
  weekend:  { min: 4, max: 8 },
  passing_through: { min: 2, max: 5 },
  day_trip:        { min: 3, max: 10 },
  '2_days':        { min: 4, max: 12 },
  '3_days':        { min: 5, max: 15 },
  '4_plus':        { min: 6, max: 20 },
}

export function getDistanceBudget(transportMode, tripLength, fitness = 'moderate') {
  const modeConfig = ROUTE_DISTANCE_BUDGET[transportMode]
  if (!modeConfig) return null
  const durationConfig = modeConfig[tripLength]
  if (!durationConfig) return null
  return durationConfig[fitness] || durationConfig.any || null
}

export function getStopLimits(tripLength) {
  return STOP_COUNT_LIMITS[tripLength] || { min: 2, max: 10 }
}
