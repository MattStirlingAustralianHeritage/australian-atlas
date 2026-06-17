// ============================================================
// Event hero palettes — the tonal grounds behind the typographic
// event hero (card + detail page). Cream type sits on every ground.
//
// The ground is chosen from the event's human-readable category
// label first (keyword match), then the constrained category key
// (festival/market/dinner/tour/exhibition/workshop/other), and
// finally falls back to eucalyptus sage. Nothing here invents data
// — it only maps an existing category onto a colour.
// ============================================================

const CREAM = '#F7F3E9'

// Warm, earthy grounds cohesive with the network's typographic cards.
const PALETTES = {
  // Spirits, cellar doors, breweries — warm amber.
  amber: { ground: 'linear-gradient(155deg, #B0742F 0%, #8C5524 100%)', text: CREAM },
  // Tastings, long tables, dinners, markets — clay.
  clay: { ground: 'linear-gradient(155deg, #B0613F 0%, #884A30 100%)', text: CREAM },
  // Talks, workshops, exhibitions — ink.
  ink: { ground: 'linear-gradient(155deg, #3B3933 0%, #26241F 100%)', text: CREAM },
  // Festivals, celebrations — plum.
  plum: { ground: 'linear-gradient(155deg, #6E4B63 0%, #4C3245 100%)', text: CREAM },
  // Default — eucalyptus sage. Any unmapped or missing category lands here.
  sage: { ground: 'linear-gradient(155deg, #5F7363 0%, #46564B 100%)', text: CREAM },
}

// Constrained category keys → palette (the lib/events.js CHECK set).
const KEY_PALETTE = {
  festival: PALETTES.plum,
  market: PALETTES.clay,
  dinner: PALETTES.clay,
  tour: PALETTES.sage,
  exhibition: PALETTES.ink,
  workshop: PALETTES.ink,
  other: PALETTES.sage,
}

/**
 * Resolve the hero palette for an event.
 *
 * @param {string} [category]    Human-readable category label (e.g. "Spirits Showcase").
 * @param {string} [categoryKey] Constrained key fallback (festival/market/…).
 * @returns {{ ground: string, text: string }}
 */
export function eventHeroPalette(category, categoryKey) {
  const t = String(category || '').toLowerCase()

  // Keyword match on the human label first — the richest signal.
  if (/spirit|whisk|gin|rum|vodka|distill|cellar|brew|wine|vineyard|cider|mead|sake/.test(t)) return PALETTES.amber
  if (/tasting|degustation|pairing|long.table|feast|banquet|dinner|lunch|supper|table/.test(t)) return PALETTES.clay
  if (/talk|workshop|class|masterclass|lecture|demo|course|seminar/.test(t)) return PALETTES.ink
  if (/exhibit|gallery|\bshow\b|showcase|opening|installation/.test(t)) return PALETTES.ink
  if (/market|fair|stall|produce/.test(t)) return PALETTES.clay
  if (/festival|celebration|carnival|\bfest\b/.test(t)) return PALETTES.plum
  if (/tour|walk|sail|cruise|ride|hike|paddle|adventure/.test(t)) return PALETTES.sage

  // Fall back to the constrained key, then sage.
  return KEY_PALETTE[String(categoryKey || '').toLowerCase()] || PALETTES.sage
}
