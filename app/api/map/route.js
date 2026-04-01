import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Cache for 5 minutes via ISR — avoids Vercel timeout on every request
export const revalidate = 300

const META_CONFIG = {
  sba:          { table: 'sba_meta',          col: 'producer_type' },
  collection:   { table: 'collection_meta',   col: 'institution_type' },
  craft:        { table: 'craft_meta',        col: 'discipline' },
  fine_grounds: { table: 'fine_grounds_meta', col: 'entity_type' },
  rest:         { table: 'rest_meta',         col: 'accommodation_type' },
  field:        { table: 'field_meta',        col: 'feature_type' },
  corner:       { table: 'corner_meta',       col: 'shop_type' },
  found:        { table: 'found_meta',        col: 'shop_type' },
  table:        { table: 'table_meta',        col: 'food_type' },
}

async function fetchAllPages(sb, table, selectCols, filters = []) {
  const PAGE_SIZE = 1000
  let all = []
  let page = 0
  while (true) {
    let query = sb.from(table).select(selectCols).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    for (const f of filters) query = f(query)
    const { data, error } = await query
    if (error) { console.error(`[map] ${table} page ${page} error:`, error.message); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin()

    // 1. Fetch all active listings with coordinates
    const allListings = await fetchAllPages(
      sb, 'listings',
      'id, vertical, name, slug, description, region, state, lat, lng, is_featured',
      [q => q.eq('status', 'active'), q => q.not('lat', 'is', null), q => q.not('lng', 'is', null)]
    )

    if (allListings.length === 0) {
      return NextResponse.json({ listings: [], total: 0 })
    }

    // 2. Fetch all meta tables in parallel — each is a small independent query
    const subTypeMap = {}
    const metaResults = await Promise.all(
      Object.entries(META_CONFIG).map(async ([vertical, { table, col }]) => {
        try {
          const rows = await fetchAllPages(sb, table, `listing_id, ${col}`)
          return rows
        } catch (e) {
          console.error(`[map] ${table} failed:`, e.message)
          return []
        }
      })
    )

    // Build the sub_type lookup
    const metaEntries = Object.entries(META_CONFIG)
    metaResults.forEach((rows, i) => {
      const col = metaEntries[i][1].col
      for (const row of rows) {
        if (row[col]) subTypeMap[row.listing_id] = row[col]
      }
    })

    // 3. Merge
    const enriched = allListings.map(l => ({
      ...l,
      sub_type: subTypeMap[l.id] || null,
    }))

    return NextResponse.json({ listings: enriched, total: enriched.length })
  } catch (err) {
    console.error('[map] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
