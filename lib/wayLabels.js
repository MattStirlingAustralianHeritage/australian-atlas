// ============================================================
// lib/wayLabels.js
//
// Single source of truth for all Way Atlas vocabulary labels.
// Consumed by:
//   - app/place/[slug]/page.js          (detail rendering)
//   - app/admin/candidates/…            (classification panel)
//   - components/ListingCard.js          (card subcategory)
//   - app/api/admin/candidates/[id]/…   (validation)
//
// Values must match the CHECK constraints in
// supabase/migrations/115_way_meta.sql.
// ============================================================

// ── Primary type (experience category) ───────────────────────
// 17 canonical types per Way Atlas Spec Section III.
// Order follows the spec's narrative grouping:
//   walks → cultural → flights → marine → specialist → heritage → workshop → mobility

export const WAY_PRIMARY_TYPE_LABELS = {
  guided_walk_multiday: 'Multi-day guided walk',
  guided_walk_day: 'Day walk',
  cultural_tour: 'Cultural tour',
  scenic_flight: 'Scenic flight',
  helicopter_tour: 'Helicopter tour',
  sailing_charter: 'Sailing charter',
  sea_kayak_tour: 'Sea kayak',
  dive_operator: 'Dive operator',
  fishing_guide: 'Fishing guide',
  photography_expedition: 'Photography expedition',
  specialist_natural_history: 'Natural history guide',
  foraging_bushfood: 'Foraging & bush food',
  heritage_tour: 'Heritage tour',
  workshop_intensive: 'Workshop intensive',
  river_canoe_tour: 'River canoe',
  horseback_expedition: 'Horseback expedition',
  four_wheel_drive_expedition: 'Four-wheel drive expedition',
}

// Canonical list of valid primary type keys, for validation.
export const WAY_PRIMARY_TYPES = Object.keys(WAY_PRIMARY_TYPE_LABELS)

// ── Operator type ────────────────────────────────────────────
// 8 canonical values per way_meta.operator_type CHECK.

export const WAY_OPERATOR_TYPE_LABELS = {
  independent: 'Independent operator',
  aboriginal_community: 'Aboriginal community',
  aboriginal_owned_led: 'Aboriginal-owned and Aboriginal-led',
  aboriginal_partnership: 'Aboriginal partnership',
  concessionaire: 'Concessionaire',
  trust: 'Trust',
  public_heritage: 'Public heritage',
  cultural_content_non_indigenous: 'Cultural content (non-Indigenous)',
}

export const WAY_OPERATOR_TYPES = Object.keys(WAY_OPERATOR_TYPE_LABELS)

// ── Presence type ────────────────────────────────────────────
// 10 canonical values per way_meta.presence_type CHECK.

export const WAY_PRESENCE_TYPE_LABELS = {
  permanent: 'Year-round',
  by_appointment: 'By appointment',
  markets: 'Markets',
  online: 'Online',
  mobile: 'Mobile',
  seasonal: 'Seasonal',
  year_round: 'Year-round',
  weather_dependent: 'Weather dependent',
  charter_only: 'Charter only',
  tide_dependent: 'Tide dependent',
}

// ── Accreditations ───────────────────────────────────────────

export const WAY_ACCREDITATION_LABELS = {
  atap: 'ATAP',
  eco_cert: 'EcoTourism Australia',
  roc: 'Respecting Our Culture',
  narta: 'NARTA',
  sat_quality: 'SAT Quality Assured',
  green_travel: 'Green Travel Leader',
}

// ── Month labels ─────────────────────────────────────────────
// For operating_season_months (integer[] of 1–12).

export const MONTH_LABELS = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December',
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: MONTH_LABELS[i + 1],
}))

// ── Options arrays (for admin dropdowns / multi-selects) ─────
// Derived from the label dictionaries above so values stay in sync.

export const WAY_PRIMARY_TYPE_OPTIONS = Object.entries(WAY_PRIMARY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)

export const WAY_OPERATOR_TYPE_OPTIONS = Object.entries(WAY_OPERATOR_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)

export const WAY_PRESENCE_TYPE_OPTIONS = Object.entries(WAY_PRESENCE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)

export const WAY_ACCREDITATION_OPTIONS = Object.entries(WAY_ACCREDITATION_LABELS).map(
  ([value, label]) => ({ value, label })
)

// ── Gate 4 helpers ───────────────────────────────────────────
// Cultural authority verification is required when:
//   1. primary_type === 'cultural_tour', OR
//   2. operator_type starts with 'aboriginal_'
// Per Way Atlas Spec Section VI and the editorial posture:
// "where the line is unclear, the default is exclusion."

/**
 * Returns true if the operator_type is one of the three
 * Aboriginal-prefixed categories.
 */
export function isAboriginalOperatorType(operatorType) {
  return typeof operatorType === 'string' && operatorType.startsWith('aboriginal_')
}

/**
 * Returns true if Gate 4 (cultural authority verification)
 * applies to this combination of primary_type and operator_type.
 */
export function requiresCulturalAuthority(primaryType, operatorType) {
  return primaryType === 'cultural_tour' || isAboriginalOperatorType(operatorType)
}
