import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient } from '@/lib/supabase/clients'

const ATLAS_AUTH_URL = process.env.NEXT_PUBLIC_ATLAS_AUTH_URL || 'https://www.australianatlas.com.au'

function checkAdmin(cookieStore) {
  const token = cookieStore.get('atlas_admin')?.value
    || cookieStore.get('admin_auth')?.value
  if (!token) return false
  // Support both the legacy static string and env-based password
  return token === 'admin_authenticated' || token === process.env.ADMIN_PASSWORD
}

// GET — return pending claims (for potential future API consumers)
export async function GET() {
  const cookieStore = await cookies()
  if (!checkAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('claims_review')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ claims: data || [] })
  } catch (err) {
    console.error('[admin/claims] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
  }
}

// POST — approve or reject a claim
export async function POST(request) {
  const cookieStore = await cookies()
  if (!checkAdmin(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const {
      claimId,
      vertical,
      sourceClaimId,
      usingPortalTable,
      action,
      admin_notes,
    } = await request.json()

    if (!claimId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request — need claimId and action' }, { status: 400 })
    }

    if (action === 'approve') {
      return await handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }

    if (action === 'reject') {
      return await handleReject({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }
  } catch (err) {
    console.error('[admin/claims] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

// ─── Approve ──────────────────────────────────────────────

async function handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes }) {
  const sb = getSupabaseAdmin()

  // 1. Update the portal claims_review table (if it exists)
  if (usingPortalTable) {
    const { error } = await sb
      .from('claims_review')
      .update({
        status: 'approved',
        admin_notes: admin_notes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)

    if (error) {
      console.error('[admin/claims] Portal table update error:', error)
      return NextResponse.json({ error: 'Failed to update portal claim' }, { status: 500 })
    }

    // Also update the listing on the portal
    const { data: portalClaim } = await sb
      .from('claims_review')
      .select('listing_id')
      .eq('id', claimId)
      .single()

    if (portalClaim?.listing_id) {
      await sb
        .from('listings')
        .update({ is_claimed: true })
        .eq('id', portalClaim.listing_id)
    }
  }

  // 2. Update the vertical's own claims table
  if (vertical && sourceClaimId) {
    try {
      const verticalClient = getVerticalClient(vertical)

      const { error: vcError } = await verticalClient
        .from('claims')
        .update({ status: 'approved' })
        .eq('id', sourceClaimId)

      if (vcError) {
        console.error(`[admin/claims] Vertical ${vertical} claim update error:`, vcError)
        // Non-fatal — continue
      }

      // Look up the venue_id from the claim, then mark the venue as claimed
      const { data: verticalClaim } = await verticalClient
        .from('claims')
        .select('venue_id, user_id')
        .eq('id', sourceClaimId)
        .single()

      if (verticalClaim?.venue_id) {
        await verticalClient
          .from('venues')
          .update({ is_claimed: true })
          .eq('id', verticalClaim.venue_id)
      }

      // 3. Promote user to vendor role on Australian Atlas
      if (verticalClaim?.user_id) {
        try {
          await fetch(`${ATLAS_AUTH_URL}/api/auth/promote-role`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-secret': process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET,
            },
            body: JSON.stringify({
              userId: verticalClaim.user_id,
              role: 'vendor',
              vertical,
            }),
          })
        } catch (promoteErr) {
          // Non-fatal — claim is still approved even if role promotion fails
          console.error('[admin/claims] Promote-role error:', promoteErr.message)
        }
      }
    } catch (err) {
      console.error(`[admin/claims] Error updating vertical ${vertical}:`, err.message)
      // Non-fatal if the portal table was updated
    }
  }

  // 4. Send approval notification email
  try {
    // Look up email from whichever source has it
    let email = null
    if (usingPortalTable) {
      const { data } = await sb
        .from('claims_review')
        .select('claimant_email, claimant_name')
        .eq('id', claimId)
        .single()
      email = data?.claimant_email
    }

    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: email,
        subject: 'Your venue claim has been approved',
        html: `
          <h2>Claim approved</h2>
          <p>Great news! Your venue claim has been approved. You can now manage your listing through your vendor dashboard.</p>
          <p>Thanks for being part of the Australian Atlas network.</p>
        `,
      }).catch(err => console.error('[admin/claims] Email error:', err.message))
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true, action: 'approved' })
}

// ─── Reject ───────────────────────────────────────────────

async function handleReject({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes }) {
  const sb = getSupabaseAdmin()

  // 1. Update portal claims_review table
  if (usingPortalTable) {
    const { error } = await sb
      .from('claims_review')
      .update({
        status: 'rejected',
        admin_notes: admin_notes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)

    if (error) {
      console.error('[admin/claims] Portal table update error:', error)
      return NextResponse.json({ error: 'Failed to update portal claim' }, { status: 500 })
    }
  }

  // 2. Update the vertical's own claims table
  if (vertical && sourceClaimId) {
    try {
      const verticalClient = getVerticalClient(vertical)
      await verticalClient
        .from('claims')
        .update({ status: 'rejected' })
        .eq('id', sourceClaimId)
    } catch (err) {
      console.error(`[admin/claims] Error rejecting on vertical ${vertical}:`, err.message)
    }
  }

  // 3. Send rejection notification email
  try {
    let email = null
    if (usingPortalTable) {
      const { data } = await sb
        .from('claims_review')
        .select('claimant_email')
        .eq('id', claimId)
        .single()
      email = data?.claimant_email
    }

    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: email,
        subject: 'Update on your venue claim',
        html: `
          <h2>Claim update</h2>
          <p>Unfortunately, your venue claim was not approved at this time.</p>
          ${admin_notes ? `<p><em>${admin_notes}</em></p>` : ''}
          <p>If you have questions, please reply to this email.</p>
        `,
      }).catch(err => console.error('[admin/claims] Email error:', err.message))
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true, action: 'rejected' })
}
