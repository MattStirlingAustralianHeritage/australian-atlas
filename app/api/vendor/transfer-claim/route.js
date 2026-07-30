// app/api/vendor/transfer-claim/route.js
// Ownership transfer: moves an approved claim to a new claimant.
// Sets existing claim to 'transfer_pending', RELEASES the old ownership row,
// and creates a new pending claim for the incoming claimant to be approved
// through the normal gate. Admin-only (admin cookie) or internal (x-api-secret).
//
// Releasing the old ownership row is the step that makes a transfer possible at
// all. Without it this route only rewrote claims_review: the previous owner kept
// their live listing_claims row (and the dashboard), and approving the new
// claimant then threw "already has a live claim owned by a different user" —
// every transfer was un-completable, and nothing anywhere read
// 'transfer_pending'. The release order matters for the same reason it does in
// the revoke handler: migration 256 coerces listings.is_claimed back to true
// while a live claim exists, so the claim row goes inactive first.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { secureEquals } from '@/lib/secure-compare'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'

export async function POST(request) {
  // ── Auth: admin cookie or shared secret ────────────────────
  const secret = request.headers.get('x-api-secret')
  const expected = process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET
  let isAdmin = false

  if (secureEquals(secret, expected)) {
    isAdmin = true
  } else {
    const cookieStore = await cookies()
    isAdmin = await checkAdmin(cookieStore)
  }

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { claimId, newEmail, newName, reason } = await request.json()

    if (!claimId || !newEmail?.trim()) {
      return NextResponse.json(
        { error: 'claimId and newEmail are required' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // ── Fetch the existing approved claim ────────────────────
    const { data: existingClaim, error: fetchError } = await sb
      .from('claims_review')
      .select('id, listing_id, vertical, claimant_name, claimant_email, tier, status, admin_notes, reviewed_at')
      .eq('id', claimId)
      .eq('status', 'approved')
      .single()

    if (fetchError || !existingClaim) {
      return NextResponse.json(
        { error: 'Approved claim not found' },
        { status: 404 }
      )
    }

    // ── Refuse a transfer we cannot complete ─────────────────
    // A Stripe-billed claim must be cancelled in Stripe first, or the previous
    // owner keeps being charged for a listing that is no longer theirs.
    const { data: liveRows } = await sb
      .from('listing_claims')
      .select('id, claimant_email, stripe_subscription_id')
      .eq('listing_id', existingClaim.listing_id)
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
    const liveClaim = liveRows?.[0] || null
    if (liveClaim?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'The current owner has an active Stripe subscription. Cancel it in Stripe first, then transfer.' },
        { status: 409 }
      )
    }

    // ── Set existing claim to transfer_pending ───────────────
    const { error: updateError } = await sb
      .from('claims_review')
      .update({
        status: 'transfer_pending',
        admin_notes: `${existingClaim.admin_notes || ''}\n[TRANSFER] Initiated to ${newEmail.trim()}. Reason: ${reason || 'not provided'}`.trim(),
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claimId)

    if (updateError) {
      console.error('[transfer-claim] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update existing claim' }, { status: 500 })
    }

    // ── Release the outgoing owner's ownership row ───────────
    // Claim row inactive FIRST, then the display flag (migration 256 trigger).
    if (liveClaim) {
      const { error: releaseError } = await sb
        .from('listing_claims')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', liveClaim.id)
      if (releaseError) {
        console.error('[transfer-claim] Release error:', releaseError)
        await sb.from('claims_review')
          .update({ status: 'approved', reviewed_at: existingClaim.reviewed_at })
          .eq('id', claimId)
        return NextResponse.json({ error: 'Failed to release the current ownership' }, { status: 500 })
      }
      try {
        const { updateListing } = await import('@/lib/admin/updateListing')
        await updateListing(existingClaim.listing_id, { is_claimed: false }, { action: 'claim-transfer' })
      } catch (e) {
        // Ownership is already released; the flag is stale but recoverable, and
        // approving the incoming claim re-stamps it anyway.
        console.error('[transfer-claim] is_claimed clear failed (ownership released):', e.message)
      }
    }

    // ── Create new pending claim for the new claimant ────────
    const { data: newClaim, error: insertError } = await sb
      .from('claims_review')
      .insert({
        listing_id: existingClaim.listing_id,
        vertical: existingClaim.vertical,
        claimant_name: newName?.trim() || newEmail.trim(),
        claimant_email: newEmail.trim(),
        tier: existingClaim.tier,
        status: 'pending',
        admin_notes: `[TRANSFER] From previous claimant ${existingClaim.claimant_email}. Previous claim: ${claimId}`,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[transfer-claim] Insert error:', insertError)
      // Rollback the status change
      await sb.from('claims_review').update({ status: 'approved', reviewed_at: existingClaim.reviewed_at }).eq('id', claimId)
      return NextResponse.json({ error: 'Failed to create transfer claim' }, { status: 500 })
    }

    // ── Audit log ────────────────────────────────────────────
    await sb.from('claim_audit_log').insert({
      claim_id: claimId,
      action: 'transferred',
      actor: 'admin',
      details: {
        new_claim_id: newClaim?.id,
        new_email: newEmail.trim(),
        previous_email: existingClaim.claimant_email,
        reason: reason || null,
      },
    }).then(null, err => console.error('[transfer-claim] Audit log error:', err))

    return NextResponse.json({
      success: true,
      previousClaimId: claimId,
      newClaimId: newClaim?.id,
      message: `Transfer initiated. New claim created for ${newEmail.trim()}.`,
    })
  } catch (err) {
    console.error('[transfer-claim] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
