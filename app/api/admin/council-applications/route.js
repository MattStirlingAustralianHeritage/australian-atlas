// app/api/admin/council-applications/route.js
// Admin actions on incoming council applications (council_enquiries):
//   • provision — approve & set up the account (create council_account, link the
//                 region, send welcome + one-click login link), mark converted.
//   • decline   — mark the lead declined.
//   • delete    — remove a lead (e.g. test rows).
//   • note      — attach an admin note.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { provisionCouncil } from '@/lib/council-provision'

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, enquiryId, regionId, tier, note } = await request.json()
    if (!enquiryId) {
      return NextResponse.json({ error: 'enquiryId required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const { data: enquiry, error: fetchErr } = await sb
      .from('council_enquiries')
      .select('id, name, organisation, email, region, region_id, region_name, status')
      .eq('id', enquiryId)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!enquiry) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    switch (action) {
      case 'provision': {
        // Region: use an admin-supplied override, else the matched region on the
        // enquiry. Resolve its name for the welcome email.
        const useRegionId = regionId || enquiry.region_id || null
        let regionName = enquiry.region_name || null
        if (useRegionId && (!regionName || regionId)) {
          const { data: r } = await sb.from('regions').select('name').eq('id', useRegionId).maybeSingle()
          regionName = r?.name || regionName
        }

        const result = await provisionCouncil({
          contactEmail: enquiry.email,
          name: enquiry.organisation,
          contactName: enquiry.name,
          regionId: useRegionId,
          regionName,
          enquiryId: enquiry.id,
          tier: ['explorer', 'partner', 'enterprise'].includes(tier) ? tier : 'partner',
          sendEmail: true,
        })

        return NextResponse.json({
          success: true,
          councilId: result.councilId,
          slug: result.slug,
          emailSent: result.emailSent,
          reused: result.reused,
        })
      }

      case 'decline': {
        const { error } = await sb
          .from('council_enquiries')
          .update({ status: 'declined', reviewed_at: new Date().toISOString() })
          .eq('id', enquiryId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'delete': {
        const { error } = await sb.from('council_enquiries').delete().eq('id', enquiryId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'note': {
        const { error } = await sb
          .from('council_enquiries')
          .update({ notes: note ? String(note).slice(0, 2000) : null })
          .eq('id', enquiryId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[admin/council-applications] error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
