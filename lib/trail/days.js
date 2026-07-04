// ============================================================
// Day structure for trails — the same day discipline Plan-a-Stay
// uses (a day's driving has a budget; a day has only so many
// stops), applied to a hand-built trail in one click.
// ============================================================

// Chunk an ordered stop list into 1-based day numbers by walking the
// legs: a new day starts when the day's driving or stop count budget
// would be exceeded. Returns a new stops array with `day` set.
export function chunkIntoDays(stops, legs, { kmPerDay = 120, maxStopsPerDay = 6 } = {}) {
  if (!stops.length) return stops
  let day = 1
  let dayKm = 0
  let dayStops = 0
  return stops.map((s, i) => {
    const legKm = i > 0 ? (legs?.[i - 1]?.km ?? 0) : 0
    if (i > 0 && (dayKm + legKm > kmPerDay || dayStops + 1 > maxStopsPerDay)) {
      day += 1
      dayKm = 0
      dayStops = 0
    }
    dayKm += legKm
    dayStops += 1
    return { ...s, day }
  })
}

export function clearDays(stops) {
  return stops.map(s => {
    if (s.day == null) return s
    const { day, ...rest } = s
    return rest
  })
}

export function hasDays(stops) {
  return stops.some(s => s.day != null) && new Set(stops.map(s => s.day)).size > 1
}

// Group ordered stops into [{ day, startIndex, stops: [...] }] for render.
// Stops without a day fall into the current group (robust to mixed data).
export function groupStopsByDay(stops) {
  const groups = []
  let current = null
  stops.forEach((s, i) => {
    const d = s.day ?? current?.day ?? 1
    if (!current || d !== current.day) {
      current = { day: d, startIndex: i, stops: [] }
      groups.push(current)
    }
    current.stops.push(s)
  })
  return groups
}
