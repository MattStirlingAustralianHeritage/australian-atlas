/**
 * Gate Check — Character / Independence gate for LIVE listings.
 *
 * Applies the SAME independence check the prospector runs on candidates
 * (lib/prospector/way-discovery/gate-1-independence.js) retroactively to live
 * listings: matches a listing's name / brand / domain against the
 * commercial_groups denylist (corporate parents + their non-independent brands).
 *
 * A match means the listing is corporate-owned / a conglomerate brand / a chain
 * — it fails the Atlas's "independent, owner-operated" character bar. The gate
 * only FLAGS; the admin decides Hide/Delete in /admin/gate-check.
 *
 * PURE MODULE — no `@/`, no DB, no network. Caller passes the pre-loaded
 * commercial_groups rows. Matching logic mirrors evaluateGate1 exactly.
 */

// Token-based containment: needle tokens appear as a consecutive run in haystack.
function tokenContains(haystack, needle) {
  const ht = haystack.split(/\s+/)
  const nt = needle.split(/\s+/)
  if (nt.length > ht.length) return false
  for (let i = 0; i <= ht.length - nt.length; i++) {
    let ok = true
    for (let j = 0; j < nt.length; j++) if (ht[i + j] !== nt[j]) { ok = false; break }
    if (ok) return true
  }
  return false
}

function brandMatches(variant, brand, mode) {
  switch (mode) {
    case 'exact': return variant === brand
    case 'prefix': return variant.startsWith(brand) && (variant.length === brand.length || /\s/.test(variant[brand.length]))
    case 'token': return variant === brand || tokenContains(variant, brand)
    default: return variant === brand || tokenContains(variant, brand)
  }
}

// A few conservative name variants for a live listing. Token matching on the
// full name already handles most cases ("4 Pines Brewpub Manly" contains
// "4 pines"); these add a punctuation-normalised form and a suffix-stripped one.
const SUFFIX_RE = /\b(brewery|brewing|brewers|brewhouse|distillery|distilling|distillers|winery|wines|vineyard|vineyards|estate|cellars|cellar door|co|company|pty|ltd|limited|inc|group|the)\b/g
export function nameVariants(name) {
  const base = (name || '').toLowerCase().trim()
  if (!base) return []
  const punct = base.replace(/[^\w\s&]/g, ' ').replace(/\s+/g, ' ').trim()
  const noSuffix = punct.replace(SUFFIX_RE, ' ').replace(/\s+/g, ' ').trim()
  const noLoc = base.split(',')[0].trim() // drop a trailing ", <location>"
  return [...new Set([base, punct, noSuffix, noLoc].filter(Boolean))]
}

function groupAppliesTo(group, vertical) {
  const scope = group.vertical_scope
  return scope == null || (Array.isArray(scope) && scope.includes(vertical))
}

/**
 * @param {object} listing - { name, website, vertical }
 * @param {Array}  groups  - full commercial_groups rows
 * @returns failure descriptor { gate:'gate5_character', code, severity, reason,
 *          group, verify } | null
 */
export function checkCharacterGate(listing, groups) {
  if (!Array.isArray(groups) || !groups.length) return null
  const variants = nameVariants(listing.name)
  if (!variants.length) return null

  let host = ''
  try { host = new URL(/^https?:\/\//i.test(listing.website || '') ? listing.website : 'https://' + (listing.website || '')).hostname.toLowerCase().replace(/^www\./, '') } catch {}

  for (const group of groups) {
    if (!groupAppliesTo(group, listing.vertical)) continue

    let matchedOn = null

    // ── Name / brand matching ──
    const hasJson = Array.isArray(group.brands_json) && group.brands_json.length > 0
    const groupNameLower = (group.group_name || '').toLowerCase().trim()
    for (const variant of variants) {
      const v = variant.toLowerCase()
      // group_name itself (token) — but skip a bare generic group_name that is a
      // single common word to avoid over-matching (all our brands are explicit).
      if (groupNameLower && groupNameLower.split(/\s+/).length > 1 && brandMatches(v, groupNameLower, 'token')) { matchedOn = `name "${group.group_name}"`; break }
      if (hasJson) {
        for (const b of group.brands_json) {
          const bn = (b.name || '').toLowerCase().trim()
          if (bn && brandMatches(v, bn, b.match_mode || 'token')) { matchedOn = `brand "${b.name}"`; break }
        }
      } else if (Array.isArray(group.brands)) {
        for (const bn0 of group.brands) {
          const bn = (bn0 || '').toLowerCase().trim()
          if (bn && (v === bn || tokenContains(v, bn))) { matchedOn = `brand "${bn0}"`; break }
        }
      }
      if (matchedOn) break
    }

    // ── Domain matching ──
    if (!matchedOn && host && Array.isArray(group.domains)) {
      for (const d0 of group.domains) {
        const d = (d0 || '').toLowerCase()
        if (d && (host === d || host.endsWith('.' + d))) { matchedOn = `domain ${host}`; break }
      }
    }

    if (matchedOn) {
      const verify = !!group.verify_case_by_case
      const parent = group.parent_entity ? ` — owned by ${group.parent_entity}` : ''
      const note = group.notes ? ` ${group.notes}` : ''
      return {
        gate: 'gate5_character',
        code: verify ? 'commercial_group_verify' : 'commercial_group',
        severity: verify ? 1 : 2,
        group: group.group_name,
        verify,
        reason: `Not independent — ${matchedOn} matches the commercial group ${group.group_name}${parent}.${note}`.trim(),
      }
    }
  }
  return null
}
