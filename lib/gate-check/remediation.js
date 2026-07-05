/**
 * Gate Check — granular repair remediation model.
 *
 * Given a gate-check row (+ its listing), returns the repairs the review card
 * can offer. Pure module — imported by both the client (to render the fix
 * buttons + labels) and the API route (to apply the fix).
 *
 * Each remediation is applied on its OWN button so the reviewer stays in control
 * — no single "Repair" click silently mutates several fields at once. Every
 * remediation carries a `destructive` flag; destructive ones (removing a link)
 * are NEVER bundled into the one-click auto-repair — they must be chosen
 * explicitly.
 *
 * Repair types:
 *   • fix_website     — the site is dead/parked/unrelated; find the correct one
 *                       via Google Places (name-guarded) and SWAP IT IN. This is
 *                       replace-only — it never deletes the current link. If no
 *                       confident replacement is found it is a no-op (the
 *                       reviewer can paste the correct URL, Hide, or Delete).
 *   • remove_dead_link— destructive: clear a confirmed-dead URL from the listing.
 *                       Offered ONLY when the site is confidently gone
 *                       (domain_dead / http_gone / parked_domain) and only ever
 *                       runs when the reviewer clicks it deliberately.
 *   • regeocode       — re-derive coordinates from the address. Offered for a
 *                       null-island pin, an out-of-Australia pin, AND a
 *                       wrong-state pin. The flag clears only if the fresh pin
 *                       actually passes the location gate (re-verified server-
 *                       side), so re-geocoding an ambiguous wrong-state row is
 *                       safe — worst case the pin moves to the address and the
 *                       flag stays for the reviewer to eyeball.
 *   • move_vertical   — an AI vertical-fit check found the listing belongs in a
 *                       DIFFERENT Atlas; move it there.
 *
 * A manual "paste the correct URL" affordance is offered by the UI whenever a
 * web gate has failed — it is handled directly by the route, not modelled here.
 */

export const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// Gate-1 codes whose fix is "find the correct website".
const WEB_REPAIR_CODES = new Set(['domain_dead', 'http_gone', 'parked_domain', 'name_mismatch', 'unreachable', 'unreachable_timeout'])
// Gate-1 codes where the site is confidently GONE (not merely wrong or slow) —
// the only codes for which offering an explicit "remove the dead link" is safe.
export const DEAD_WEB_CODES = new Set(['domain_dead', 'http_gone', 'parked_domain'])
// Gate-2 codes we can act on by re-deriving coordinates from the address.
const GEO_REPAIR_CODES = new Set(['null_coords', 'outside_australia', 'wrong_state'])

/**
 * @param {object} row - listing_gate_check row (needs gate_details)
 * @param {object} listing - joined listing (needs lat/lng/website for some checks)
 * @returns {Array<{type, gates:string[], destructive:boolean, label, hint?, to?}>}
 */
export function getRemediations(row, listing = {}) {
  const details = Array.isArray(row?.gate_details) ? row.gate_details : []
  const out = []
  const find = (gate, codePred) => details.find(d => d.gate === gate && (!codePred || codePred(d.code, d)))

  const web = find('gate1_web', c => WEB_REPAIR_CODES.has(c))
  if (web) {
    // Always offer the non-destructive "find & swap the correct website" repair.
    out.push({
      type: 'fix_website', gates: ['gate1_web'], destructive: false,
      label: 'Find the correct website',
      hint: 'Look the venue up on Google Places and swap in its official site. Only ever replaces — never deletes the current link.',
    })
    // Only when the site is confidently gone, offer an explicit, destructive removal.
    if (DEAD_WEB_CODES.has(web.code)) {
      out.push({
        type: 'remove_dead_link', gates: ['gate1_web'], destructive: true,
        label: 'Remove the dead link',
        hint: 'Clear the broken website from the live listing.',
      })
    }
  }

  const geo = find('gate2_location', c => GEO_REPAIR_CODES.has(c))
  if (geo) {
    out.push({
      type: 'regeocode', gates: ['gate2_location'], destructive: false,
      label: 'Re-pin from the address or town',
      hint: geo.code === 'wrong_state'
        ? 'Re-derive coordinates from the street address — or, when there is none, from the listing’s town/region. The flag clears only if the new pin lands in the listed state; otherwise the pin still moves and the flag stays for you to check.'
        : 'Re-derive coordinates from the street address, or the listing’s town/region when there is no specific address, so the pin lands in the right area.',
    })
  }

  const wv = find('gate4_vertical', (c, d) => c === 'wrong_vertical_ai' && d.suggested_vertical)
  if (wv) {
    out.push({
      type: 'move_vertical', gates: ['gate4_vertical'], to: wv.suggested_vertical, destructive: false,
      label: `Move to ${VERTICAL_LABELS[wv.suggested_vertical] || wv.suggested_vertical} Atlas`,
    })
  }

  return out
}

// The remediations the one-click auto-repair (the "Repair all" button / R
// shortcut) is allowed to apply: the safe, non-destructive ones only. A
// destructive removal must always be chosen on its own button.
export function getAutoRemediations(row, listing) {
  return getRemediations(row, listing).filter(r => !r.destructive)
}

// Is there a manual "paste the correct URL" affordance to show? True whenever a
// web gate has failed — the reviewer can always supply the right URL by hand.
export function hasWebFailure(row) {
  const details = Array.isArray(row?.gate_details) ? row.gate_details : []
  return details.some(d => d.gate === 'gate1_web')
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
