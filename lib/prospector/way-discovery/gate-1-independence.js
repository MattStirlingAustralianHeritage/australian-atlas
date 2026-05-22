/**
 * Gate 1 — Independence.
 *
 * Binary pass/fail. Checks the candidate against the commercial_groups
 * table (vertical_scope includes 'way') for name/brand/domain matches.
 *
 * Phase 2C scope: structural matching only (name, brands, domains).
 * Behavioural heuristics (multi-region with no base, zero named guides,
 * cross-operator identical wording) are flagged for editorial review in
 * a later phase.
 *
 * Brand matching uses per-brand match_mode from brands_json:
 *   exact  — full string equality only
 *   prefix — operator name starts with the brand (case-insensitive)
 *   token  — brand tokens appear as consecutive tokens anywhere
 *
 * Falls back to brands TEXT[] with token matching if brands_json is empty
 * (backward compatibility for groups that haven't been migrated yet).
 *
 * Domain matching tests the candidate's website_url hostname against
 * the group's domains array.
 */

import { generateNameVariants } from './variants.js'

/**
 * Token-based containment: returns true if `needle` tokens appear as a
 * consecutive subsequence within `haystack` tokens.
 *
 * Unlike the old version, this handles single-token needles too — the
 * caller controls when to use this vs exact/prefix via match_mode.
 */
function tokenContains(haystack, needle) {
  const ht = haystack.split(/\s+/)
  const nt = needle.split(/\s+/)
  if (nt.length > ht.length) return false
  for (let i = 0; i <= ht.length - nt.length; i++) {
    let match = true
    for (let j = 0; j < nt.length; j++) {
      if (ht[i + j] !== nt[j]) { match = false; break }
    }
    if (match) return true
  }
  return false
}

/**
 * Check if a candidate variant matches a brand according to its match_mode.
 *
 * @param {string} variant — lowercased candidate name variant
 * @param {string} brand — lowercased brand name
 * @param {'exact'|'prefix'|'token'} mode
 * @returns {boolean}
 */
function brandMatches(variant, brand, mode) {
  switch (mode) {
    case 'exact':
      return variant === brand
    case 'prefix':
      return variant.startsWith(brand) && (
        variant.length === brand.length ||
        /\s/.test(variant[brand.length]) // brand must end at a word boundary
      )
    case 'token':
      // One-directional: brand tokens must appear within the variant.
      // NOT bidirectional — checking if variant tokens appear inside
      // the brand name causes false positives (e.g. variant "Sydney"
      // matching group name "Sydney Lodges").
      return variant === brand || tokenContains(variant, brand)
    default:
      return variant === brand || tokenContains(variant, brand)
  }
}

/**
 * @param {object} candidate — way_candidates row
 * @param {object} supabase — portal admin client
 * @returns {Promise<{
 *   gate: 'pass' | 'fail',
 *   matchedGroup?: string,
 *   verifyCaseByCase?: boolean,
 *   reason: string,
 * }>}
 */
export async function evaluateGate1(candidate, supabase) {
  // Global-scope rows (vertical_scope IS NULL) apply to ALL verticals.
  // The .contains() filter alone misses them because NULL @> ARRAY['way']
  // is NULL, not true. Use .or() to include both.
  const { data: groups, error } = await supabase
    .from('commercial_groups')
    .select('group_name, brands, brands_json, domains, verify_case_by_case, notes')
    .or('vertical_scope.cs.{way},vertical_scope.is.null')

  if (error) {
    return { gate: 'pass', reason: `commercial_groups query error: ${error.message}; defaulting pass` }
  }
  if (!groups || groups.length === 0) {
    return { gate: 'pass', reason: 'no way-scoped commercial groups in database' }
  }

  const candidateVariants = (Array.isArray(candidate.name_variants) && candidate.name_variants.length > 0)
    ? candidate.name_variants
    : generateNameVariants(candidate.name)

  let candidateHost = ''
  try { candidateHost = new URL(candidate.website_url).hostname.toLowerCase() } catch {}

  for (const group of groups) {
    const failResult = (reason) => ({
      gate: 'fail',
      matchedGroup: group.group_name,
      verifyCaseByCase: group.verify_case_by_case || false,
      reason: reason + (group.verify_case_by_case ? ' (verify case-by-case)' : ' — auto-reject'),
    })

    // ── Brand matching ──────────────────────────────────────────
    const hasBrandsJson = Array.isArray(group.brands_json) && group.brands_json.length > 0

    if (hasBrandsJson) {
      // match_mode-aware matching via brands_json
      // Also test the group_name itself with token mode
      const groupNameLower = group.group_name.toLowerCase().trim()

      for (const variant of candidateVariants) {
        const v = variant.toLowerCase()

        // Test group_name with token mode
        if (brandMatches(v, groupNameLower, 'token')) {
          return failResult(`name match against ${group.group_name}`)
        }

        // Test each brand with its assigned match_mode
        for (const brandEntry of group.brands_json) {
          const brandName = (brandEntry.name || '').toLowerCase().trim()
          const mode = brandEntry.match_mode || 'prefix'
          if (!brandName) continue

          if (brandMatches(v, brandName, mode)) {
            return failResult(`brand match "${brandEntry.name}" (${mode}) against ${group.group_name}`)
          }
        }
      }
    } else {
      // Fallback: legacy brands TEXT[] with token-containment matching
      // One-directional only: group/brand tokens must appear within the
      // candidate variant, NOT the reverse.  The old bidirectional check
      // caused false positives (e.g. variant "Sydney" matching group
      // "Sydney Lodges").
      const groupNames = [
        group.group_name,
        ...(Array.isArray(group.brands) ? group.brands : []),
      ]
      const groupNormed = groupNames.map(n => n.toLowerCase().trim())

      for (const variant of candidateVariants) {
        const v = variant.toLowerCase()
        for (const gn of groupNormed) {
          if (v === gn || tokenContains(v, gn)) {
            return failResult(`name match against ${group.group_name}`)
          }
        }
      }
    }

    // ── Domain matching ──────────────────────────────────────────
    if (candidateHost && Array.isArray(group.domains)) {
      for (const domain of group.domains) {
        const d = domain.toLowerCase()
        if (candidateHost === d || candidateHost.endsWith('.' + d)) {
          return failResult(`domain match ${candidateHost} against ${group.group_name}`)
        }
      }
    }
  }

  return { gate: 'pass', reason: 'no commercial group match' }
}
