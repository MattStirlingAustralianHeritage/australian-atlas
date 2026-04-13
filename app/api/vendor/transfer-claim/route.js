// app/api/vendor/transfer-claim/route.js
// Ownership transfer: moves an approved claim to a new claimant.
// Sets existing claim to 'transfer_pending', creates a new pending claim.
// Admin-only (via admin cookie) or internal (via x-api-secret).

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

export async function POST(request) {
  // ── Auth: admin cookie or shared secret ────────────────────
  const secret = request.headers.get('x-api-secret')
  const expected = process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET
  let isAdmin = false

  if (secret && secret === expected) {
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
