/**
 * Gate Check — one-click repair remediation model.
 *
 * Given a gate-check row (+ its listing), returns the SAFE, unambiguous repairs
 * the "Repair" button can apply. Pure module — imported by both the client (to
 * render the button + label) and the API route (to apply the fix).
 *
 * We deliberately only surface repairs that are safe to auto-apply:
 *   • fix_website  — the site is dead/parked/unrelated; find the correct one via
 *                    Google Places (name-guarded) or, failing that, remove the
 *                    dead URL (nulling is compliant + removes the broken link).
 *   • regeocode    — the pin is clearly broken (null-island / outside Australia);
 *                    re-derive coordinates from the address.
 *   • move_vertical— an AI vertical-fit check found the listing belongs in a
 *                    DIFFERENT Atlas; move it there.
 *
 * NOT offered: wrong_state (ambiguous — the pin may be right and the state label
 * wrong, or vice-versa; the reviewer should eyeball the map), and
 * character/service-trade (those are Hide/Delete decisions, not repairs).
 */

export const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// Gate-1 codes whose fix is "find the correct website, else drop the dead URL".
const WEB_REPAIR_CODES = new Set(['domain_dead', 'http_gone', 'parked_domain', 'name_mismatch', 'unreachable', 'unreachable_timeout'])

/**
 * @param {object} row - listing_gate_check row (needs gate_details)
 * @param {object} listing - joined listing (needs lat/lng/website for some checks)
 * @returns {Array<{type, gates:string[], label, to?}>}
 */
export function getRemediations(row, listing = {}) {
  const details = Array.isArray(row?.gate_details) ? row.gate_details : []
  const out = []
  const find = (gate, codePred) => details.find(d => d.gate === gate && (!codePred || codePred(d.code, d)))

  if (find('gate1_web', c => WEB_REPAIR_CODES.has(c))) {
    out.push({ type: 'fix_website', gates: ['gate1_web'], label: 'Find the correct website (or remove the dead link)' })
  }

  if (find('gate2_location', c => c === 'null_coords' || c === 'outside_australia')) {
    out.push({ type: 'regeocode', gates: ['gate2_location'], label: 'Re-pin from the address' })
  }

  const wv = find('gate4_vertical', (c, d) => c === 'wrong_vertical_ai' && d.suggested_vertical)
  if (wv) {
    out.push({ type: 'move_vertical', gates: ['gate4_vertical'], to: wv.suggested_vertical, label: `Move to ${VERTICAL_LABELS[wv.suggested_vertical] || wv.suggested_vertical} Atlas` })
  }

  return out
}

export function isRepairable(row, listing) {
  return getRemediations(row, listing).length > 0
}

// A short combined label for the Repair button's tooltip / caption.
export function repairSummary(row, listing) {
  const rs = getRemediations(row, listing)
  if (!rs.length) return null
  return rs.map(r => r.label).join(' · ')
}
