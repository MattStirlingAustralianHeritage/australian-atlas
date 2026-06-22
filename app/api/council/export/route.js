import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'

// CSV-escape: quote fields containing comma, quote or newline; double inner quotes.
function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/council/export — download the authenticated council's region listing
 * data as CSV (the "custom data export" / data-access capability). Session-gated;
 * FK region attribution via listings_with_region; public, non-test rows only.
 * Optional ?region=<slug> (must be a managed region) and ?vertical=<key>.
 */
export async function GET(req) {
  const cookie = req.cookies.get('council_session')
  const session = validateCouncilSession(cookie?.value)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const regionParam = searchParams.get('region')
  const verticalParam = searchParams.get('vertical')

  // Managed regions for this council (server-side scoping — a council can only
  // ever export its own regions).
  const { data: councilRegions } = await sb
    .from('council_regions')
    .select('regions(id, slug, name)')
    .eq('council_id', session.councilId)

  let regions = (councilRegions || []).map(cr => cr.regions).filter(Boolean)
  if (regionParam) regions = regions.filter(r => r.slug === regionParam)
  if (regions.length === 0) {
    return NextResponse.json({ error: 'No matching managed region' }, { status: 404 })
  }

  const regionIds = regions.map(r => r.id)
  const regionNameById = Object.fromEntries(regions.map(r => [r.id, r.name]))

  const hasVerticals = verticalParam ? await relationHasVerticals(sb, 'listings_with_region') : false

  // Paginate past PostgREST's 1000-row cap so the export is complete.
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    let query = excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select('name, vertical, suburb, state, website, status, region_id')
        .eq('status', 'active')
        .in('region_id', regionIds),
    ))
    if (verticalParam) query = filterByVertical(query, verticalParam, hasVerticals)
    const { data, error } = await query.order('name', { ascending: true }).range(from, from + pageSize - 1)
    if (error) {
      console.error('Council export error:', error.message)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }

  const header = ['Name', 'Category', 'Suburb', 'State', 'Website', 'Status', 'Region']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      csvCell(r.name),
      csvCell(r.vertical),
      csvCell(r.suburb),
      csvCell(r.state),
      csvCell(r.website),
      csvCell(r.status),
      csvCell(regionNameById[r.region_id] || ''),
    ].join(','))
  }
  // BOM so Excel opens UTF-8 cleanly.
  const csv = '﻿' + lines.join('\r\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const scope = regionParam ? regions[0].slug : 'all-regions'
  const filename = `australian-atlas-${scope}-listings-${stamp}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
