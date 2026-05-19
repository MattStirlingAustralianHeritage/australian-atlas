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
 * Uses variant-aware matching: candidate name variants are tested against
 * group_name and every entry in the brands array. Domain matching tests
 * the candidate's website_url hostname against the group's domains array.
 */

import { generateNameVariants } from './variants.js'

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
  const { data: groups, error } = await supabase
    .from('commercial_groups')
    .select('group_name, brands, domains, verify_case_by_case, notes')
    .contains('vertical_scope', ['way'])

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
    // Name/brand matching: test each candidate variant against
    // group_name and every brand entry.
    const groupNames = [
      group.group_name,
      ...(Array.isArray(group.brands) ? group.brands : []),
    ]
    const groupNormed = groupNames.map(n => n.toLowerCase().trim())

    for (const variant of candidateVariants) {
      const v = variant.toLowerCase()
      for (const gn of groupNormed) {
        if (v === gn || v.includes(gn) || gn.includes(v)) {
          if (group.verify_case_by_case) {
            return {
              gate: 'fail',
              matchedGroup: group.group_name,
              verifyCaseByCase: true,
              reason: `name match against ${group.group_name} (verify case-by-case)`,
            }
          }
          return {
            gate: 'fail',
            matchedGroup: group.group_name,
            reason: `name match against ${group.group_name} — auto-reject`,
          }
        }
      }
    }

    // Domain matching: candidate website hostname against group domains.
    if (candidateHost && Array.isArray(group.domains)) {
      for (const domain of group.domains) {
        const d = domain.toLowerCase()
        if (candidateHost === d || candidateHost.endsWith('.' + d)) {
          if (group.verify_case_by_case) {
            return {
              gate: 'fail',
              matchedGroup: group.group_name,
              verifyCaseByCase: true,
              reason: `domain match ${candidateHost} against ${group.group_name} (verify case-by-case)`,
            }
          }
          return {
            gate: 'fail',
            matchedGroup: group.group_name,
            reason: `domain match ${candidateHost} against ${group.group_name} — auto-reject`,
          }
        }
      }
    }
  }

  return { gate: 'pass', reason: 'no commercial group match' }
}
