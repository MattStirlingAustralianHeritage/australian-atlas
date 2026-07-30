import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchActivitySince } from '@/lib/activity/feedSources'

/**
 * GET /api/admin/activity — what people are actually doing to their listings.
 *
 * The two-source merge (the listing_activity log plus history reconstructed
 * from claims/drafts/facts/events) lives in lib/activity/feedSources.js, shared
 * with the sidebar's unseen counter.
 *
 * Query: ?days=30&group=media&role=operator&vertical=craft&q=text&page=0&limit=50
 */

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50

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

  const { events: merged, logTableMissing } = await fetchActivitySince(sb, sinceIso)

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
    logTableMissing,
  })
}
