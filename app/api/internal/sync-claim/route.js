// app/api/internal/sync-claim/route.js
// Internal endpoint for verticals to sync claims to Atlas claims_review.
// Called after a vertical creates a local claim record.
// Auth: x-api-secret header

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST(request) {
  const secret = request.headers.get('x-api-secret')
  if (!secret || secret !== process.env.SHARED_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const {
      vertical,
      source_id,
      source_claim_id,
      venue_name,
      contact_name,
      contact_email,
      tier,
    } = await request.json()

    if (!vertical || !source_id || !contact_name || !contact_email) {
      return NextResponse.json(
        { error: 'Missing required fields: vertical, source_id, contact_name, contact_email' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // Look up the Atlas master listing by vertical + source_id
    const { data: listing } = await sb
      .from('listings')
      .select('id, name, vertical')
      .eq('vertical', vertical)
      .eq('source_id', source_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!listing) {
      // Not fatal — listing may not be synced to Atlas yet
      return NextResponse.json({ synced: false, reason: 'listing_not_found' })
    }

    // Check for existing pending claim on this listing
    const { data: existing } = await sb
      .from('claims_review')
      .select('id')
      .eq('listing_id', listing.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ synced: true, claimReviewId: existing.id, message: 'Existing pending claim found' })
    }

    // Create claims_review entry
    const { data: claim, error } = await sb
      .from('claims_review')
      .insert({
        listing_id: listing.id,
        vertical: vertical,
        claimant_name: contact_name.trim(),
        claimant_email: contact_email.trim().toLowerCase(),
        tier: ['free', 'standard'].includes(tier) ? tier : 'free',
        status: 'pending',
        source_claim_id: source_claim_id || null,
        admin_notes: `Synced from ${vertical} vertical.`,
      })
      .select('id')
      .single()

    if (error) {
      // Duplicate constraint — claim already exists
      if (error.code === '23505') {
        return NextResponse.json({ synced: true, message: 'Claim already exists (constraint)' })
      }
      throw error
    }

    // Audit log (non-blocking)
    sb.from('claim_audit_log').insert({
      claim_id: claim.id,
      action: 'created',
      actor: `${vertical}_sync`,
      details: {
        source_claim_id: source_claim_id || null,
        listing_id: listing.id,
        vertical,
        tier: tier || 'free',
      },
    }).then(null, err => console.error('[sync-claim] Audit log error:', err))

    return NextResponse.json({ synced: true, claimReviewId: claim.id })
  } catch (err) {
    console.error('[sync-claim] Error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
