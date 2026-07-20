// Shared constants + helpers for the Itinerary Engine.
import { getVerticalBadge } from '@/lib/verticalUrl'

// Day palette — warm, on-brand, distinct at a glance. Numbered stop markers and
// their route line take the day's colour so the multi-day structure reads on the
// map without a legend. Ordered to harmonise: sage, gold, terracotta, plum, …
export const DAY_COLORS = [
  '#5F8A7E', // sage
  '#C4973B', // gold
  '#C4603A', // terracotta
  '#7A6B8A', // plum
  '#4A7C59', // field green
  '#5A8A9A', // rest blue
  '#8A6B4A', // fine brown
]

export function dayColor(day) {
  return DAY_COLORS[day % DAY_COLORS.length]
}

// The "what are you into?" taxonomy — public verticals given warm, plain-English
// framing. Order is curated for the intake grid, not the canonical vertical order.
export const INTERESTS = [
  { vertical: 'table', label: 'Food & dining', hint: 'Restaurants, bakeries, markets' },
  { vertical: 'fine_grounds', label: 'Coffee', hint: 'Specialty roasters & cafés' },
  { vertical: 'sba', label: 'Wine, beer & spirits', hint: 'Cellar doors & distilleries' },
  { vertical: 'field', label: 'Nature & outdoors', hint: 'Walks, lookouts, wild swims' },
  { vertical: 'collection', label: 'Culture', hint: 'Galleries, museums, theatre' },
  { vertical: 'corner', label: 'Shops', hint: 'Bookshops, homewares, design' },
  { vertical: 'found', label: 'Vintage & antiques', hint: 'Op shops & curiosities' },
  { vertical: 'rest', label: 'Places to stay', hint: 'Boutique stays & farm stays' },
]

export const TRIP_LENGTHS = [
  { days: 1, label: 'A day trip', hint: 'Out and back in a day' },
  { days: 2, label: 'A weekend', hint: 'Two days, one night' },
  { days: 3, label: 'A long weekend', hint: 'Three days to settle in' },
  { days: 5, label: 'A few days', hint: 'Five days, no rush' },
]

export const PACES = [
  { key: 'relaxed', label: 'Relaxed', hint: 'Two or three stops a day', perDay: 3 },
  { key: 'balanced', label: 'Balanced', hint: 'A comfortable four or five', perDay: 5 },
  { key: 'packed', label: 'See it all', hint: 'Pack the day full', perDay: 7 },
]

// ── The day arc ──
// A day progresses through slots: breakfast → activity → lunch → activity →
// dinner → (activity) → somewhere to sleep. Each slot offers a small set of
// choices; the chooser only ever asks one question at a time.
export const SLOTS = {
  breakfast: { key: 'breakfast', label: 'Breakfast', question: 'Where’s breakfast?', icon: 'coffee' },
  morning: { key: 'morning', label: 'Morning', question: 'What’s the morning look like?', icon: 'compass' },
  lunch: { key: 'lunch', label: 'Lunch', question: 'Where’s lunch?', icon: 'plate' },
  afternoon: { key: 'afternoon', label: 'Afternoon', question: 'How about the afternoon?', icon: 'compass' },
  dinner: { key: 'dinner', label: 'Dinner', question: 'And dinner?', icon: 'wine' },
  evening: { key: 'evening', label: 'Evening', question: 'One more for the evening?', icon: 'moon' },
  sleep: { key: 'sleep', label: 'Overnight', question: 'Where are you staying tonight?', icon: 'bed' },
}

// The arc for one day, shaped by pace. Multi-day trips get an overnight slot
// on every day except the last (you head home on the final evening).
export function dayArc(pace, day, dayCount) {
  const base =
    pace === 'relaxed'
      ? ['breakfast', 'morning', 'lunch', 'dinner']
      : pace === 'packed'
        ? ['breakfast', 'morning', 'lunch', 'afternoon', 'dinner', 'evening']
        : ['breakfast', 'morning', 'lunch', 'afternoon', 'dinner']
  if (dayCount > 1 && day < dayCount - 1) return [...base, 'sleep']
  return base
}

export function verticalShort(v) {
  return getVerticalBadge(v)
}

// Human label for a listing's sub_type — mirrors the display taxonomy used on
// cards network-wide (special cases first, generic prettify as fallback).
const SUB_TYPE_LABELS = {
  bnb: 'B&B',
  sba: 'Small batch',
  op_shop: 'Op shop',
  wildlife_zoo: 'Wildlife',
  ceramics_clay: 'Ceramics',
  jewellery_metalwork: 'Jewellery',
  textile_fibre: 'Textiles',
  wood_furniture: 'Woodwork',
  visual_art: 'Visual art',
  books_ephemera: 'Books & ephemera',
  art_objects: 'Art & objects',
  farm_gate: 'Farm gate',
  artisan_producer: 'Artisan producer',
  specialty_retail: 'Specialty retail',
  cultural_centre: 'Cultural centre',
  botanical_garden: 'Botanic garden',
  botanic_garden: 'Botanic garden',
  heritage_site: 'Heritage site',
  non_alcoholic: 'Non-alcoholic',
  sake_brewery: 'Sake brewery',
}

export function formatSubType(subType) {
  if (!subType) return null
  if (SUB_TYPE_LABELS[subType]) return SUB_TYPE_LABELS[subType]
  const s = String(subType).replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDistance(km) {
  if (km == null) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function formatDuration(min) {
  if (min == null) return null
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} hr ${m} min` : `${h} hr`
}

// A gentle default title from the destination + shape of the trip.
export function defaultTitle({ regionName, dayCount }) {
  const where = regionName || 'Australia'
  if (dayCount <= 1) return `A day in ${where}`
  if (dayCount === 2) return `A weekend in ${where}`
  return `${dayCount} days in ${where}`
}
