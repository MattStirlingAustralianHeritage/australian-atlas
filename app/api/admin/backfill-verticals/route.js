import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { pushToVertical } from '@/lib/sync/pushToVertical'

/**
 * Retroactive fix: push orphaned candidate-sourced master listings to their vertical DBs.
 * POST /api/admin/backfill-verticals
 *
 * Finds all active listings with source_id starting with 'candidate-',
 * pushes them to the appropriate vertical database via the shared utility,
 * then updates the master source_id to match the vertical row ID.
 */

export async function POST() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const results = []

  try {
    // Find all candidate-sourced listings that haven't been synced
    const { data: listings, error } = await sb
      .from('listings')
      .select('*')
      .like('source_id', 'candidate-%')
      .eq('status', 'active')

    if (error) throw error
    if (!listings || listings.length === 0) {
      return NextResponse.json({ message: 'No orphaned listings found', count: 0, results: [] })
    }

    for (const listing of listings) {
      const vertical = listing.vertical
      const entry = { id: listing.id, name: listing.name, vertical, status: 'pending' }

      try {
        const config = VERTICAL_CONFIG[vertical]
        if (!config) {
          entry.status = 'skipped'
          entry.reason = 'Unknown vertical'
          results.push(entry)
          continue
        }

        // Check if already exists in vertical by slug
        const client = getVerticalClient(vertical)
        let table = config.table
        if (vertical === 'fine_grounds') table = 'roasters'

        const { data: existing } = await client
          .from(table)
          .select('id')
          .eq('slug', listing.slug)
          .maybeSingle()

        let verticalRowId

        if (existing) {
          verticalRowId = String(existing.id)
          entry.status = 'already_exists'
        } else {
          // Push via shared utility
          const data = {
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
            suburb: listing.region,
            category: null,
          }

          const pushResult = await pushToVertical(vertical, data)

          if (!pushResult.success) {
            entry.status = 'insert_failed'
            entry.reason = pushResult.error
            results.push(entry)
            continue
          }

          verticalRowId = pushResult.id
          entry.status = 'inserted'
        }

        // Update master source_id to match vertical row
        const { error: updateError } = await sb
          .from('listings')
          .update({ source_id: verticalRowId })
          .eq('id', listing.id)

        if (updateError) {
          entry.status = 'source_id_update_failed'
          entry.reason = updateError.message
        } else {
          entry.verticalRowId = verticalRowId
          if (entry.status !== 'already_exists') entry.status = 'success'
        }
      } catch (err) {
        entry.status = 'error'
        entry.reason = err.message
      }

      results.push(entry)
    }

    const succeeded = results.filter(r => r.status === 'success' || r.status === 'already_exists').length
    const failed = results.filter(r => ['insert_failed', 'error', 'source_id_update_failed'].includes(r.status)).length

    return NextResponse.json({
      message: `Processed ${listings.length} orphaned listings: ${succeeded} synced, ${failed} failed`,
      count: listings.length,
      succeeded,
      failed,
      results,
    })
  } catch (err) {
    console.error('[backfill-verticals] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Also support GET for checking orphan count without fixing
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { count, error } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .like('source_id', 'candidate-%')
      .eq('status', 'active')

    if (error) throw error

    return NextResponse.json({ orphanedCount: count || 0 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
