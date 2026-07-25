import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { actionLabel, actionGroup } from '@/lib/activity/logListingActivity'

/**
 * GET /api/admin/activity — what people are actually doing to their listings.
 *
 * Two sources, one timeline:
 *
 *   1. listing_activity (migration 260) — the real log. Rich: per-field, with
 *      before/after in `details`, written by every operator save path.
 *
 *   2. DERIVED history — the log only knows about saves made after it shipped,
 *      but four existing tables already carry an actor and a timestamp:
 *      listing_claims (claimed_at), operator_description_drafts (submitted_at),
 *      operator_facts (updated_at) and events (created_at + created_by). We
 *      reconstruct events from those so the feed has real history on day one
 *      instead of an empty state.
 *
 * Derived rows are deduped against logged ones on
 * listing + action + same-minute, so once both sources describe the same save
 * (an operator submitting a description, say) it appears exactly once.
 *
 * Query: ?days=30&group=media&role=operator&vertical=craft&q=text&page=0&limit=50
 */

export const dynamic = 'force-dynamic'

const MAX_PER_SOURCE = 1000
const DEFAULT_LIMIT = 50

function dedupeKey(e) {
  return `${e.listing_id || e.listing_name}|${e.action}|${String(e.created_at).slice(0, 16)}`
}

function shape(row, source) {
  return {
    ...row,
    source,
    action_label: actionLabel(row.action),
    group: actionGroup(row.action),
  }
}

/** Rows already in the activity log. */
async function fetchLogged(sb, sinceIso) {
  const { data, error } = await sb
    .from('listing_activity')
    .select('id, listing_id, listing_name, listing_slug, vertical, actor_id, actor_email, actor_role, action, field, summary, details, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(MAX_PER_SOURCE)

  // Before migration 260 is applied the table is absent — the derived sources
  // below still give a usable feed, so this is a soft failure, not a 500.
  if (error) {
    if (error.code === '42P01') return { rows: [], tableMissing: true }
    console.warn('[admin/activity] listing_activity read failed:', error.message)
    return { rows: [], tableMissing: false }
  }
  return { rows: (data || []).map(r => shape(r, 'log')), tableMissing: false }
}

/**
 * Reconstruct events from tables that predate the log. Each returns rows in the
 * same shape as listing_activity so the feed renders them identically.
 */
async function fetchDerived(sb, sinceIso) {
  const [claims, drafts, facts, events] = await Promise.allSettled([
    sb.from('listing_claims')
      .select('id, listing_id, claimant_email, claimed_by, tier, claimed_at, listing:listings ( name, slug, vertical )')
      .gte('claimed_at', sinceIso)
      .order('claimed_at', { ascending: false })
      .limit(MAX_PER_SOURCE),

    sb.from('operator_description_drafts')
      .select('id, listing_id, version, status, source_facts, submitted_at, listing:listings ( name, slug, vertical )')
      .gte('submitted_at', sinceIso)
      .order('submitted_at', { ascending: false })
      .limit(MAX_PER_SOURCE),

    sb.from('operator_facts')
      .select('id, listing_id, submitted_by, updated_at, listing:listings ( name, slug, vertical )')
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: false })
      .limit(MAX_PER_SOURCE),

    // NOTE: the events table has no created_at — migration 155 rebuilt it around
    // submitted_at (community submissions) and updated_at. submitted_at is the
    // one that means "when this event was put up".
    sb.from('events')
      .select('id, listing_id, name, published, created_by, submitted_at, updated_at, listing:listings ( name, slug, vertical )')
      .not('listing_id', 'is', null)
      .gte('submitted_at', sinceIso)
      .order('submitted_at', { ascending: false })
      .limit(MAX_PER_SOURCE),
  ])

  const ok = res => (res.status === 'fulfilled' && !res.value.error ? res.value.data || [] : [])
  const rows = []

  for (const c of ok(claims)) {
    rows.push(shape({
      id: `claim:${c.id}`,
      listing_id: c.listing_id,
      listing_name: c.listing?.name || null,
      listing_slug: c.listing?.slug || null,
      vertical: c.listing?.vertical || null,
      actor_id: c.claimed_by,
      actor_email: c.claimant_email,
      actor_role: 'operator',
      action: 'listing_claimed',
      field: null,
      summary: `Claimed the listing${c.tier === 'standard' ? ' on the Standard plan' : ' on the free plan'}`,
      details: { tier: c.tier },
      created_at: c.claimed_at,
    }, 'derived'))
  }

  for (const d of ok(drafts)) {
    const owner = d.source_facts?.authorship === 'owner'
    rows.push(shape({
      id: `draft:${d.id}`,
      listing_id: d.listing_id,
      listing_name: d.listing?.name || null,
      listing_slug: d.listing?.slug || null,
      vertical: d.listing?.vertical || null,
      actor_id: d.source_facts?.submitted_by || null,
      actor_email: null,
      actor_role: 'operator',
      action: owner ? 'description_submitted' : 'description_generated',
      field: 'description',
      summary: owner
        ? `Wrote their own description (v${d.version}) — ${d.status === 'approved' ? 'approved' : d.status.replace(/_/g, ' ')}`
        : `Generated a description (v${d.version}) — ${d.status === 'approved' ? 'approved' : d.status.replace(/_/g, ' ')}`,
      details: { version: d.version, status: d.status, authorship: owner ? 'owner' : 'atlas' },
      created_at: d.submitted_at,
    }, 'derived'))
  }

  for (const f of ok(facts)) {
    rows.push(shape({
      id: `facts:${f.id}`,
      listing_id: f.listing_id,
      listing_name: f.listing?.name || null,
      listing_slug: f.listing?.slug || null,
      vertical: f.listing?.vertical || null,
      actor_id: f.submitted_by,
      actor_email: null,
      actor_role: 'operator',
      action: 'facts_updated',
      field: 'operator_facts',
      summary: 'Saved facts about their venue',
      details: {},
      created_at: f.updated_at,
    }, 'derived'))
  }

  for (const e of ok(events)) {
    rows.push(shape({
      id: `event:${e.id}`,
      listing_id: e.listing_id,
      listing_name: e.listing?.name || null,
      listing_slug: e.listing?.slug || null,
      vertical: e.listing?.vertical || null,
      actor_id: e.created_by,
      actor_email: null,
      actor_role: 'operator',
      action: 'event_created',
      field: 'events',
      summary: `Listed an event: ${e.name || 'untitled'}${e.published ? '' : ' (draft)'}`,
      details: { event_id: e.id, published: !!e.published },
      created_at: e.submitted_at || e.updated_at,
    }, 'derived'))
  }

  return rows
}

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365)
  const group = searchParams.get('group') || ''
  const role = searchParams.get('role') || ''
  const vertical = searchParams.get('vertical') || ''
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const page = Math.max(parseInt(searchParams.get('page') || '0', 10) || 0, 0)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), 200)

  const sb = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString()

  const [loggedRes, derived] = await Promise.all([
    fetchLogged(sb, sinceIso),
    fetchDerived(sb, sinceIso),
  ])

  // Logged rows win: they carry the field-level detail. A derived row for the
  // same listing+action+minute is the same real-world save seen twice.
  const seen = new Set(loggedRes.rows.map(dedupeKey))
  const merged = [...loggedRes.rows]
  for (const r of derived) {
    const k = dedupeKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(r)
  }

  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const filtered = merged.filter(e => {
    if (group && e.group !== group) return false
    if (role && e.actor_role !== role) return false
    if (vertical && e.vertical !== vertical) return false
    if (q) {
      const hay = `${e.listing_name || ''} ${e.actor_email || ''} ${e.summary || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Headline numbers, always over the last 7 days regardless of the filters —
  // this is the "is anything happening?" read, not a slice of the query.
  const weekAgo = Date.now() - 7 * 86400000
  const week = merged.filter(e => new Date(e.created_at).getTime() >= weekAgo)
  const photoEvents = week.filter(e => e.group === 'media')
  const stats = {
    events_7d: week.length,
    operators_7d: new Set(week.filter(e => e.actor_role === 'operator').map(e => e.actor_id || e.actor_email).filter(Boolean)).size,
    listings_7d: new Set(week.map(e => e.listing_id).filter(Boolean)).size,
    photos_7d: photoEvents.reduce((n, e) => n + (Number(e.details?.added) || (e.action.startsWith('hero_image') && e.action !== 'hero_image_removed' ? 1 : 0)), 0),
    held_7d: photoEvents.filter(e => e.details?.blocked || Number(e.details?.held) > 0).length,
  }

  return NextResponse.json({
    events: filtered.slice(page * limit, page * limit + limit),
    total: filtered.length,
    page,
    limit,
    days,
    stats,
    // Surfaces "the log isn't switched on yet" in the UI rather than silently
    // showing a derived-only feed that looks thinner than it should.
    logTableMissing: loggedRes.tableMissing,
  })
}
