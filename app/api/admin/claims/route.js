import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, getVerticalClaimsTable } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { grantClaim } from '@/lib/claims/grantClaim'

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
      .select('id, listing_id, vertical, claimant_name, claimant_email, tier, status, admin_notes, source_claim_id, reviewed_at, created_at')
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

// Claim table config now imported from lib/supabase/clients.js (getVerticalClaimsTable)

// Operators manage claimed listings on the PORTAL dashboard. The old per-vertical
// /vendor/login destination is deprecated (those routes do not exist).
function getOperatorDashboardUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
  return `${site}/dashboard`
}

// ─── Approve ──────────────────────────────────────────────

async function handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes }) {
  const sb = getSupabaseAdmin()

  // ── 1. Fetch the claim from claims_review (canonical intake/moderation record) ──
  let claimRecord = null
  if (usingPortalTable) {
    const { data } = await sb
      .from('claims_review')
      .select('id, listing_id, vertical, claimant_name, claimant_email, tier, status, admin_notes, source_claim_id, reviewed_at, created_at')
      .eq('id', claimId)
      .single()
    claimRecord = data
  }

  // Identity + ownership are resolved from the portal claim record. Vertical-direct
  // approval (no claims_review row) is no longer supported — every claim now funnels
  // through claims_review (public intake + the internal sync-claim endpoint).
  if (!claimRecord?.listing_id || !claimRecord?.claimant_email) {
    console.error('[admin/claims] Approve needs a claims_review record with listing_id + claimant_email')
    return NextResponse.json(
      { error: 'Claim not found in claims_review (vertical-direct approval is no longer supported)' },
      { status: 422 }
    )
  }

  const effectiveVertical = vertical || claimRecord.vertical

  // Listing context for the approval email
  const { data: listingRecord } = await sb
    .from('listings')
    .select('id, name')
    .eq('id', claimRecord.listing_id)
    .maybeSingle()

  // ── 2. Grant the claim (idempotent) ──
  // grantClaim resolves identity by email (provisioning the auth user if needed),
  // promotes to vendor + vertical, inserts the single ownership row, and flips
  // listings.is_claimed=true (the only claim field that syncs to the vertical).
  // tier='free' = manual/concierge grant; paid grants arrive via the Stripe webhook
  // (tier='standard') and upgrade this row in place. grantClaim logs its own failures
  // to failed_role_promotions. We grant BEFORE recording approval so the
  // "is_claimed ⟺ exactly one active claim" invariant holds before the moderation
  // row is marked done; on failure the claim stays pending and stays actionable.
  const grant = await grantClaim({
    listing_id: claimRecord.listing_id,
    vertical: effectiveVertical,
    claimant_email: claimRecord.claimant_email,
    tier: 'free',
    source_review_id: claimId,
  })
  if (!grant.ok) {
    console.error(`[admin/claims] grantClaim failed for claim ${claimId}:`, grant.error)
    return NextResponse.json({ error: `Grant failed: ${grant.error}` }, { status: 500 })
  }

  // ── 3. Record the approval on claims_review ──
  {
    const { error } = await sb
      .from('claims_review')
      .update({
        status: 'approved',
        admin_notes: admin_notes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)
    if (error) {
      // The grant already succeeded; surface the bookkeeping failure without unwinding it.
      console.error('[admin/claims] claims_review approval update error:', error)
      return NextResponse.json({ error: 'Claim granted but failed to record approval' }, { status: 500 })
    }
  }

  // ── 4. Send approval email with vertical-specific link ──
  try {
    const email = claimRecord?.claimant_email
    const claimantName = claimRecord?.claimant_name
    const venueName = listingRecord?.name || ''
    const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
    const dashboardUrl = getOperatorDashboardUrl()
    const tier = claimRecord?.tier || 'free'

    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      const tierNote = tier === 'standard'
        ? `<p>You selected the <strong>Standard tier ($99/yr)</strong>. To activate your subscription, sign in to your vendor dashboard and complete payment through Stripe.</p>`
        : `<p>Your listing is on the <strong>Free tier</strong>. You can upgrade to Standard ($99/yr) anytime from your vendor dashboard for unlimited photos, analytics, and more.</p>`

      const vendorLink = `<p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Manage your listing</a></p>
           <p style="color:#888;font-size:13px;">New to Australian Atlas? We've emailed a separate invitation to set up your account for <strong>${email}</strong>. Once you set a password you can manage your listing anytime at <a href="${dashboardUrl}">${dashboardUrl}</a>.</p>`

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
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

      await sb.from('claim_audit_log').insert({
        claim_id: claimId,
        action: 'notification_sent',
        actor: 'system',
        details: { type: 'approval_email', to: email },
      }).then(null, () => {})
    }
  } catch {
    // Non-fatal
  }

  // ── Audit log ────────────────────────────────────────────
  await sb.from('claim_audit_log').insert({
    claim_id: claimId,
    action: 'approved',
    actor: 'admin',
    details: {
      vertical: effectiveVertical,
      source_claim_id: sourceClaimId || null,
      admin_notes: admin_notes || null,
    },
  }).then(null, err => console.error('[admin/claims] Audit log error:', err))

  // ── 5. Fire Operator Amplification Agent (non-blocking) ──
  // Sends the operator a personalised share kit with social captions,
  // newsletter paragraph, and their listing URL.
  if (claimRecord?.claimant_email && claimRecord?.listing_id) {
    import('@/lib/agents/operator-amplification-agent')
      .then(({ sendShareKit }) => {
        sendShareKit(claimRecord.listing_id, claimRecord.claimant_email, claimRecord.claimant_name)
      })
      .catch(err => console.error('[admin/claims] Operator amplification agent error:', err.message))
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
      const claimConfig = getVerticalClaimsTable(vertical)
      await verticalClient
        .from(claimConfig.table)
        .update({ status: 'rejected' })
        .eq('id', sourceClaimId)
    } catch (err) {
      console.error(`[admin/claims] Error rejecting on vertical ${vertical}:`, err.message)
    }
  }

  // 3. Send rejection notification email
  try {
    let claimRecord = null
    let listingRecord = null
    if (usingPortalTable) {
      const { data } = await sb
        .from('claims_review')
        .select('claimant_email, claimant_name, listing_id, vertical')
        .eq('id', claimId)
        .single()
      claimRecord = data
      if (data?.listing_id) {
        const { data: listing } = await sb
          .from('listings')
          .select('name')
          .eq('id', data.listing_id)
          .single()
        listingRecord = listing
      }
    }

    const email = claimRecord?.claimant_email
    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const venueName = listingRecord?.name || 'your venue'
      const verticalName = VERTICAL_NAMES[claimRecord?.vertical || vertical] || 'Australian Atlas'

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
        to: email,
        subject: `Update on your claim for ${venueName}`,
        html: `
          <h2>Claim update</h2>
          <p>Hi ${claimRecord?.claimant_name || 'there'},</p>
          <p>We've reviewed your claim for <strong>${venueName}</strong> on <strong>${verticalName}</strong> and were unable to verify it at this time.</p>
          ${admin_notes ? `<p><em>${admin_notes}</em></p>` : ''}
          <p>If you believe this is an error, please reply to this email or contact us at <a href="mailto:listings@australianatlas.com.au">listings@australianatlas.com.au</a>. You're welcome to submit a new claim with additional verification details.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Australian Atlas</p>
        `,
      }).catch(err => console.error('[admin/claims] Email error:', err.message))

      await sb.from('claim_audit_log').insert({
        claim_id: claimId,
        action: 'notification_sent',
        actor: 'system',
        details: { type: 'rejection_email', to: email },
      }).then(null, () => {})
    }
  } catch {
    // Non-fatal
  }

  // ── Audit log ────────────────────────────────────────────
  await sb.from('claim_audit_log').insert({
    claim_id: claimId,
    action: 'rejected',
    actor: 'admin',
    details: {
      vertical: vertical || null,
      source_claim_id: sourceClaimId || null,
      admin_notes: admin_notes || null,
    },
  }).then(null, err => console.error('[admin/claims] Audit log error:', err))

  return NextResponse.json({ success: true, action: 'rejected' })
}
