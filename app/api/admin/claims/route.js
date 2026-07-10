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

// POST — approve, reject, or set the granted tier of a claim
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
      tier,
    } = await request.json()

    if (!claimId || !['approve', 'reject', 'set_tier'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request — need claimId and action' }, { status: 400 })
    }

    if (action === 'approve') {
      return await handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }

    if (action === 'reject') {
      return await handleReject({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }

    if (action === 'set_tier') {
      return await handleSetTier({ claimId, tier })
    }
  } catch (err) {
    console.error('[admin/claims] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

// ─── Vertical display names ──────────────────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Claim table config now imported from lib/supabase/clients.js (getVerticalClaimsTable)

// Operator access lives on the portal itself (australianatlas.com.au), never a
// vertical /vendor/login surface. Sign-in is driven off the Supabase invite that
// grantClaim sends; this is the fallback / existing-user sign-in base.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

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

  // ── 4. Send approval email — access is driven off the Supabase invite ──
  // grantClaim provisions the auth user and emails a secure magic sign-in link
  // (redirectTo → /account) whenever the operator is new (grant.provisioned).
  // This message confirms the approval and points at that link / the portal
  // /login — never a vertical /vendor/login, and it promises no auto-linking
  // that no code performs (the claim is already linked server-side).
  try {
    const email = claimRecord?.claimant_email
    const claimantName = claimRecord?.claimant_name
    const venueName = listingRecord?.name || ''
    const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
    // Admin approval ALWAYS grants the Free tier (grantClaim is called with
    // tier:'free' above). Standard is granted only via the paid Stripe webhook.
    // We NEVER tell an unpaid claimant they're on Standard — instead, when they
    // ASKED for Standard we give them a one-click pay link so activation is
    // straightforward from the moment the claim is approved. The link
    // (/api/claim/pay) mints a fresh checkout every click and, on payment, the
    // webhook upgrades this free row to Standard in place.
    const requestedStandard = claimRecord?.tier === 'standard'
    const payUrl = `${SITE_URL}/api/claim/pay?claim=${claimId}`
    const payButton = (label, weight) =>
      `<p style="margin:24px 0;"><a href="${payUrl}" style="display:inline-block;padding:14px 32px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:${weight};font-size:15px;">${label}</a></p>`

    if (email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      const tierNote = requestedStandard
        ? `<p>You asked for the <strong>Standard plan ($295/year)</strong> — you're one click away. Activate it now to unlock full editing: website &amp; contact details, opening hours, your photo gallery, highlights and analytics.</p>
           ${payButton('Activate Standard — $295/year', 700)}
           <p style="color:#888;font-size:13px;">Prefer to stay on Free for now? No action needed — your listing is already live.</p>`
        : `<p>Your listing is live on the <strong>Free tier</strong>. Want full editing, your photo gallery, opening hours and analytics? Upgrade to Standard anytime:</p>
           ${payButton('Upgrade to Standard — $295/year', 600)}`

      const accessBlock = grant.provisioned
        ? `<p>We've just sent a separate email to <strong>${email}</strong> with a secure sign-in link. Click it to finish setting up access and open your operator dashboard.</p>
           <p style="color:#888;font-size:13px;">You can also sign in any time at <a href="${SITE_URL}/login">${SITE_URL.replace(/^https?:\/\//, '')}/login</a>.</p>`
        : `<p><a href="${SITE_URL}/login" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to your dashboard</a></p>
           <p style="color:#888;font-size:13px;">Sign in to your Australian Atlas account (<strong>${email}</strong>) to manage your listing.</p>`

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
        to: email,
        subject: `Your claim for ${venueName || 'your listing'} has been approved`,
        html: `
          <h2>Claim approved</h2>
          <p>Hi ${claimantName || 'there'},</p>
          <p>Great news! Your claim for <strong>${venueName}</strong> on <strong>${verticalName}</strong> has been approved, and your operator dashboard is ready.</p>
          ${tierNote}
          ${accessBlock}
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

// ─── Set tier (admin upgrade / downgrade) ─────────────────

// Flips the GRANTED tier on the active listing_claims row — the single field
// every paid gate reads (isListingPaid: status='active' AND tier='standard').
// Upgrading here is a deliberate admin side door for payments taken outside
// Stripe (invoice, phone) or comps: it sets tier='standard' with no Stripe
// subscription, which grantClaim itself refuses to do. Such rows have no
// billing portal (no stripe_customer_id) and won't renew or expire on their
// own; downgrading them back to free is the admin's job, here.
async function handleSetTier({ claimId, tier }) {
  const sb = getSupabaseAdmin()

  if (!['free', 'standard'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier — must be free or standard' }, { status: 400 })
  }

  // Resolve the listing from the moderation record
  const { data: claimRecord } = await sb
    .from('claims_review')
    .select('id, listing_id, vertical, claimant_email')
    .eq('id', claimId)
    .maybeSingle()

  if (!claimRecord?.listing_id) {
    return NextResponse.json({ error: 'Claim not found in claims_review' }, { status: 404 })
  }

  // The tier lives on the granted ownership row, so the claim must be approved first
  const { data: active } = await sb
    .from('listing_claims')
    .select('id, tier, claimant_email, stripe_subscription_id')
    .eq('listing_id', claimRecord.listing_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!active) {
    return NextResponse.json(
      { error: 'No active granted claim for this listing — approve the claim first' },
      { status: 409 }
    )
  }

  if (active.tier === tier) {
    return NextResponse.json({ success: true, action: 'set_tier', tier, unchanged: true })
  }

  // Never silently downgrade a live Stripe subscription — cancel it in Stripe
  // instead (the webhook then deactivates the claim and clears is_claimed).
  if (tier === 'free' && active.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'This claim is billed through Stripe — cancel the subscription in Stripe instead of downgrading here' },
      { status: 409 }
    )
  }

  const { error: updateError } = await sb
    .from('listing_claims')
    .update({ tier, updated_at: new Date().toISOString() })
    .eq('id', active.id)

  if (updateError) {
    console.error('[admin/claims] set_tier update error:', updateError)
    return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 })
  }

  await sb.from('claim_audit_log').insert({
    claim_id: claimId,
    action: tier === 'standard' ? 'tier_upgraded' : 'tier_downgraded',
    actor: 'admin',
    details: {
      listing_id: claimRecord.listing_id,
      claimant_email: active.claimant_email,
      from_tier: active.tier,
      to_tier: tier,
      comped: tier === 'standard' && !active.stripe_subscription_id,
    },
  }).then(null, err => console.error('[admin/claims] Audit log error:', err))

  return NextResponse.json({ success: true, action: 'set_tier', tier })
}
