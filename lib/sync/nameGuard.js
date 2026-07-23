/**
 * Cross-entity name-change guard for the inbound vertical sync.
 *
 * Incident 2026-07-23 (Watts River Brewing): a Places Text Search ingest
 * attached one brewery's entire Google Places record to a different
 * brewery's name ("Sweetwater Brewing"), and the sync faithfully carried
 * the conflated identity into master search. This guard makes the sync
 * refuse to APPLY a rename of an existing master listing when the new name
 * belongs to a different listing somewhere in the network — the strongest
 * signal available that an upstream writer has conflated two entities.
 *
 * Scope: renames only. New listings may legitimately share a name with an
 * existing one (chains, common names), so inserts are never blocked. A
 * blocked rename keeps the listing's current master name; every other
 * field in the row still syncs. Blocks are LOGGED, never silent — each one
 * is console.error'd by the caller, counted in the sync cron's agent_runs
 * summary, and emailed via sendNameGuardAlert. A false positive (a genuine
 * rebrand to a name that exists elsewhere) is resolved by an admin
 * applying the rename manually — the log line carries both sides.
 */

// Same normalization family as the network dedup tooling: case, accents,
// punctuation and joining words don't distinguish entities.
export function normalizeListingName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(the|a|an|pty|ltd|co|and|of|at|in|on)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const GUARD_PAGE_SIZE = 1000

/**
 * Read every listing's identity fields (all statuses — an inactive row's
 * name still identifies a distinct entity) and build:
 *  - byNorm:  normalized name → [{ id, vertical, source_id, name, suburb, state }]
 *  - currentNameByKey: `${vertical}:${source_id}` → { id, name }
 *
 * Returns null on any read failure so the caller can disable the guard
 * for the run (fail-open: never let the guard break the sync) — mirrors
 * the claim guard's "withheld from this run" behaviour.
 */
export async function buildNameGuardIndex(master) {
  const byNorm = new Map()
  const currentNameByKey = new Map()
  let from = 0
  while (true) {
    const { data, error } = await master
      .from('listings')
      .select('id, vertical, source_id, name, suburb, state')
      .order('id', { ascending: true })
      .range(from, from + GUARD_PAGE_SIZE - 1)
    if (error) {
      console.error('[name-guard] index read failed — guard disabled for this run:', error.message)
      return null
    }
    if (!data || data.length === 0) break
    for (const row of data) {
      const norm = normalizeListingName(row.name)
      if (norm) {
        if (!byNorm.has(norm)) byNorm.set(norm, [])
        byNorm.get(norm).push(row)
      }
      currentNameByKey.set(`${row.vertical}:${row.source_id}`, { id: row.id, name: row.name })
    }
    from += data.length
  }
  return { byNorm, currentNameByKey }
}

/**
 * Apply the guard to one vertical's mapped sync items, in place.
 *
 * For each item whose (vertical, source_id) already exists in master with a
 * DIFFERENT name (normalized), and whose incoming name matches a different
 * listing anywhere in the network: revert the payload's name to the current
 * master name and record the block. Formatting-only changes (same
 * normalized name) always pass; renames to unique new names always pass.
 *
 * @param {object|null} index - Output of buildNameGuardIndex (null = disabled).
 * @param {string} vertical
 * @param {Array<{ listingData: object }>} items - Mapped rows about to be upserted.
 * @returns {Array} blocked - [{ vertical, source_id, master_id, kept_name,
 *   attempted_name, conflicts: [{ id, vertical, source_id, name, suburb, state }] }]
 */
export function applyNameGuard(index, vertical, items) {
  const blocked = []
  if (!index) return blocked

  for (const item of items) {
    const incoming = item.listingData?.name
    if (!incoming) continue

    const existing = index.currentNameByKey.get(`${vertical}:${item.listingData.source_id}`)
    if (!existing || !existing.name) continue // insert, or no prior name to protect

    const normIncoming = normalizeListingName(incoming)
    const normExisting = normalizeListingName(existing.name)
    if (!normIncoming || normIncoming === normExisting) continue // not a real rename

    const conflicts = (index.byNorm.get(normIncoming) || []).filter(
      (l) => !(l.vertical === vertical && String(l.source_id) === String(item.listingData.source_id))
    )
    if (conflicts.length === 0) continue // rename to a unique name — allowed

    item.listingData.name = existing.name
    blocked.push({
      vertical,
      source_id: item.listingData.source_id,
      master_id: existing.id,
      kept_name: existing.name,
      attempted_name: incoming,
      conflicts: conflicts.map(({ id, vertical: v, source_id, name, suburb, state }) =>
        ({ id, vertical: v, source_id, name, suburb, state })),
    })
  }
  return blocked
}
