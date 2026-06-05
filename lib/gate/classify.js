/**
 * Gate-review classifier — pure, DB-free, deterministic.
 *
 * Imported by /api/admin/scan-gates and by scripts/_test-gate-classifier.mjs.
 * FLAGS ONLY: nothing here ever mutates a listing. classifyListing() inspects a
 * single listing object and returns a flag descriptor (or null).
 *
 * Two mechanisms (both gate 'wrong_category'):
 *   1. Service-trade keyword match against SERVICE_TRADE_DISQUALIFIERS.
 *      NAME match  -> high confidence (a glazier is a service trade, not a
 *                     visitable destination).
 *      DESCRIPTION-only match -> low confidence (e.g. a café in a "former
 *                     glazier's workshop" must NOT be a high-confidence flag).
 *   2. Junk sub_type match against JUNK_TYPES (seeded empty — see note).
 *
 * Softer gates ('character' | 'destination' | 'independence') are reserved for a
 * future LLM pass (flag_source 'llm_classifier') and manual flags; the
 * deterministic scanner intentionally does not guess at them.
 */

// Confidence bands.
export const NAME_CONFIDENCE = 85   // high band — name strongly indicates a trade
export const DESC_CONFIDENCE = 40   // low band  — only the description mentions it
export const TYPE_CONFIDENCE = 90   // wholesale junk-type flag

// ── Service-trade disqualifiers ─────────────────────────────────────────────
// Each entry: { id, re, label, action }
//   re     — word-boundary regex (case-insensitive, NO /g flag so it is reusable).
//   label  — human-readable trade name for the flag_reason.
//   action — suggested_action for a NAME match: 'delete' for unambiguous trades,
//            'review' for terms that can legitimately appear in a destination
//            name (the human reviewer decides).
//
// Patterns are deliberately tight to avoid flagging real destinations:
//   • 'landscaping' matches landscaper/landscaping but NOT "landscape"
//     (so "Budj Bim Cultural Landscape" is never flagged).
//   • 'storage' matches self-storage/storage units but NOT a generic "…Storage
//     Tunnels" museum.
//   • 'vet' matches "veterinary"/"vet clinic" but never the bare letters in
//     words like "velvet" or "trivet".
// Extend this list freely — the scanner picks up additions on the next run.
export const SERVICE_TRADE_DISQUALIFIERS = [
  { id: 'glazier',     re: /\bglaz(?:ier|iers|ing)\b/i,                                            label: 'glazier/glazing',                action: 'delete' },
  { id: 'plumber',     re: /\bplumb(?:er|ers|ing)\b/i,                                             label: 'plumber/plumbing',               action: 'delete' },
  { id: 'electrician', re: /\belectric(?:ian|ians|al)\b/i,                                         label: 'electrician/electrical',         action: 'review' },
  { id: 'mechanic',    re: /\b(?:mechanic|mechanics|auto(?:motive)? repair|smash repair)\b/i,      label: 'mechanic/auto repair',           action: 'delete' },
  { id: 'panelbeater', re: /\bpanel\s?beat(?:er|ers|ing)?\b/i,                                     label: 'panel beater',                   action: 'delete' },
  { id: 'tyre',        re: /\btyres?\b/i,                                                          label: 'tyre dealer',                    action: 'review' },
  { id: 'locksmith',   re: /\blocksmiths?\b/i,                                                     label: 'locksmith',                      action: 'delete' },
  { id: 'accountant',  re: /\b(?:accountant|accountants|accounting|bookkeep(?:er|ing))\b/i,        label: 'accountant/bookkeeping',         action: 'delete' },
  { id: 'lawyer',      re: /\b(?:lawyer|lawyers|solicitor|solicitors|barrister|conveyanc(?:er|ing))\b/i, label: 'lawyer/solicitor/conveyancing', action: 'delete' },
  { id: 'mortgage',    re: /\bmortgage(?:s|\s+broker)?\b/i,                                        label: 'mortgage broker',                action: 'delete' },
  { id: 'insurance',   re: /\binsurance\b/i,                                                       label: 'insurance',                      action: 'delete' },
  { id: 'realestate',  re: /\b(?:real estate|realty|ray white|harcourts|lj hooker|raine\s*&\s*horne)\b/i, label: 'real estate agent',       action: 'delete' },
  { id: 'dentist',     re: /\b(?:dentist|dentists|dental)\b/i,                                     label: 'dentist/dental',                 action: 'delete' },
  { id: 'physio',      re: /\bphysio(?:therapy|therapist)?\b/i,                                    label: 'physiotherapy',                  action: 'delete' },
  { id: 'chiro',       re: /\bchiropract(?:or|ors|ic)\b/i,                                         label: 'chiropractor',                   action: 'delete' },
  { id: 'optometry',   re: /\boptometr(?:y|ist|ists)\b/i,                                          label: 'optometrist',                    action: 'delete' },
  { id: 'vet',         re: /\b(?:veterinary|veterinarian|vet clinic|vet hospital|vet surgery)\b/i, label: 'veterinary',                    action: 'delete' },
  { id: 'landscaping', re: /\blandscap(?:er|ers|ing)\b/i,                                          label: 'landscaping trade',              action: 'review' },
  { id: 'fencing',     re: /\bfencing\b/i,                                                         label: 'fencing trade',                  action: 'review' },
  { id: 'concreting',  re: /\bconcret(?:er|ers|ing)\b/i,                                           label: 'concreting',                     action: 'delete' },
  { id: 'roofing',     re: /\b(?:roofing|roof restoration|guttering)\b/i,                          label: 'roofing/guttering',              action: 'delete' },
  { id: 'pestcontrol', re: /\bpest control\b/i,                                                    label: 'pest control',                   action: 'delete' },
  { id: 'removalist',  re: /\b(?:removalist|removalists|furniture removal)\b/i,                    label: 'removalist',                     action: 'delete' },
  { id: 'storage',     re: /\b(?:self[-\s]?storage|storage units?|storage sheds?)\b/i,             label: 'self-storage',                   action: 'review' },
  { id: 'freight',     re: /\b(?:freight|haulage|courier service)\b/i,                             label: 'freight/haulage',                action: 'review' },
  { id: 'scaffolding', re: /\bscaffold(?:ing)?\b/i,                                                label: 'scaffolding',                    action: 'delete' },
  { id: 'tiling',      re: /\b(?:tiler|tilers|tiling)\b/i,                                         label: 'tiling trade',                   action: 'review' },
  { id: 'buildtrade',  re: /\b(?:bricklay(?:er|ing)|plasterer|plastering|rendering services)\b/i,  label: 'building trade',                 action: 'review' },
]

// ── Junk sub_type values ────────────────────────────────────────────────────
// The live sub_type distribution (Phase 1) contained NO non-destination
// categories — every populated value is a legitimate venue type (winery,
// brewery, lookout, museum, …). So this seeds EMPTY. The mechanism is retained
// and fully extendable: add any sub_type string here and the scanner flags every
// listing of that type on the next run.
export const JUNK_TYPES = new Set([
  // (none yet — populate from /admin/gate-review observations)
])

// Disqualifiers whose mention in a DESCRIPTION is too noisy to flag: the NAME is
// unambiguous (so "ABC Insurance" / "Smith Dental" is still caught by 1a), but
// these words appear innocently in legitimate venue copy — "set among beautiful
// landscaping", "the mechanics of letterpress", "we recommend insurance
// valuation", decorative "tiling". For these, match the name only. Physical
// trades (glazier, plumber, locksmith, storage, …) keep description matching,
// since a description mention there is a meaningful signal.
const NAME_ONLY_IDS = new Set([
  'electrician', 'mechanic', 'accountant', 'lawyer', 'mortgage', 'insurance',
  'realestate', 'dentist', 'physio', 'chiro', 'optometry', 'vet',
  'landscaping', 'fencing', 'tiling', 'buildtrade',
])

function firstMatch(re, str) {
  const m = str.match(re)
  return m ? m[0] : null
}

/**
 * Classify a single listing. Returns a flag descriptor or null.
 * @param {object} listing  - needs at least { name, description, sub_type }
 * @param {object} [opts]   - { disqualifiers, junkTypes } to override defaults (tests)
 */
export function classifyListing(listing, opts = {}) {
  const disqualifiers = opts.disqualifiers || SERVICE_TRADE_DISQUALIFIERS
  const junkTypes = opts.junkTypes || JUNK_TYPES

  const name = (listing && listing.name != null) ? String(listing.name) : ''
  const description = (listing && listing.description != null) ? String(listing.description) : ''
  const subType = (listing && listing.sub_type != null) ? String(listing.sub_type).toLowerCase().trim() : ''

  // Mechanism 2 — wholesale junk type (checked first).
  if (subType && junkTypes.has(subType)) {
    return {
      flagged: true,
      flag_source: 'deterministic_scan',
      gate_flagged: 'wrong_category',
      mechanism: 'junk_type',
      confidence: TYPE_CONFIDENCE,
      suggested_action: 'review',
      flag_reason: `Type "${subType}" is in JUNK_TYPES — not a visitable destination category`,
    }
  }

  // Mechanism 1a — service-trade keyword in the NAME (high confidence).
  for (const d of disqualifiers) {
    const hit = firstMatch(d.re, name)
    if (hit) {
      return {
        flagged: true,
        flag_source: 'deterministic_scan',
        gate_flagged: 'wrong_category',
        mechanism: 'keyword_name',
        confidence: NAME_CONFIDENCE,
        suggested_action: d.action || 'review',
        flag_reason: `Name contains "${hit}" — matches service-trade disqualifier (${d.label})`,
      }
    }
  }

  // Mechanism 1b — service-trade keyword in the DESCRIPTION only (low confidence).
  for (const d of disqualifiers) {
    if (NAME_ONLY_IDS.has(d.id)) continue
    const hit = firstMatch(d.re, description)
    if (hit) {
      return {
        flagged: true,
        flag_source: 'deterministic_scan',
        gate_flagged: 'wrong_category',
        mechanism: 'keyword_description',
        confidence: DESC_CONFIDENCE,
        suggested_action: 'review',
        flag_reason: `Description mentions "${hit}" — possible service-trade disqualifier (${d.label}); name does not match, so low confidence`,
      }
    }
  }

  return null
}
