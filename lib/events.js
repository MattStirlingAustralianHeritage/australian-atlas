// Operator events — paid-tier perk.
//
// Canonical store: the master `events` table (migration 061):
//   id (bigint), title, slug (unique), description, category (free text),
//   start_date (timestamptz, NOT NULL), end_date, state, region,
//   hero_image_url, ticket_url, is_free, published (bool), listing_id (FK ->
//   listings.id), created_by, created_at, updated_at.
//
// An event is authored from the listing editor. When published it surfaces on
// BOTH the hosting listing (/place/[slug]) and the public /events index. The
// hosting listing supplies the venue/location context — the events table has no
// location columns of its own, so state/region are copied from the listing at
// write time (keeps the /events state filter working without a join).
//
// Paid gating (an active `standard` claim) is enforced by callers — same
// contract as the photo gallery (see lib/listing-gallery). This module is pure
// data access and assumes the caller has already authorised the write.

const SELECT_COLS =
  'id, title, slug, description, category, start_date, end_date, state, region, hero_image_url, ticket_url, is_free, published, listing_id, created_by, created_at, updated_at'

// Embed the hosting listing so public surfaces can show the venue + link to it.
const LISTING_EMBED = 'listing:listings ( id, name, slug, vertical, suburb, state, region )'

export function slugifyEventTitle(title) {
  const base = String(title || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || 'event'
}

// A slug unique across the whole events table (the column is UNIQUE). Resolves
// collisions as base, base-2, base-3, … in a single prefix query.
export async function uniqueEventSlug(sb, title) {
  const base = slugifyEventTitle(title)
  const { data } = await sb.from('events').select('slug').like('slug', `${base}%`)
  const taken = new Set((data || []).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const cand = `${base}-${n}`
    if (!taken.has(cand)) return cand
  }
  return `${base}-${Date.now().toString(36)}`
}

// Midnight today (local) as ISO — the cutoff for "upcoming": an event that ends
// today is still shown. Day-level precision is enough for listings events.
function upcomingCutoffISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// `upcoming` filter: end_date in the future, OR (no end_date AND start_date in
// the future). Single-day events store only start_date.
function applyUpcoming(q) {
  const cutoff = upcomingCutoffISO()
  return q.or(`end_date.gte.${cutoff},and(end_date.is.null,start_date.gte.${cutoff})`)
}

// Events for one listing. includeUnpublished=true → the owner editor view (all
// events, soonest-authored last); false → public (published + upcoming only).
export async function listEventsForListing(sb, listingId, { includeUnpublished = false } = {}) {
  if (!listingId) return []
  let q = sb.from('events').select(SELECT_COLS).eq('listing_id', listingId)
  if (includeUnpublished) {
    q = q.order('start_date', { ascending: true })
  } else {
    q = applyUpcoming(q.eq('published', true)).order('start_date', { ascending: true })
  }
  const { data } = await q
  return data || []
}

// Public /events index — published + upcoming, with the hosting listing
// embedded. Optional state / category filters (both real columns).
export async function listUpcomingEvents(sb, { state, category, limit = 60 } = {}) {
  let q = applyUpcoming(
    sb.from('events').select(`${SELECT_COLS}, ${LISTING_EMBED}`).eq('published', true)
  ).order('start_date', { ascending: true }).limit(limit)
  if (state) q = q.eq('state', state)
  if (category) q = q.eq('category', category)
  const { data } = await q
  return data || []
}

// Public /events/[slug] — a single published event with its hosting listing.
export async function getPublishedEventBySlug(sb, slug) {
  if (!slug) return null
  const { data } = await sb
    .from('events')
    .select(`${SELECT_COLS}, ${LISTING_EMBED}`)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  return data || null
}

// Distinct categories currently in use on published, upcoming events — powers
// the /events category filter without a hardcoded list (categories are free
// text typed by operators).
export async function listEventCategories(sb) {
  const { data } = await applyUpcoming(
    sb.from('events').select('category').eq('published', true)
  )
  const set = new Set()
  for (const r of data || []) {
    const c = (r.category || '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

// Create an event for a listing. Caller has already authorised + paid-gated.
// state/region are copied from the hosting listing by the caller.
export async function createEvent(sb, {
  listingId, createdBy, title, description, category,
  startDate, endDate, ticketUrl, isFree, heroImageUrl, published, state, region,
}) {
  const cleanTitle = String(title || '').trim()
  if (!cleanTitle) return { ok: false, error: 'An event needs a title', code: 'bad_request' }
  if (!startDate) return { ok: false, error: 'An event needs a date', code: 'bad_request' }

  const slug = await uniqueEventSlug(sb, cleanTitle)
  const row = {
    title: cleanTitle.slice(0, 200),
    slug,
    description: description ? String(description).trim().slice(0, 4000) : null,
    category: category ? String(category).trim().slice(0, 60) : null,
    start_date: startDate,
    end_date: endDate || null,
    ticket_url: ticketUrl ? String(ticketUrl).trim() : null,
    is_free: isFree !== false,
    hero_image_url: heroImageUrl || null,
    published: !!published,
    listing_id: listingId,
    created_by: createdBy || null,
    state: state || null,
    region: region || null,
  }
  const { data, error } = await sb.from('events').insert(row).select(SELECT_COLS).single()
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'An event with that name already exists', code: 'duplicate' }
    if (error.code === '23503') return { ok: false, error: 'The hosting listing no longer exists', code: 'missing' }
    return { ok: false, error: error.message, code: 'db' }
  }
  return { ok: true, event: data }
}

const EDITABLE_FIELDS = ['title', 'description', 'category', 'start_date', 'end_date', 'ticket_url', 'is_free', 'hero_image_url', 'published']

// Update an event the caller owns. listingId scopes the write so an operator can
// only edit events on a listing they manage. Only EDITABLE_FIELDS are applied.
export async function updateEvent(sb, { id, listingId, fields = {} }) {
  if (!id) return { ok: false, error: 'Event id is required', code: 'bad_request' }
  const patch = {}
  for (const k of EDITABLE_FIELDS) {
    if (!(k in fields)) continue
    if (k === 'title') {
      const t = String(fields.title || '').trim()
      if (!t) return { ok: false, error: 'An event needs a title', code: 'bad_request' }
      patch.title = t.slice(0, 200)
    } else if (k === 'description') {
      patch.description = fields.description ? String(fields.description).trim().slice(0, 4000) : null
    } else if (k === 'category') {
      patch.category = fields.category ? String(fields.category).trim().slice(0, 60) : null
    } else if (k === 'ticket_url') {
      patch.ticket_url = fields.ticket_url ? String(fields.ticket_url).trim() : null
    } else if (k === 'is_free') {
      patch.is_free = fields.is_free !== false
    } else if (k === 'published') {
      patch.published = !!fields.published
    } else if (k === 'start_date') {
      if (!fields.start_date) return { ok: false, error: 'An event needs a date', code: 'bad_request' }
      patch.start_date = fields.start_date
    } else if (k === 'end_date') {
      patch.end_date = fields.end_date || null
    } else if (k === 'hero_image_url') {
      patch.hero_image_url = fields.hero_image_url || null
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update', code: 'bad_request' }
  patch.updated_at = new Date().toISOString()

  const { data, error } = await sb
    .from('events')
    .update(patch)
    .eq('id', id)
    .eq('listing_id', listingId)
    .select(SELECT_COLS)
    .single()
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data) return { ok: false, error: 'Event not found', code: 'not_found' }
  return { ok: true, event: data }
}

// Delete an event the caller owns (listingId-scoped). Returns the deleted slug
// so the caller can revalidate the public detail page.
export async function deleteEvent(sb, { id, listingId }) {
  if (!id) return { ok: false, error: 'Event id is required', code: 'bad_request' }
  const { data, error } = await sb
    .from('events')
    .delete()
    .eq('id', id)
    .eq('listing_id', listingId)
    .select('id, slug')
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data || data.length === 0) return { ok: false, error: 'Event not found', code: 'not_found' }
  return { ok: true, deletedId: id, slug: data[0].slug }
}
