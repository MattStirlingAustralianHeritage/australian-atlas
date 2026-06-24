/**
 * Atlas Trade — shared constants.
 *
 * The trade layer is a B2B surface for the travel trade (tour operators, DMCs,
 * trip designers). It is gated behind a beta trade account and never bleeds into
 * the consumer editorial surface. No payments in beta — AUP + attribution
 * acceptance is the only gate.
 */

// Rendered on every itinerary artefact (web + PDF). A condition of use, not
// white-label — never removable by the trade account.
export const ATLAS_ATTRIBUTION = 'Curated via Atlas'

// The AUP the trade account accepts at signup. Bump the version when the terms
// change; acceptance rows record the version that was in force.
export const TRADE_AUP_VERSION = 1

// The acceptable-use points the operator agrees to at signup. Shown verbatim on
// the apply form and logged (version + timestamp) against the account.
export const TRADE_AUP_POINTS = [
  'I will keep the "Curated via Atlas" attribution on every itinerary I produce — it is not removable.',
  'I will not white-label, rebrand, or pass off the Atlas network or its curation as my own.',
  'I will not resell access to the builder or bulk-export the network for resale.',
  'I will not scrape, harvest, or systematically copy listing data outside the itineraries I build.',
  'I understand trade rates and capacity shown for an operator are indicative — I will confirm directly with the operator before booking.',
]

// Founding-cohort framing. Capped (no dollar figure anywhere). Members beyond the
// cap are still free during beta; they simply aren't in the founding cohort.
export const TRADE_FOUNDING_COHORT_CAP = 50

export const TRADE_ACCOUNT_TYPES = [
  { value: 'tour_operator', label: 'Tour operator' },
  { value: 'dmc', label: 'DMC / inbound operator' },
  { value: 'inbound_operator', label: 'Inbound operator' },
  { value: 'trip_designer', label: 'Trip designer' },
  { value: 'other', label: 'Something else' },
]

/**
 * The first invoice aligns to the 1 July financial year. Returns the upcoming
 * 1 July (this year's if we're on/before it, otherwise next year's) as a
 * YYYY-MM-DD date string. Founding rate locks at signup; this is when the first
 * (future) invoice would fall due — there is no charge during beta.
 */
export function nextFinancialYearStart(now = new Date()) {
  const year = now.getUTCFullYear()
  const julyFirstThisYear = Date.UTC(year, 6, 1) // month 6 = July (0-indexed)
  const due = now.getTime() <= julyFirstThisYear
    ? new Date(julyFirstThisYear)
    : new Date(Date.UTC(year + 1, 6, 1))
  return due.toISOString().slice(0, 10)
}
