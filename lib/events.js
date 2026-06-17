// Operator events — paid-tier perk, stored on the CANONICAL events table
// (migration 155 = verbatim 009 community schema, + migration 158 operator
// columns: listing_id, created_by, published, is_free, category_label,
// updated_at).
//
// One table, two pipelines:
//   • community submissions (/events/submit → admin review): status governs
//     visibility ('pending' → 'approved'), published is NULL, no listing link.
//   • operator events (listing editor, this module): auto-'approved' on
//     create, visibility governed by the `published` boolean, linked to the
//     hosting listing via listing_id.
// Public surfaces show: status = 'approved' AND published IS NOT FALSE.
//
// This module is the single translation layer between the DB vocabulary
// (name, image_url, category/category_label, NOT NULL end_date/description/
// location_name) and the app shape every consumer renders (title,
// hero_image_url, category as free text, end_date null for single-day).
// Pages and the editor never see raw rows.
//
// 009's NOT NULLs are satisfied on insert by deriving from the hosting
// listing (location_name = listing name, image_url falls back to the listing
// hero, end_date = start_date when single-day) and the authenticated session
// (submitter_name/email — never public).
//
// Paid gating (an active `standard` claim) is enforced by callers — same
// contract as the photo gallery (see lib/listing-gallery). This module is pure
// data access and assumes the caller has already authorised the write.

// A listing can host at most this many events at a time — delete one to add
// another. Enforced in createEvent (authoritative) and mirrored in the editor.
export const MAX_EVENTS_PER_LISTING = 3

const SELECT_COLS =
  'id, name, slug, description, category, category_label, start_date, end_date, ' +
  'location_name, suburb, state, address, image_url, ticket_url, status, published, ' +
  'is_free, listing_id, created_by, region_id, verticals, submitted_at, updated_at'

// Embed the hosting listing so public surfaces can show the venue + link to it.
// lat/lng are read-only here — they let the detail page draw the venue on a map
// when the host listing has coordinates (omitted cleanly when it doesn't).
const LISTING_EMBED = 'listing:listings ( id, name, slug, vertical, suburb, state, region, lat, lng )'

// The CHECK-constrained category keys on the canonical table (009). Operator
// free text maps onto the nearest key for filtering; the verbatim label is
// kept in category_label for display.
const CATEGORY_KEYS = ['festival', 'market', 'dinner', 'tour', 'exhibition', 'workshop', 'other']

function toCategoryKey(freeText) {
  const t = String(freeText || '').trim().toLowerCase()
  if (!t) return 'other'
  if (CATEGORY_KEYS.includes(t)) return t
  // light-touch synonyms for common operator phrasings
  if (/tasting|degustation|pairing/.test(t)) return 'dinner'
  if (/lunch|dinner|feast|banquet|table/.test(t)) return 'dinner'
  if (/market|fair|stall/.test(t)) return 'market'
  if (/tour|walk|visit|open day|open house/.test(t)) return 'tour'
  if (/exhibit|show|gallery|opening/.test(t)) return 'exhibition'
  if (/workshop|class|masterclass|course|demo/.test(t)) return 'workshop'
  if (/festival|fest|celebration/.test(t)) return 'festival'
  return 'other'
}

// DB row → the shape every consumer renders. Single-day events are stored
// with end_date = start_date (the column is NOT NULL); the app shape uses
// end_date null so date formatting shows one day.
function toAppShape(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.name,
    slug: row.slug,
    description: row.description || null,
    category: row.category_label || row.category || null,
    category_key: row.category || null,
    start_date: row.start_date,
    end_date: row.end_date && row.end_date !== row.start_date ? row.end_date : null,
    state: row.state || null,
    address: row.address || null,
    region_id: row.region_id || null,
    hero_image_url: row.image_url || null,
    ticket_url: row.ticket_url || null,
    is_free: row.is_free === true,
    // Operator rows carry the boolean; community rows derive from status.
    published: row.published ?? row.status === 'approved',
    status: row.status,
    listing_id: row.listing_id || null,
    created_by: row.created_by || null,
    listing: row.listing || null,
    created_at: row.submitted_at || null,
    updated_at: row.updated_at || null,
  }
}

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

// Today as a local YYYY-MM-DD — start/end_date are DATE columns. An event
// whose end_date is today still counts as upcoming.
function todayYMD() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// end_date is NOT NULL (single-day rows store end = start), so "upcoming" is
// one comparison.
function applyUpcoming(q) {
  return q.gte('end_date', todayYMD())
}

// Publicly visible: approved AND not an unpublished operator draft.
// (Community rows have published = NULL → visible once approved.)
function applyPublic(q) {
  return q.eq('status', 'approved').not('published', 'is', false)
}

// Events for one listing. includeUnpublished=true → the owner editor view (all
// events including drafts); false → public (published + upcoming only).
export async function listEventsForListing(sb, listingId, { includeUnpublished = false } = {}) {
  if (!listingId) return []
  let q = sb.from('events').select(SELECT_COLS).eq('listing_id', listingId)
  if (!includeUnpublished) {
    q = applyUpcoming(applyPublic(q))
  }
  const { data } = await q.order('start_date', { ascending: true })
  return (data || []).map(toAppShape)
}

// Public /events index — approved + upcoming (community submissions and
// published operator events alike), hosting listing embedded where present.
// Optional state / category filters (category matches the constrained key).
export async function listUpcomingEvents(sb, { state, category, limit = 60 } = {}) {
  let q = applyUpcoming(
    applyPublic(sb.from('events').select(`${SELECT_COLS}, ${LISTING_EMBED}`))
  ).order('start_date', { ascending: true }).limit(limit)
  if (state) q = q.eq('state', state)
  if (category) q = q.eq('category', toCategoryKey(category))
  const { data } = await q
  return (data || []).map(toAppShape)
}

// Public /events/[slug] — a single publicly visible event with its host.
export async function getPublishedEventBySlug(sb, slug) {
  if (!slug) return null
  const { data } = await applyPublic(
    sb.from('events').select(`${SELECT_COLS}, ${LISTING_EMBED}`).eq('slug', slug)
  ).maybeSingle()
  return toAppShape(data)
}

// Distinct category keys currently in use on visible upcoming events — powers
// the /events category filter without a hardcoded list.
export async function listEventCategories(sb) {
  const { data } = await applyUpcoming(
    applyPublic(sb.from('events').select('category'))
  )
  const set = new Set()
  for (const r of data || []) {
    const c = (r.category || '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

// Full-text search over publicly visible upcoming events — the search-page
// events lane. Wraps the search_events RPC (migration 159: FTS rank +
// status/published/upcoming guards in SQL). Returns the app shape; empty
// array on any error so search never breaks on the events lane.
export async function searchEvents(sb, { query = null, state = null, category = null, vertical = null, limit = 4 } = {}) {
  const { data, error } = await sb.rpc('search_events', {
    query: query || null,
    state_filter: state || null,
    category_filter: category ? toCategoryKey(category) : null,
    vertical_filter: vertical || null,
    result_limit: limit,
    result_offset: 0,
  })
  if (error) return []
  return (data || []).map(r => ({
    id: r.id,
    title: r.name,
    slug: r.slug,
    description: r.description || null,
    category: r.category_label || r.category || null,
    category_key: r.category || null,
    start_date: r.start_date,
    end_date: r.end_date && r.end_date !== r.start_date ? r.end_date : null,
    state: r.state || null,
    suburb: r.suburb || null,
    location_name: r.location_name || null,
    hero_image_url: r.image_url || null,
    ticket_url: r.ticket_url || null,
    is_free: r.is_free === true,
    listing_id: r.listing_id || null,
  }))
}

// Create an operator event for a listing. Caller has already authorised +
// paid-gated, and supplies the hosting listing's context (name/hero/region)
// plus the session identity for the NOT NULL submitter columns.
export async function createEvent(sb, {
  listingId, createdBy, title, description, category,
  startDate, endDate, ticketUrl, isFree, heroImageUrl, published, address,
  state, vertical, regionId, listingName, listingHero, listingSuburb, listingAddress,
  submitterName, submitterEmail,
}) {
  const cleanTitle = String(title || '').trim()
  if (!cleanTitle) return { ok: false, error: 'An event needs a title', code: 'bad_request' }
  if (!startDate) return { ok: false, error: 'An event needs a date', code: 'bad_request' }
  if (!state) return { ok: false, error: 'This listing has no state set — add its address first', code: 'bad_request' }
  if (!submitterEmail) return { ok: false, error: 'Missing account email', code: 'bad_request' }

  // Per-listing cap. A count-then-insert race could briefly exceed it; the cap
  // is a product guardrail, not an invariant, so that's acceptable.
  const { count } = await sb
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
  if ((count || 0) >= MAX_EVENTS_PER_LISTING) {
    return {
      ok: false,
      error: `Each listing can have up to ${MAX_EVENTS_PER_LISTING} events — delete an old one to add another.`,
      code: 'limit',
    }
  }

  const slug = await uniqueEventSlug(sb, cleanTitle)
  const categoryLabel = category ? String(category).trim().slice(0, 60) : null
  const row = {
    name: cleanTitle.slice(0, 200),
    slug,
    description: description ? String(description).trim().slice(0, 4000) : '',
    category: toCategoryKey(categoryLabel),
    category_label: categoryLabel,
    start_date: startDate,
    end_date: endDate || startDate,
    location_name: listingName || 'Venue',
    suburb: listingSuburb || null,
    state,
    address: (address && String(address).trim().slice(0, 300)) || listingAddress || null,
    image_url: heroImageUrl || listingHero || '',
    ticket_url: ticketUrl ? String(ticketUrl).trim() : null,
    verticals: vertical ? [vertical] : [],
    region_id: regionId || null,
    submitter_name: submitterName || 'Operator',
    submitter_email: submitterEmail,
    status: 'approved',
    approved_at: new Date().toISOString(),
    published: !!published,
    is_free: isFree !== false,
    listing_id: listingId,
    created_by: createdBy || null,
  }
  const { data, error } = await sb.from('events').insert(row).select(SELECT_COLS).single()
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'An event with that name already exists', code: 'duplicate' }
    if (error.code === '23503') return { ok: false, error: 'The hosting listing no longer exists', code: 'missing' }
    return { ok: false, error: error.message, code: 'db' }
  }
  return { ok: true, event: toAppShape(data) }
}

const EDITABLE_FIELDS = ['title', 'description', 'category', 'start_date', 'end_date', 'ticket_url', 'is_free', 'hero_image_url', 'published', 'address']

// Update an event the caller owns. listingId scopes the write so an operator
// can only edit events on a listing they manage. Only EDITABLE_FIELDS apply;
// app-shape fields are translated to DB columns here.
export async function updateEvent(sb, { id, listingId, fields = {} }) {
  if (!id) return { ok: false, error: 'Event id is required', code: 'bad_request' }
  const patch = {}
  for (const k of EDITABLE_FIELDS) {
    if (!(k in fields)) continue
    if (k === 'title') {
      const t = String(fields.title || '').trim()
      if (!t) return { ok: false, error: 'An event needs a title', code: 'bad_request' }
      patch.name = t.slice(0, 200)
    } else if (k === 'description') {
      patch.description = fields.description ? String(fields.description).trim().slice(0, 4000) : ''
    } else if (k === 'category') {
      const label = fields.category ? String(fields.category).trim().slice(0, 60) : null
      patch.category = toCategoryKey(label)
      patch.category_label = label
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
      patch.end_date = fields.end_date || null // resolved below: NOT NULL column
    } else if (k === 'hero_image_url') {
      patch.image_url = fields.hero_image_url || ''
    } else if (k === 'address') {
      patch.address = fields.address ? String(fields.address).trim().slice(0, 300) : null
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update', code: 'bad_request' }

  // end_date is NOT NULL: a cleared end date means single-day → end = start.
  // Use the incoming start when it's part of this patch, else the stored one.
  if ('end_date' in patch && !patch.end_date) {
    if (patch.start_date) {
      patch.end_date = patch.start_date
    } else {
      const { data: current } = await sb
        .from('events').select('start_date').eq('id', id).eq('listing_id', listingId).maybeSingle()
      if (!current) return { ok: false, error: 'Event not found', code: 'not_found' }
      patch.end_date = current.start_date
    }
  }
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
  return { ok: true, event: toAppShape(data) }
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
