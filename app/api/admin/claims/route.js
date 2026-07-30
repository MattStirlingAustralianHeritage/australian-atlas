import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, getVerticalClaimsTable } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { grantClaim } from '@/lib/claims/grantClaim'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { compExpiryFromDuration, isValidCompDuration, DEFAULT_COMP_DURATION } from '@/lib/claims/comp.mjs'
import { mergeAdminNotes } from '@/lib/claims/adminNotes.mjs'

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

// POST — approve, reject, set the granted tier of, or revoke a claim
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const {
      claimId,
      listingId,
      vertical,
      sourceClaimId,
      usingPortalTable,
      action,
      admin_notes,
      tier,
      duration,
      note,
    } = await request.json()

    // set_tier and revoke may be addressed by listingId instead (search results
    // act on listings, which don't always have a moderation row);
    // approve/reject are moderation actions and always need the claims_review id.
    const hasTarget = (action === 'set_tier' || action === 'revoke') ? (claimId || listingId) : claimId
    if (!hasTarget || !['approve', 'reject', 'set_tier', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request — need a claim target and a valid action' }, { status: 400 })
    }

    if (action === 'approve') {
      return await handleApprove({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }

    if (action === 'reject') {
      return await handleReject({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes })
    }

    if (action === 'set_tier') {
      return await handleSetTier({ claimId, listingId, tier, duration, note })
    }

    if (action === 'revoke') {
      return await handleRevoke({ claimId, listingId, admin_notes })
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
  // The status depends on whether the claimant has proven their address.
  // Unverified → 'pending_verification': the admin has said yes, but nothing is
  // owned yet and the listing stays claimable. Only the operator's own sign-in
  // moves it to 'approved' (finalizeClaim does that). Overwriting it here would
  // undo the gate this whole flow exists to enforce.
  {
    const { error } = await sb
      .from('claims_review')
      .update({
        status: grant.pendingVerification ? 'pending_verification' : 'approved',
        admin_notes: mergeAdminNotes(claimRecord.admin_notes, admin_notes, 'on approval'),
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
  // grantClaim emails a single-use invite link (confirm address → set password
  // → /account) whenever the operator's address is not already verified, and
  // reports whether that send succeeded as grant.linkSent. This message
  // confirms the approval and points at that link / the portal /login — never a
  // vertical /vendor/login, and it promises no auto-linking that no code
  // performs (the claim is already linked server-side).
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

      // The claim is only finished once the address answers, so the copy must
      // not imply otherwise. Telling an operator their "dashboard is ready"
      // when ownership is still gated is exactly the mismatch that left people
      // believing they were done while their listing sat unclaimed.
      // Only claim a link was sent when one actually was (grant.linkSent).
      // Promising mail that never went out is what left operators waiting on
      // an email that did not exist.
      const accessBlock = grant.pendingVerification
        ? (grant.linkSent
            ? `<p><strong>One step left.</strong> We've sent a separate email to <strong>${email}</strong> with a link to confirm this address and choose your password. Opening it completes the claim — until then the listing isn't assigned to anyone.</p>
           <p style="color:#888;font-size:13px;">Can't find it? Go to <a href="${SITE_URL}/login">${SITE_URL.replace(/^https?:\/\//, '')}/login</a> and use &ldquo;Forgot password?&rdquo; to get a fresh link.</p>`
            : `<p><strong>One step left.</strong> We need to confirm that <strong>${email}</strong> is yours before the listing is assigned to anyone. Go to <a href="${SITE_URL}/login">${SITE_URL.replace(/^https?:\/\//, '')}/login</a> and use &ldquo;Forgot password?&rdquo; — we'll email you a link to confirm the address and set your password.</p>`)
        : `<p><a href="${SITE_URL}/login" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to your dashboard</a></p>
           <p style="color:#888;font-size:13px;">Sign in to your Australian Atlas account (<strong>${email}</strong>) with your email and password to manage your listing.</p>`

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
        to: email,
        subject: `Your claim for ${venueName || 'your listing'} has been approved`,
        html: `
          <h2>Claim approved</h2>
          <p>Hi ${claimantName || 'there'},</p>
          <p>Great news! Your claim for <strong>${venueName}</strong> on <strong>${verticalName}</strong> has been approved${grant.pendingVerification ? '' : ', and your operator dashboard is ready'}.</p>
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

  // ── 5. Share kit ──
  // Deliberately NOT fired here any more. It congratulates the operator, says
  // their listing is live, and links to the operator dashboard — none of which
  // is true at approval under the migration-265 gate, where an approved claim
  // owns nothing until the address answers. Sending it here handed a
  // pending-verification claimant a dashboard link that 403s them, directly
  // contradicting the "one step left" approval email in the same inbox.
  //
  // It now fires from finalizeClaim, at the moment ownership actually exists —
  // so it still goes out for a claimant who was already verified (this route
  // finalizes them in one pass), just from the place that knows it is true.

  return NextResponse.json({ success: true, action: 'approved' })
}

// ─── Reject ───────────────────────────────────────────────

async function handleReject({ claimId, vertical, sourceClaimId, usingPortalTable, admin_notes }) {
  const sb = getSupabaseAdmin()

  // 1. Update portal claims_review table
  if (usingPortalTable) {
    // Same provenance rule as approval — a rejection is exactly when you most
    // want to keep what the claimant originally asserted about themselves.
    const { data: prior } = await sb
      .from('claims_review')
      .select('admin_notes')
      .eq('id', claimId)
      .maybeSingle()

    const { error } = await sb
      .from('claims_review')
      .update({
        status: 'rejected',
        admin_notes: mergeAdminNotes(prior?.admin_notes, admin_notes, 'on rejection'),
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

// Flips the GRANTED tier on the live listing_claims row — the field every paid
// gate reads (isListingPaid: live status AND tier='standard'). Upgrading here
// is a deliberate admin side door for payments taken outside Stripe (invoice,
// phone) or comps: it sets tier='standard' with no Stripe subscription, which
// grantClaim itself refuses to do.
//
// A comp may now carry a TERM (`duration`, migration 261): one month through to
// in perpetuity. The term is stored on the claim as comp_expires_at and enforced
// at read time by filterPaidListingIds, with sweepExpiredComps reconciling the
// stored tier when it runs out. 'perpetual' reproduces the old behaviour and is
// still a real choice — it just has to be chosen now, rather than being what
// every comp silently became.
//
// The target claim is addressed either by `claimId` (a claims_review row — how
// the review cards call it) or by `listingId` (how search results call it, since
// a listing can hold a granted claim with no moderation row behind it, e.g. one
// granted through the Stripe webhook).
async function handleSetTier({ claimId, listingId, tier, duration, note }) {
  const sb = getSupabaseAdmin()

  if (!['free', 'standard'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier — must be free or standard' }, { status: 400 })
  }
  if (!claimId && !listingId) {
    return NextResponse.json({ error: 'Need a claimId or a listingId' }, { status: 400 })
  }

  const compDuration = tier === 'standard' ? (duration || DEFAULT_COMP_DURATION) : null
  if (compDuration && !isValidCompDuration(compDuration)) {
    return NextResponse.json({ error: `Invalid duration '${compDuration}'` }, { status: 400 })
  }

  // Resolve the listing — directly, or through the moderation record.
  let targetListingId = listingId || null
  let reviewId = claimId || null
  if (!targetListingId) {
    const { data: claimRecord } = await sb
      .from('claims_review')
      .select('id, listing_id, vertical, claimant_email')
      .eq('id', claimId)
      .maybeSingle()
    if (!claimRecord?.listing_id) {
      return NextResponse.json({ error: 'Claim not found in claims_review' }, { status: 404 })
    }
    targetListingId = claimRecord.listing_id
  }

  // The tier lives on the granted ownership row, so ownership must exist first.
  // Read LIVE statuses, not 'active' alone: a claim in Stripe dunning is still
  // owned, and reporting "no active claim" for it would be a lie (and, if the
  // admin then re-granted, a duplicate-live-claim bug).
  const { data: liveRows } = await sb
    .from('listing_claims')
    .select('id, tier, status, claimant_email, stripe_subscription_id, comp_expires_at, source_review_id')
    .eq('listing_id', targetListingId)
    .in('status', LIVE_CLAIM_STATUSES)
    .order('status', { ascending: true }) // 'active' sorts before 'past_due'
  const live = liveRows?.[0] || null

  if (!live) {
    return NextResponse.json(
      { error: 'No granted claim for this listing — an operator has to claim it (and be approved) before a tier can be set' },
      { status: 409 }
    )
  }
  if (!reviewId) reviewId = live.source_review_id || null

  // Never silently downgrade a live Stripe subscription — cancel it in Stripe
  // instead (the webhook then deactivates the claim and clears is_claimed).
  if (live.stripe_subscription_id) {
    if (tier === 'free') {
      return NextResponse.json(
        { error: 'This claim is billed through Stripe — cancel the subscription in Stripe instead of downgrading here' },
        { status: 409 }
      )
    }
    // Already Standard and paying. A comp term on top would be meaningless (and
    // migration 261's CHECK constraint rejects it outright).
    return NextResponse.json(
      { error: 'This claim is billed through Stripe — its Standard access is already paid for, so a comp term does not apply' },
      { status: 409 }
    )
  }

  // Free → Free is genuinely a no-op. Standard → Standard is NOT: that is how a
  // running comp gets extended, shortened, or converted to perpetual.
  if (tier === 'free' && live.tier === 'free') {
    return NextResponse.json({ success: true, action: 'set_tier', tier, unchanged: true })
  }

  const compExpiresAt = tier === 'standard' ? compExpiryFromDuration(compDuration) : null

  const patch = tier === 'standard'
    ? {
        tier: 'standard',
        comp_expires_at: compExpiresAt,
        comp_granted_at: new Date().toISOString(),
        comp_note: (note || '').trim() || null,
        updated_at: new Date().toISOString(),
      }
    // Downgrading clears the term with the tier — a leftover expiry on a Free
    // row would keep re-triggering the sweep and muddy the audit trail.
    : {
        tier: 'free',
        comp_expires_at: null,
        comp_granted_at: null,
        comp_note: null,
        updated_at: new Date().toISOString(),
      }

  const { error: updateError } = await sb
    .from('listing_claims')
    .update(patch)
    .eq('id', live.id)

  if (updateError) {
    console.error('[admin/claims] set_tier update error:', updateError)
    return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 })
  }

  await sb.from('claim_audit_log').insert({
    claim_id: reviewId,
    action: tier === 'standard' ? 'tier_upgraded' : 'tier_downgraded',
    actor: 'admin',
    details: {
      listing_id: targetListingId,
      claimant_email: live.claimant_email,
      from_tier: live.tier,
      to_tier: tier,
      comped: tier === 'standard',
      comp_duration: compDuration,
      comp_expires_at: compExpiresAt,
      previous_comp_expires_at: live.comp_expires_at || null,
      note: (note || '').trim() || null,
    },
  }).then(null, err => console.error('[admin/claims] Audit log error:', err))

  return NextResponse.json({
    success: true,
    action: 'set_tier',
    tier,
    compExpiresAt,
    compDuration,
  })
}

// ─── Revoke ownership ─────────────────────────────────────
//
// The claim was granted to the wrong person — a claim approved before the
// verification gate existed, an operator who sold up, a mistaken grant. Until
// now there was no way to undo one: the only code in the whole platform that
// deactivated a listing_claims row was the Stripe cancellation webhook, so
// every wrongly-granted free claim needed hand-written SQL.
//
// ORDER MATTERS, and it is the whole reason this lives in one place. Migration
// 256's trigger silently coerces listings.is_claimed back to true while a live
// claim exists, so clearing the flag first looks like it worked and doesn't.
// The claim row must go inactive FIRST; only then does the flag clear stick.
//
// Stripe-billed claims are refused outright: deactivating the ownership row
// while the subscription keeps charging would bill someone for a listing they
// no longer hold. Cancel in Stripe and let the webhook downgrade them.
async function handleRevoke({ claimId, listingId, admin_notes }) {
  const sb = getSupabaseAdmin()

  // Resolve the listing, whether we were handed a moderation row or a listing.
  let targetListingId = listingId || null
  if (!targetListingId && claimId) {
    const { data: review } = await sb
      .from('claims_review')
      .select('listing_id')
      .eq('id', claimId)
      .maybeSingle()
    targetListingId = review?.listing_id || null
  }
  if (!targetListingId) {
    return NextResponse.json({ error: 'Could not resolve a listing to revoke' }, { status: 404 })
  }

  const { data: liveRows, error: readErr } = await sb
    .from('listing_claims')
    .select('id, claimant_email, tier, status, stripe_subscription_id')
    .eq('listing_id', targetListingId)
    .in('status', LIVE_CLAIM_STATUSES)
    .limit(1)
  if (readErr) {
    console.error('[admin/claims] revoke: claim read failed:', readErr.message)
    return NextResponse.json({ error: 'Could not read the ownership record' }, { status: 500 })
  }
  let live = liveRows?.[0]

  // Resuming a half-finished revoke. If a previous run deactivated the claim
  // but failed to clear is_claimed, there is no LIVE claim left to find — so
  // the plain lookup above would 409 and the "re-run the revoke" advice this
  // handler gives would be impossible to follow. Recognise that state and
  // finish the job instead.
  let resuming = false
  if (!live) {
    const { data: listing } = await sb
      .from('listings')
      .select('is_claimed')
      .eq('id', targetListingId)
      .maybeSingle()
    if (listing?.is_claimed) {
      const { data: strandedRows } = await sb
        .from('listing_claims')
        .select('id, claimant_email, tier, status, stripe_subscription_id')
        .eq('listing_id', targetListingId)
        .eq('status', 'inactive')
        .order('updated_at', { ascending: false })
        .limit(1)
      live = strandedRows?.[0]
      resuming = !!live
    }
  }

  if (!live) {
    return NextResponse.json({ error: 'This listing has no live claim to revoke.' }, { status: 409 })
  }
  if (live.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'This claim is billed through Stripe. Cancel the subscription in Stripe first — the webhook will downgrade it — then revoke if still needed.' },
      { status: 409 }
    )
  }

  // 1. Ownership row goes inactive FIRST (see the trigger note above).
  //    Skipped when resuming — it is already inactive.
  if (!resuming) {
    const { error: deactivateErr } = await sb
      .from('listing_claims')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', live.id)
    if (deactivateErr) {
      console.error('[admin/claims] revoke: deactivate failed:', deactivateErr.message)
      return NextResponse.json({ error: 'Could not deactivate the claim' }, { status: 500 })
    }
  }

  // 2. Only now will the display flag actually clear. updateListing carries it
  //    outbound to the vertical, which is where the claimed badge is rendered.
  const { updateListing } = await import('@/lib/admin/updateListing')
  const upd = await updateListing(targetListingId, { is_claimed: false }, { action: 'claim-revoke' })
  if (!upd.success) {
    // Ownership is gone but the flag is stale. Re-running this action resumes
    // from exactly here (see the resume branch above), so the advice is real.
    console.error('[admin/claims] revoke: is_claimed clear failed:', upd.error)
    return NextResponse.json(
      { error: `Ownership was removed, but clearing the claimed flag failed: ${upd.error}. Run Revoke again to finish.` },
      { status: 500 }
    )
  }

  // 3. The moderation row should not still read 'approved' for ownership that
  //    no longer exists — claim-integrity reads that as a failed grant.
  if (claimId) {
    const { data: prior } = await sb
      .from('claims_review')
      .select('admin_notes')
      .eq('id', claimId)
      .maybeSingle()
    await sb
      .from('claims_review')
      .update({
        status: 'rejected',
        admin_notes: mergeAdminNotes(prior?.admin_notes, admin_notes, 'on revocation'),
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)
      .then(null, err => console.error('[admin/claims] revoke: claims_review update failed:', err.message))
  }

  await sb.from('claim_audit_log').insert({
    claim_id: claimId || null,
    action: 'revoked',
    actor: 'admin',
    details: {
      listing_id: targetListingId,
      listing_claim_id: live.id,
      previous_email: live.claimant_email,
      previous_tier: live.tier,
      admin_notes: admin_notes || null,
    },
  }).then(null, err => console.error('[admin/claims] Audit log error:', err))

  return NextResponse.json({
    success: true,
    action: 'revoked',
    listingId: targetListingId,
    previousOwner: live.claimant_email,
  })
}
