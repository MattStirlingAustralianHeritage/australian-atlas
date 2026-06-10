/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — shared persistence helpers
   ═══════════════════════════════════════════════════════════════════════
   Slug + fingerprint logic shared by the Share (anonymous) and Save
   (account) endpoints so the two stay in lockstep. A trip's fingerprint
   is what makes both idempotent: the same assembled trip always maps to
   the same row, whether it was reached via Share or Save.                */


/* ─── Slugify ─────────────────────────────────────────────────────────── */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function generateShareSlug(title) {
  const base = slugify(title)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}


/* ─── Fingerprint for idempotency ─────────────────────────────────────
   Two trips are "the same" if they have the same region, intent,
   pacing, duration, and identical stop list. We hash the stop IDs
   per day to avoid re-persisting the exact same result.               */
export function tripFingerprint(answers, trip) {
  const stopIds = (trip.days || [])
    .flatMap(d => (d.stops || []).map(s => s.listing_id))
    .join(',')
  return [
    answers.region || '',
    (answers.intent || []).sort().join('+'),
    answers.pacing || '',
    answers.duration || '',
    stopIds,
  ].join('|')
}

/* Fingerprint for accommodation-only ("stays only") results. */
export function staysOnlyFingerprint(answers) {
  return `stays_only|${answers.region || ''}|${(answers.intent || []).join('+')}`
}

/* Pick the right fingerprint for a payload (trip vs stays-only). */
export function fingerprintFor(answers, trip, staysOnly) {
  return trip ? tripFingerprint(answers, trip) : staysOnlyFingerprint(answers)
}

/* The display title used for a persisted trip's slug + listings. */
export function tripTitle(answers, trip) {
  return trip?.title || `${answers?.region || 'Trip'} stays`
}
