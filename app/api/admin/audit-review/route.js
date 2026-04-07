import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// GET — return all hidden/flagged fine_grounds listings for review
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('listings')
    .select('id, source_id, name, slug, website, state, region, address, lat, lng, status, vertical, sub_type, created_at')
    .eq('vertical', 'fine_grounds')
    .eq('status', 'hidden')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listings: data || [] })
}

// POST — action a flagged listing: approve (restore), delete, or skip
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, action } = await request.json()

  if (!id || !['approve', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'Need id and action (approve|delete)' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  if (action === 'approve') {
    // Restore to active
    const { error } = await sb
      .from('listings')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, action: 'approved' })
  }

  if (action === 'delete') {
    // Look up vertical source info before deleting
    const { data: listing } = await sb
      .from('listings')
      .select('source_id, vertical')
      .eq('id', id)
      .single()

    // Delete meta first
    await sb.from('fine_grounds_meta').delete().eq('listing_id', id)
    // Delete listing
    const { error } = await sb.from('listings').delete().eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also delete from FGA vertical DB
    if (listing?.source_id) {
      try {
        const { getVerticalClient } = await import('@/lib/supabase/clients')
        const fgClient = getVerticalClient('fine_grounds')

        if (listing.source_id.startsWith('roaster_')) {
          const fgId = listing.source_id.replace('roaster_', '')
          await fgClient.from('roasters').delete().eq('id', fgId)
        } else if (listing.source_id.startsWith('cafe_')) {
          const fgId = listing.source_id.replace('cafe_', '')
          await fgClient.from('cafes').delete().eq('id', fgId)
        }
      } catch (err) {
        console.warn('[audit-review] FGA delete failed:', err.message)
      }
    }

    return NextResponse.json({ success: true, action: 'deleted' })
  }
}
