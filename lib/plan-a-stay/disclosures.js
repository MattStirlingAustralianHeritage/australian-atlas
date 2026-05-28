/* ═══════════════════════════════════════════════════════════════════════
   Disclosure generation for Plan-a-Stay v2
   ═══════════════════════════════════════════════════════════════════════
   Pure functions — no network. Generates trip-level and day-level
   disclosure strings from coverage metadata and day structure.          */


/* ─── Intent → vertical name (human-readable) ──────────────────────── */
const INTENT_VERTICAL_LABELS = {
  'food-and-producers': 'food and producer listings',
  'landscape-and-walking': 'landscape and walking venues',
  'makers-and-craft': 'maker and craft studios',
  'quiet-and-slow': 'quiet stays and slow venues',
  'a-bit-of-everything': 'listings',
}


/* ═══════════════════════════════════════════════════════════════════════
   Trip-level disclosures
   ═══════════════════════════════════════════════════════════════════════
   Priority order: region_size → vertical_coverage → intent_match_rate
   → fallbacks_used. Cap at 2.                                          */

export function generateTripDisclosures(coverage, answers, assembled) {
  const disclosures = []
  const constraint = coverage?.binding_constraint || 'none'
  const region = answers?.region || 'this region'
  const actualDays = assembled?.day_count || coverage?.clusters_found || 0
  const requestedDays = answers?.duration || coverage?.clusters_requested || 0

  // 1. Day count mismatch — fire whenever assembled days < requested,
  //    regardless of what binding_constraint reports.
  //    Copy distinguishes compact regions (everything is close) from sparse ones.
  const isCompact = coverage?.region_compact === true
  if (actualDays > 0 && requestedDays > 0 && actualDays < requestedDays) {
    if (isCompact) {
      disclosures.push(
        `We've built this as a ${actualDays}-day trip. ${region} is compact enough to cover well in fewer days.`
      )
    } else {
      disclosures.push(
        `We've built this as a ${actualDays}-day trip. The region didn't have enough geographic spread for a full ${requestedDays} days.`
      )
    }
  } else if (
    constraint === 'region_size' &&
    coverage.clusters_found < coverage.clusters_requested
  ) {
    if (isCompact) {
      disclosures.push(
        `We've built this as a ${coverage.clusters_found}-day trip — ${region} is compact enough to cover well in fewer days.`
      )
    } else {
      disclosures.push(
        `We've built this as a ${coverage.clusters_found}-day trip — there isn't enough geographic spread in ${region} for a full ${coverage.clusters_requested} days.`
      )
    }
  }

  // 2. Vertical coverage — fewer relevant listings than ideal
  if (constraint === 'vertical_coverage') {
    const intentLabel = (answers?.intent || [])
      .map(id => INTENT_VERTICAL_LABELS[id])
      .filter(Boolean)
      .join(' and ') || 'listings matching your interests'
    disclosures.push(
      `This region has fewer ${intentLabel} than others — we've leaned into what's there.`
    )
  }

  // 3. Low intent match rate
  if ((coverage?.intent_match_rate || 1) < 0.6) {
    disclosures.push(
      `This trip leans more on what's available in ${region} than strictly on what you asked for.`
    )
  }

  // 4. Secondary vertical fallback used
  if ((coverage?.fallbacks_used || []).includes('secondary_verticals')) {
    disclosures.push(
      'To fill the days, we\'ve included some adjacent listings beyond your specific requests.'
    )
  }

  // Cap at 2 — if more would fire, the trip is fragile; show only the
  // highest-priority ones.
  return disclosures.slice(0, 2)
}


/* ═══════════════════════════════════════════════════════════════════════
   Day-level disclosures
   ═══════════════════════════════════════════════════════════════════════ */

export function generateDayDisclosures(day, prevDay) {
  const disclosures = []

  // Low diversity — flagged by the diversity constraint in assembly
  if (day.low_diversity) {
    disclosures.push(
      'A lighter day — we kept the variety of stops modest because the surrounding area had fewer options matching this trip.'
    )
  }

  // Lighter day — few stops (only if not already flagged as low_diversity)
  if (!day.low_diversity && (day.stops?.length || 0) < 2) {
    disclosures.push(
      'A lighter day — there aren\'t as many options in this stretch yet.'
    )
  }

  // Long drive
  if ((day.loop_km || 0) > 80) {
    disclosures.push(
      `The drive between stops is longer here, around ${Math.round(day.loop_km)}km in total.`
    )
  }

  return disclosures
}
