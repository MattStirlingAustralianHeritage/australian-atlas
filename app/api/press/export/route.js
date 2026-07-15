import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import {
  getFollowedRegions, listEventsForRegions, toCsv,
  applyPublicListings, fetchAllRows, PRESS_VERTICALS, verticalName, stateName,
} from '@/lib/press/insights'

// Newsroom CSV downloads — public data only, shaped for a spreadsheet:
//   ?type=listings [&region=slug]  places in followed regions (or one region)
//   ?type=events                   upcoming events in followed regions
//   ?type=regions                  citable per-region aggregate, whole network
// UTF-8 BOM so Excel opens it correctly (the council export discipline).

export const maxDuration = 60

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

function csvResponse(filename, csv) {
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req) {
  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  const session = validatePressSession(cookie?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'listings'
  const today = new Date().toISOString().slice(0, 10)

  try {
    const followed = await getFollowedRegions(sb, session.pressId)
    const regionName = new Map(followed.map(r => [r.id, r]))

    if (type === 'listings') {
      let regions = followed
      const regionSlug = searchParams.get('region')
      if (regionSlug) {
        const { data: one } = await sb
          .from('regions').select('id, slug, name, state').eq('slug', regionSlug).eq('status', 'live').single()
        if (!one) return NextResponse.json({ error: 'Region not found' }, { status: 404 })
        regions = [one]
        regionName.set(one.id, one)
      }
      if (!regions.length) return NextResponse.json({ error: 'Follow a region first' }, { status: 400 })

      const rows = await fetchAllRows(() => applyPublicListings(
        sb.from('listings_with_region')
          .select('name, slug, vertical, sub_type, suburb, state, website, created_at, region_id')
          .in('region_id', regions.map(r => r.id))
      ).order('name').order('slug'))

      const csv = toCsv(
        ['Name', 'Category', 'Type', 'Town', 'Region', 'State', 'Website', 'Listed since', 'Atlas URL'],
        (rows || []).map(l => [
          l.name,
          verticalName(l.vertical),
          l.sub_type || '',
          l.suburb || '',
          regionName.get(l.region_id)?.name || '',
          stateName(l.state),
          l.website || '',
          (l.created_at || '').slice(0, 10),
          `${SITE}/place/${l.slug}`,
        ])
      )
      await logExport(sb, session.pressId, 'listings')
      return csvResponse(`australian-atlas-places-${today}.csv`, csv)
    }

    if (type === 'events') {
      if (!followed.length) return NextResponse.json({ error: 'Follow a region first' }, { status: 400 })
      const events = await listEventsForRegions(sb, { regionIds: followed.map(r => r.id), limit: 500 })
      const csv = toCsv(
        ['Event', 'Starts', 'Ends', 'Category', 'Venue', 'Town', 'Region', 'State', 'Free', 'Tickets', 'Atlas URL'],
        events.map(e => [
          e.name,
          e.start_date,
          e.end_date,
          e.category_label || e.category,
          e.location_name,
          e.suburb || '',
          regionName.get(e.region_id)?.name || '',
          stateName(e.state),
          e.is_free ? 'yes' : '',
          e.ticket_url || '',
          `${SITE}/events/${e.slug}`,
        ])
      )
      await logExport(sb, session.pressId, 'events')
      return csvResponse(`australian-atlas-events-${today}.csv`, csv)
    }

    if (type === 'regions') {
      const { data: regions } = await sb
        .from('regions').select('id, slug, name, state').eq('status', 'live').order('name')
      const rows = await fetchAllRows(() => applyPublicListings(
        sb.from('listings_with_region')
          .select('id, region_id, vertical, created_at')
          .in('region_id', (regions || []).map(r => r.id))
      ).order('id'), { cap: 20000 })

      const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const tally = new Map()
      for (const row of rows || []) {
        if (!tally.has(row.region_id)) {
          tally.set(row.region_id, { total: 0, new30: 0, byV: Object.fromEntries(PRESS_VERTICALS.map(k => [k, 0])) })
        }
        const t = tally.get(row.region_id)
        t.total += 1
        if (row.created_at >= since30) t.new30 += 1
        if (t.byV[row.vertical] !== undefined) t.byV[row.vertical] += 1
      }

      const csv = toCsv(
        ['Region', 'State', 'Independent places', 'Added last 30 days', ...PRESS_VERTICALS.map(k => verticalName(k)), 'As of'],
        (regions || []).map(r => {
          const t = tally.get(r.id) || { total: 0, new30: 0, byV: {} }
          return [
            r.name,
            stateName(r.state),
            t.total,
            t.new30,
            ...PRESS_VERTICALS.map(k => t.byV[k] || 0),
            today,
          ]
        })
      )
      await logExport(sb, session.pressId, 'regions')
      return csvResponse(`australian-atlas-regions-${today}.csv`, csv)
    }

    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 })
  } catch (err) {
    console.error('Press export error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function logExport(sb, pressId, kind) {
  try {
    await sb.from('press_activity').insert({ press_id: pressId, action: 'export', metadata: { kind } })
  } catch { /* best-effort */ }
}
