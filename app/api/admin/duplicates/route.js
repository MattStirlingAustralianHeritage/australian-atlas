import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// ─── GET: Fetch duplicate pairs with listing details ─────

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const confidence = searchParams.get('confidence')

    const sb = getSupabaseAdmin()

    let query = sb.from('duplicate_pairs').select('*')

    // Status filter
    if (status === 'pending') {
      query = query.or('status.eq.pending,status.is.null')
    } else {
      query = query.eq('status', status)
    }

    // Confidence filter
    if (confidence) {
      query = query.eq('confidence', confidence)
    }

    query = query.limit(300)

    const { data: pairs, error: pairsError } = await query

    if (pairsError) throw pairsError

    // Sort: high confidence first, then by match_reason
    const sorted = (pairs || []).sort((a, b) => {
      const confOrder = { high: 0, medium: 1 }
      const ca = confOrder[a.confidence] ?? 2
      const cb = confOrder[b.confidence] ?? 2
      if (ca !== cb) return ca - cb
      return (a.match_reason || '').localeCompare(b.match_reason || '')
    })

    // Fetch listing details
    const listingIds = new Set()
    for (const p of sorted) {
      listingIds.add(p.listing_a_id)
      listingIds.add(p.listing_b_id)
    }

    const listingsMap = {}
    if (listingIds.size > 0) {
      const { data: listings } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, state, website, address, quality_score, status')
        .in('id', [...listingIds])

      for (const l of (listings || [])) {
        listingsMap[l.id] = l
      }
    }

    const enriched = sorted.map(p => ({
      ...p,
      listing_a: listingsMap[p.listing_a_id] || null,
      listing_b: listingsMap[p.listing_b_id] || null,
    }))

    return NextResponse.json({ pairs: enriched })
  } catch (err) {
    console.error('[api/admin/duplicates] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch duplicate pairs' }, { status: 500 })
  }
}

// ─── POST: Merge or dismiss a duplicate pair ─────────────

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, pair_id } = body

    if (!pair_id) {
      return NextResponse.json({ error: 'Missing pair_id' }, { status: 400 })
    }
    if (!['merge', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "merge" or "dismiss".' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()

    if (action === 'merge') {
      const { keep_id, remove_id } = body
      if (!keep_id || !remove_id) {
        return NextResponse.json({ error: 'Missing keep_id or remove_id for merge action' }, { status: 400 })
      }

      // Verify the pair exists
      const { data: pair, error: pairError } = await sb
        .from('duplicate_pairs')
        .select('*')
        .eq('id', pair_id)
        .single()

      if (pairError || !pair) {
        return NextResponse.json({ error: 'Pair not found' }, { status: 404 })
      }

      // Verify the listing IDs match the pair
      const pairIds = new Set([pair.listing_a_id, pair.listing_b_id])
      if (!pairIds.has(keep_id) || !pairIds.has(remove_id) || keep_id === remove_id) {
        return NextResponse.json({ error: 'keep_id and remove_id must match the pair listings' }, { status: 400 })
      }

      // Update the "remove" listing: mark as duplicate
      const { error: listingError } = await sb
        .from('listings')
        .update({
          status: 'duplicate',
          merged_into: keep_id,
        })
        .eq('id', remove_id)

      if (listingError) {
        console.error('[api/admin/duplicates] Listing update error:', listingError.message)
        return NextResponse.json({ error: 'Failed to update listing: ' + listingError.message }, { status: 500 })
      }

      // Update the pair record
      const { error: pairUpdateError } = await sb
        .from('duplicate_pairs')
        .update({
          status: 'merged',
          resolved_at: now,
          resolved_by: 'admin',
        })
        .eq('id', pair_id)

      if (pairUpdateError) {
        console.error('[api/admin/duplicates] Pair update error:', pairUpdateError.message)
        return NextResponse.json({ error: 'Failed to update pair: ' + pairUpdateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'merge',
        keep_id,
        remove_id,
      })
    }

    if (action === 'dismiss') {
      const { error: pairUpdateError } = await sb
        .from('duplicate_pairs')
        .update({
          status: 'dismissed',
          resolved_at: now,
          resolved_by: 'admin',
        })
        .eq('id', pair_id)

      if (pairUpdateError) {
        console.error('[api/admin/duplicates] Dismiss error:', pairUpdateError.message)
        return NextResponse.json({ error: 'Failed to dismiss pair: ' + pairUpdateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'dismiss',
        pair_id,
      })
    }
  } catch (err) {
    console.error('[api/admin/duplicates] POST error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
