import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST(request) {
  try {
    const body = await request.json()
    const { listing_id, report_type, details } = body

    if (!listing_id || !report_type) {
      return NextResponse.json({ error: 'listing_id and report_type required' }, { status: 400 })
    }

    const validTypes = ['permanently_closed', 'temporarily_closed', 'incorrect_info', 'other']
    if (!validTypes.includes(report_type)) {
      return NextResponse.json({ error: `report_type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch current listing
    const { data: listing, error: fetchErr } = await sb
      .from('listings')
      .select('id, staleness_flags, community_reports')
      .eq('id', listing_id)
      .maybeSingle()

    if (fetchErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Build updated staleness_flags
    const flags = listing.staleness_flags || {}
    const reports = flags.community_reports || []
    reports.push({
      type: report_type,
      details: details || null,
      submitted_at: new Date().toISOString(),
    })
    flags.community_reports = reports

    // Update listing
    const { error: updateErr } = await sb
      .from('listings')
      .update({
        staleness_flags: flags,
        community_reports: (listing.community_reports || 0) + 1,
      })
      .eq('id', listing_id)

    if (updateErr) {
      console.error('[community-report] Update error:', updateErr.message)
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Thank you for your report. We will review it shortly.' })
  } catch (err) {
    console.error('[community-report] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
