import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { updateInVertical, pushToVertical, VERTICAL_DISPLAY_NAMES } from '@/lib/sync/pushToVertical'

/**
 * Full re-sync: push ALL active master listings to their vertical DBs.
 * POST /api/admin/resync-verticals
 *
 * For listings with a valid source_id: updates the existing vertical row.
 * For listings with a candidate-prefixed or null source_id: inserts a new row.
 *
 * Returns per-vertical counts of synced/failed listings.
 */

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional: limit to a single vertical via query param
  const { searchParams } = new URL(request.url)
  const verticalFilter = searchParams.get('vertical') // e.g. ?vertical=sba

  const sb = getSupabaseAdmin()

  try {
    let query = sb
      .from('listings')
      .select('id, name, slug, vertical, description, region, state, lat, lng, website, phone, address, hero_image_url, source_id')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    if (verticalFilter) {
      query = query.eq('vertical', verticalFilter)
    }

    const { data: listings, error } = await query.order('vertical').limit(500)
    if (error) throw error
    if (!listings || listings.length === 0) {
      return NextResponse.json({ message: 'No active listings found', totals: {} })
    }

    const totals = {} // { sba: { synced: 0, failed: 0, skipped: 0 }, ... }
    const failures = []

    for (const listing of listings) {
      const v = listing.vertical
      if (!v) continue
      if (!totals[v]) totals[v] = { synced: 0, failed: 0, skipped: 0 }

      const syncData = {
        name: listing.name,
        slug: listing.slug,
        description: listing.description,
        region: listing.region,
        state: listing.state,
        lat: listing.lat,
        lng: listing.lng,
        website: listing.website,
        phone: listing.phone,
        address: listing.address,
        hero_image_url: listing.hero_image_url,
        suburb: listing.region,
        category: null,
      }

      const sourceId = listing.source_id
      const hasValidSourceId = sourceId && !String(sourceId).startsWith('candidate-')

      if (hasValidSourceId) {
        // UPDATE existing vertical row
        const result = await updateInVertical(v, sourceId, syncData)
        if (result.success) {
          totals[v].synced++
        } else {
          totals[v].failed++
          failures.push({ id: listing.id, name: listing.name, vertical: v, error: result.error })
        }
      } else {
        // INSERT new vertical row
        const result = await pushToVertical(v, syncData)
        if (result.success) {
          // Link the new vertical row back to master
          await sb.from('listings').update({ source_id: result.id }).eq('id', listing.id)
          totals[v].synced++
        } else {
          totals[v].failed++
          failures.push({ id: listing.id, name: listing.name, vertical: v, error: result.error })
        }
      }
    }

    // Build summary
    const totalSynced = Object.values(totals).reduce((s, t) => s + t.synced, 0)
    const totalFailed = Object.values(totals).reduce((s, t) => s + t.failed, 0)

    const summary = Object.entries(totals).map(([v, t]) => ({
      vertical: v,
      label: VERTICAL_DISPLAY_NAMES[v] || v,
      synced: t.synced,
      failed: t.failed,
    }))

    console.log(`[resync-verticals] Complete: ${totalSynced} synced, ${totalFailed} failed across ${listings.length} listings`)

    return NextResponse.json({
      message: `Re-synced ${totalSynced} listings, ${totalFailed} failed`,
      total_processed: listings.length,
      total_synced: totalSynced,
      total_failed: totalFailed,
      by_vertical: summary,
      failures: failures.slice(0, 50), // cap failure details
    })
  } catch (err) {
    console.error('[resync-verticals] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: preview how many listings would be re-synced
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data, error } = await sb
      .from('listings')
      .select('vertical')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    if (error) throw error

    const counts = {}
    for (const row of (data || [])) {
      counts[row.vertical] = (counts[row.vertical] || 0) + 1
    }

    return NextResponse.json({
      total: data?.length || 0,
      by_vertical: Object.entries(counts).map(([v, count]) => ({
        vertical: v,
        label: VERTICAL_DISPLAY_NAMES[v] || v,
        count,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
