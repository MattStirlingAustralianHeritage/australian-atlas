// ============================================================
// Operator Highlights — the operator-authored, timely layer
// ============================================================
//
// "Highlights" let a claimed operator say, in their own words, what their
// place is doing RIGHT NOW — the things a synced editorial description can't
// keep up with: the beans on the roaster this week, the stout they just put on
// tap, the term they're taking enrolments for, the exhibition that opens
// Friday. Plus a universal hiring signal (toggle + jobs link).
//
// This is deliberately DIFFERENT from the editorial `description` flow
// (lib/operator-intake): that flow turns operator FACTS into Atlas-voice prose
// with AI + admin review. Highlights are short, structured, operator-owned
// statements of fact that publish directly — the same trust model as the
// website / phone / hours an operator already edits themselves.
//
// Storage: a single `listings.operator_highlights` JSONB column. Master-only,
// never written to a vertical source DB and never set by the inbound sync
// field maps — so it survives sync "by omission", exactly like listings.hours.
//
// Shape persisted:
//   {
//     hiring: { open: boolean, url: string|null, note: string|null },
//     fields: { <fieldKey>: string | string[] },   // typed per vertical
//     updated_at: ISO8601
//   }
//
// This module is ISOMORPHIC (no server-only imports) so the operator editor
// (client), the write route (server) and the place page (server) all read the
// same field definitions. Server-side validation lives in ./normalize.js,
// which layers the Atlas banned-phrase check on top of these definitions.

// ── Field-length budgets ────────────────────────────────────
// Highlights are a glance, not an essay. Caps keep them tight and on-brand,
// and double as a light abuse ceiling for free-text that publishes directly.
export const LIMITS = {
  text: 160,        // single concrete line
  textarea: 420,    // a short paragraph — a few sentences at most
  url: 400,
  listItem: 90,     // one stockist / tap / market line
  listItems: 12,    // at most this many list rows
  hiringNote: 140,
}

// ── The universal hiring block ──────────────────────────────
// Every claimable operator can flag that they're hiring and point to where the
// roles live (a Seek ad, a careers page, an application form). The note is an
// optional one-liner naming the role.
export const HIRING = {
  toggleLabel: 'We’re hiring',
  toggleHelp: 'Turn this on to show a “Now hiring” note on your public page.',
  url: {
    key: 'url',
    label: 'Jobs link',
    help: 'Where people can see the role — a Seek ad, your careers page, or an application form.',
    placeholder: 'https://www.seek.com.au/…',
  },
  note: {
    key: 'note',
    label: 'What you’re hiring for',
    help: 'Optional. One short line. e.g. “Looking for a full-time baker.”',
    placeholder: 'Looking for a full-time baker',
  },
}

// ── Per-vertical highlight fields ───────────────────────────
// Each vertical gets a small, native set of fields. Field shape:
//   { key, label, help, type: 'text'|'textarea'|'list'|'url', placeholder }
// Keep sets to 2–4 fields: a highlight is a signal, not a second listing.
//
// Headings are what the public section is titled ("From the roastery", …).

const FIELDS = {
  // Fine Grounds — split by entity. Roasters lead with what's on the roaster;
  // cafés lead with what they're pouring.
  fine_grounds_roaster: {
    heading: 'From the roastery',
    intro: 'What you’re roasting and pouring right now.',
    fields: [
      { key: 'on_the_roaster', label: 'On the roaster now', type: 'textarea',
        help: 'The beans you’re roasting right now — origin, process, a tasting note.',
        placeholder: 'A washed Colombian from Huila, and a natural Ethiopian Guji — bright, stone-fruit.' },
      { key: 'stockists', label: 'Where to find our coffee', type: 'list',
        help: 'Cafés and shops pouring or stocking your beans. One per line.',
        placeholder: 'Maker & Monger, Prahran\nThe Above, Fitzroy' },
      { key: 'subscription_url', label: 'Coffee subscription', type: 'url',
        help: 'A link to your subscription or online shop.',
        placeholder: 'https://…' },
    ],
  },
  fine_grounds_cafe: {
    heading: 'From the café',
    intro: 'What’s in the cup and on the menu this season.',
    fields: [
      { key: 'pouring_now', label: 'Beans we’re pouring', type: 'text',
        help: 'The roaster and beans on your machine right now.',
        placeholder: 'Proud Mary house blend, plus a rotating single origin' },
      { key: 'on_the_menu', label: 'On the menu', type: 'textarea',
        help: 'What’s worth ordering — the seasonal dish, the house specialty.',
        placeholder: 'Weekend brunch only; the cardamom bun sells out by ten.' },
      { key: 'order_url', label: 'Menu or order ahead', type: 'url',
        help: 'A link to your menu or online ordering, if you have one.',
        placeholder: 'https://…' },
    ],
  },

  // Small Batch — one generic set covering breweries, distilleries, wineries,
  // cideries, cheesemakers. "Latest release" + "On now" carries a brewery's
  // special stout, a winery's new vintage, a cheesemaker's fresh wheel alike.
  sba: {
    heading: 'From the maker',
    intro: 'Your latest release and what visitors can taste right now.',
    fields: [
      { key: 'latest_release', label: 'Latest release', type: 'textarea',
        help: 'Your newest or current release — what it is, and when it landed.',
        placeholder: 'A barrel-aged imperial stout, on now for winter.' },
      { key: 'on_now', label: 'On now', type: 'textarea',
        help: 'What’s pouring, tasting, or fresh out — the taproom list, cellar-door pours, this week’s make.',
        placeholder: 'Six taps pouring, including the new stout and a hazy pale.' },
      { key: 'stockists', label: 'Where to buy', type: 'list',
        help: 'Stockists, bottle shops, or markets carrying your product. One per line.',
        placeholder: 'Blackhearts & Sparrows\nSlowbeer, Hawthorn' },
      { key: 'shop_url', label: 'Online shop', type: 'url',
        help: 'A direct link to buy online.',
        placeholder: 'https://…' },
    ],
  },

  // Craft — makers and studios. Leads with what's in the studio and what
  // classes are enrolling.
  craft: {
    heading: 'From the studio',
    intro: 'What you’re making and which classes are open.',
    fields: [
      { key: 'in_the_studio', label: 'In the studio now', type: 'textarea',
        help: 'What you’re making or showing right now.',
        placeholder: 'A run of wood-fired tumblers for the spring market.' },
      { key: 'enrolments', label: 'Classes & enrolments', type: 'textarea',
        help: 'Classes you’re taking enrolments for — what, what level, which term.',
        placeholder: 'Beginner wheel-throwing — enrolling now for the autumn term.' },
      { key: 'classes_url', label: 'Book a class', type: 'url',
        help: 'A link to class times or bookings.',
        placeholder: 'https://…' },
      { key: 'shop_url', label: 'Shop or commission', type: 'url',
        help: 'A link to buy your work or enquire about a commission.',
        placeholder: 'https://…' },
    ],
  },

  // Table — independent dining. Specials, the menu, a booking link.
  table: {
    heading: 'From the kitchen',
    intro: 'What’s on the menu and how to get a table.',
    fields: [
      { key: 'on_the_menu_now', label: 'On the menu now', type: 'textarea',
        help: 'This week’s specials, the seasonal dish, what you’re proud of right now.',
        placeholder: 'Marron season — chargrilled, with finger lime and brown butter.' },
      { key: 'menu_url', label: 'See the menu', type: 'url',
        help: 'A link to your current menu.',
        placeholder: 'https://…' },
      { key: 'bookings_url', label: 'Book a table', type: 'url',
        help: 'Your reservations link.',
        placeholder: 'https://…' },
    ],
  },

  // Collection — cultural institutions. What's on, and how to get in.
  collection: {
    heading: 'What’s on',
    intro: 'Your current show and what it costs to visit.',
    fields: [
      { key: 'on_now', label: 'On now', type: 'textarea',
        help: 'The current exhibition or show — its title and dates.',
        placeholder: '“Light Years” — new work by Lena Cobby, until 14 September.' },
      { key: 'whats_on_url', label: 'What’s on', type: 'url',
        help: 'A link to your exhibitions or events.',
        placeholder: 'https://…' },
      { key: 'admission', label: 'Admission', type: 'text',
        help: 'e.g. “Free entry”, or “Adults $18, members free.”',
        placeholder: 'Free entry' },
    ],
  },

  // Corner — independent shops. What's just landed + the online store.
  corner: {
    heading: 'In the shop',
    intro: 'What’s just landed and where to buy.',
    fields: [
      { key: 'new_in', label: 'New in store', type: 'textarea',
        help: 'What’s just landed — the labels or makers you’re excited about right now.',
        placeholder: 'Just in: a fresh run of hand-bound notebooks from Mona Press.' },
      { key: 'shop_url', label: 'Shop online', type: 'url',
        help: 'A link to your online store.',
        placeholder: 'https://…' },
    ],
  },

  // Found — vintage & secondhand. Fresh finds + where to catch them at market.
  found: {
    heading: 'In the shop',
    intro: 'Fresh finds, and where to catch you next.',
    fields: [
      { key: 'just_arrived', label: 'Just arrived', type: 'textarea',
        help: 'Fresh finds in store right now.',
        placeholder: 'A trove of 70s Danish teak just landed — sideboards and lounge chairs.' },
      { key: 'find_us_at', label: 'Find us at', type: 'text',
        help: 'Your next market or fair, if you do them.',
        placeholder: 'Rose St Market — first Sunday of the month' },
      { key: 'shop_url', label: 'Shop online', type: 'url',
        help: 'A link to your online store, if you have one.',
        placeholder: 'https://…' },
    ],
  },

  // Rest — boutique stays. Availability, an offer, a direct booking link.
  rest: {
    heading: 'Your stay',
    intro: 'What’s open to book and any current offer.',
    fields: [
      { key: 'availability', label: 'Availability & stays', type: 'textarea',
        help: 'What’s open for booking, minimum stays, the season ahead.',
        placeholder: 'Open for winter — two-night minimum, wood delivered to the door.' },
      { key: 'offer', label: 'Current offer', type: 'text',
        help: 'A current rate or package, if you have one.',
        placeholder: 'Midweek winter rate — three nights for the price of two' },
      { key: 'book_url', label: 'Book direct', type: 'url',
        help: 'Your direct booking link.',
        placeholder: 'https://…' },
    ],
  },

  // Way — experiences. What's running this season, and how to book.
  way: {
    heading: 'Before you book',
    intro: 'What’s running this season, and where to book.',
    fields: [
      { key: 'whats_running', label: 'What’s running', type: 'textarea',
        help: 'Current departures and seasons.',
        placeholder: 'Whale-watching daily, June to November — morning and afternoon departures.' },
      { key: 'book_url', label: 'Book this experience', type: 'url',
        help: 'Your booking link.',
        placeholder: 'https://…' },
    ],
  },

  // Field — natural places have NO operator/commercial layer (is_claimed is
  // always false in the sync). No one edits them, so they get no highlights.
  field: { heading: null, intro: null, fields: [] },
}

// Verticals whose listings can be claimed and therefore edited. Field Atlas is
// excluded (no operator/commercial layer — nobody claims a waterfall). Every
// other vertical gets the hiring block, plus its type-specific fields if any
// are defined. Used to gate the editor and the public render.
export function verticalSupportsHighlights(vertical) {
  return vertical !== 'field'
}

// Resolve the FIELDS key for a (vertical, subType). Only Fine Grounds splits on
// sub_type (roaster vs café); everything else is keyed by vertical alone.
function resolveFieldKey(vertical, subType) {
  if (vertical === 'fine_grounds') {
    return String(subType || '').toLowerCase() === 'cafe'
      ? 'fine_grounds_cafe'
      : 'fine_grounds_roaster'
  }
  return vertical
}

// The editor/render definition for a listing: { heading, intro, fields }.
// Returns an empty definition for verticals without a highlight set.
export function getHighlightDef(vertical, subType) {
  return FIELDS[resolveFieldKey(vertical, subType)] || { heading: null, intro: null, fields: [] }
}

// Just the field array (convenience).
export function getHighlightFields(vertical, subType) {
  return getHighlightDef(vertical, subType).fields
}

// All field keys a vertical can legitimately store — used by the normaliser to
// drop anything unexpected.
export function allowedFieldKeys(vertical, subType) {
  return getHighlightFields(vertical, subType).map(f => f.key)
}

// ── Empty / default value ───────────────────────────────────
export function emptyHighlights() {
  return { hiring: { open: false, url: null, note: null }, fields: {} }
}

// ── Render-gating helpers (shared by editor + place page) ───

// Does a single field value carry content?
export function fieldHasValue(field, value) {
  if (value == null) return false
  if (field.type === 'list') return Array.isArray(value) && value.some(v => String(v || '').trim())
  return String(value).trim().length > 0
}

// Is the hiring block active and pointable? (open === true is enough to show a
// "now hiring" note; a url/note enriches it.)
export function hiringIsActive(highlights) {
  return !!(highlights && highlights.hiring && highlights.hiring.open === true)
}

// Does this listing have ANY public highlight content (fields or hiring)?
// Drives whether the public section renders at all.
export function hasAnyHighlights(highlights, vertical, subType) {
  if (!highlights) return false
  if (hiringIsActive(highlights)) return true
  const fields = getHighlightFields(vertical, subType)
  const stored = highlights.fields || {}
  return fields.some(f => fieldHasValue(f, stored[f.key]))
}

// Normalise a URL for DISPLAY only (drops protocol + trailing slash). Mirrors
// cleanWebsite() used elsewhere on the place page. Never used for hrefs.
export function highlightUrlLabel(url) {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '')
  } catch {
    return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
