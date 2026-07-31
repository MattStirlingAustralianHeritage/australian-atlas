// Ordering helpers for the search route's post-retrieval stages.
//
// leadWithVertical: stable re-rank that LEADS with the detected atlas — rows of
// that vertical first (in their existing relevance order), then everything else
// (likewise). Cross-atlas matches are kept, not dropped.
//
// pinNameMatches: guards the case the atlas lead used to break. A query that IS
// a venue's name ("Feather and Lawry Gallery") can also carry a category word
// ("gallery" → Collection intent); the lead then buried the exact-name hit (a
// Craft venue) below a full page of on-category rows — found in the 2026-08-01
// audit, where the venue ranked #1 fused and was invisible on page 1. Any row in
// the fused top few whose NAME matches the raw query is pinned ahead of the
// atlas lead: a person who typed a venue's name gets that venue first, always.

import { nameMatchesQuery } from './nameMatch.js'

// How deep in the fused ranking a name match may sit and still be pinned. Name
// boosts put true name hits at the very top of the fused order; 3 covers
// same-name venues without letting a page-deep coincidence jump the ranking.
const PIN_SCAN_DEPTH = 3

/** Stable atlas-first regrouping (no-op without a detected vertical). */
export function leadWithVertical(rows, vertical) {
  if (!vertical) return rows
  const lead = [], rest = []
  for (const r of rows) (r.vertical === vertical ? lead : rest).push(r)
  return lead.concat(rest)
}

/**
 * Rows from the top of the FUSED order whose name matches the query, in order.
 * Compute BEFORE any re-grouping; feed the result to applyLeadOrder.
 */
export function findNameMatchPins(rows, rawQuery) {
  if (!rawQuery || !Array.isArray(rows)) return []
  return rows.slice(0, PIN_SCAN_DEPTH).filter((r) =>
    nameMatchesQuery(rawQuery, r?.name, { suburb: r?.suburb, state: r?.state }))
}

/** Atlas-lead reorder with name-match pins kept at the very front. */
export function applyLeadOrder(rows, vertical, pins) {
  const led = leadWithVertical(rows, vertical)
  if (!pins || !pins.length) return led
  const pinned = new Set(pins.map((p) => p.id))
  return [...pins, ...led.filter((r) => !pinned.has(r.id))]
}
