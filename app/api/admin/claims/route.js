import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const ATLAS_AUTH_URL = process.env.NEXT_PUBLIC_ATLAS_AUTH_URL || 'https://www.australianatlas.com.au'

// GET — return pending claims (for potential future API consumers)
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
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
  if (!(await checkAdmin(cookieStore))) {
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

// ─── Vertical display names & vendor URLs ────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

function getVerticalVendorUrl(vertical) {
  const config = VERTICAL_CONFIG[vertical]
  if (!config?.baseUrl) return null
  return `${config.baseUrl}/vendor/login`
}

// ─── Approve ──────────────────────────────────────────────

async function handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes }) {
  const sb = getSupabaseAdmin()

  // ── 1. Fetch the full claim record ──────────────────────
  let claimRecord = null
  let listingRecord = null

  if (usingPortalTable) {
    const { data } = await sb
      .from('claims_review')
      .select('*')
      .eq('id', claimId)
      .single()
    claimRecord = data
  }

  // Look up the master listing for vertical sync context
  if (claimRecord?.listing_id) {
    const { data } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug')
      .eq('id', claimRecord.listing_id)
      .single()
    listingRecord = data
  }

  // Use listing vertical if claim vertical is missing
  const effectiveVertical = vertical || claimRecord?.vertical || listingRecord?.vertical

  // ── 2. Update the portal claims_review table ────────────
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

    // Mark the master listing as claimed
    if (claimRecord?.listing_id) {
      await sb
        .from('listings')
        .update({ is_claimed: true })
        .eq('id', claimRecord.listing_id)
    }
  }

  // ── 3. Sync to vertical DB ─────────────────────────────
  let verticalUserId = null

  if (effectiveVertical && sourceClaimId) {
    // ── Path A: Vertical-originated claim (has sourceClaimId) ──
    try {
      const verticalClient = getVerticalClient(effectiveVertical)

      await verticalClient
        .from('claims')
        .update({ status: 'approved' })
        .eq('id', sourceClaimId)

      const { data: verticalClaim } = await verticalClient
        .from('claims')
        .select('venue_id, user_id')
        .eq('id', sourceClaimId)
        .maybeSingle()

      if (verticalClaim?.venue_id) {
        const venueTable = VERTICAL_CONFIG[effectiveVertical]?.table || 'venues'
        await verticalClient
          .from(venueTable)
          .update({ is_claimed: true })
          .eq('id', verticalClaim.venue_id)
      }

      verticalUserId = verticalClaim?.user_id
    } catch (err) {
      console.error(`[admin/claims] Vertical claim sync error (${effectiveVertical}):`, err.message)
    }
  } else if (effectiveVertical && usingPortalTable && listingRecord?.source_id) {
    // ── Path B: Portal-originated claim — create claim on vertical + mark venue claimed ──
    try {
      const verticalClient = getVerticalClient(effectiveVertical)
      const config = VERTICAL_CONFIG[effectiveVertical]
      let venueTable = config?.table || 'venues'
      let venueId = listingRecord.source_id

      // Fine Grounds uses prefixed source_ids: "roaster_123" or "cafe_456"
      if (effectiveVertical === 'fine_grounds') {
        if (venueId.startsWith('roaster_')) {
          venueTable = 'roasters'
          venueId = venueId.replace('roaster_', '')
        } else if (venueId.startsWith('cafe_')) {
          venueTable = 'cafes'
          venueId = venueId.replace('cafe_', '')
        }
      }

      // Mark the venue as claimed on the vertical
      await verticalClient
        .from(venueTable)
        .update({ is_claimed: true })
        .eq('id', venueId)

      // Create a pre-approved claim record on the vertical
      // (user_id is null — will be linked when vendor creates account)
      try {
        await verticalClient
          .from('claims')
          .insert({
            venue_id: venueId,
            venue_name: listingRecord.name || claimRecord?.claimant_name,
            contact_name: claimRecord?.claimant_name,
            contact_email: claimRecord?.claimant_email,
            status: 'approved',
            selected_tier: claimRecord?.tier || 'free',
            user_id: null,
          })
        console.log(`[admin/claims] Created pre-approved claim on ${effectiveVertical} for venue ${venueId}`)
      } catch (claimInsertErr) {
        // Non-fatal — not all verticals have a claims table
        console.warn(`[admin/claims] Could not create vertical claim (${effectiveVertical}):`, claimInsertErr.message)
      }
    } catch (err) {
      console.error(`[admin/claims] Vertical sync error (${effectiveVertical}):`, err.message)
    }
  }

  // ── 4. Promote user to vendor role (if user_id known) ──
  if (verticalUserId) {
    try {
      await fetch(`${ATLAS_AUTH_URL}/api/auth/promote-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET,
        },
        body: JSON.stringify({
          userId: verticalUserId,
          role: 'vendor',
          vertical: effectiveVertical,
        }),
      })
    } catch (promoteErr) {
      console.error('[admin/claims] Promote-role error:', promoteErr.message)
    }
  }

  // ── 5. Send approval email with vertical-specific link ──
  try {
    const email = claimRecord?.claimant_email
    const claimantName = claimRecord?.claimant_name
    const venueName = listingRecord?.name || ''
    const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
    const vendorUrl = getVerticalVendorUrl(effectiveVertical)
    const tier = claimRecord?.tier || 'free'

    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      const tierNote = tier === 'standard'
        ? `<p>You selected the <strong>Standard tier ($99/yr)</strong>. To activate your subscription, sign in to your vendor dashboard and complete payment through Stripe.</p>`
        : `<p>Your listing is on the <strong>Free tier</strong>. You can upgrade to Standard ($99/yr) anytime from your vendor dashboard for unlimited photos, analytics, and more.</p>`

      const vendorLink = vendorUrl
        ? `<p><a href="${vendorUrl}" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to your dashboard</a></p>
           <p style="color:#888;font-size:13px;">If you don't have an account yet, create one at <a href="${vendorUrl}">${vendorUrl}</a> using <strong>${email}</strong> — your approved claim will be linked automatically.</p>`
        : ''

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: email,
        subject: `Your claim for ${venueName || 'your listing'} has been approved`,
        html: `
          <h2>Claim approved</h2>
          <p>Hi ${claimantName || 'there'},</p>
          <p>Great news! Your claim for <strong>${venueName}</strong> on <strong>${verticalName}</strong> has been approved.</p>
          ${tierNote}
          ${vendorLink}
          <p>From your dashboard you can update your listing details, add photos, manage your subscription, and track page views.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Thanks for being part of the Australian Atlas network.</p>
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
