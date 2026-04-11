// app/api/internal/claim-check/route.js
// Cross-system duplicate claim guard.
// Called by vertical APIs before inserting a claim, to check
// if a pending/approved claim already exists on the master DB.
//
// Auth: requires x-api-secret header matching SHARED_API_SECRET.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const secret = request.headers.get('x-api-secret')
  const expected = process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Params ──────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  const vertical = searchParams.get('vertical')
  const sourceId = searchParams.get('source_id')
  const email = searchParams.get('email')

  if (!listingId && !(vertical && sourceId)) {
    return NextResponse.json(
      { error: 'Provide listing_id, or vertical + source_id' },
      { status: 400 }
    )
  }

  const sb = getSupabaseAdmin()

  try {
    let query = sb
      .from('claims_review')
      .select('id, status, claimant_email, created_at')
      .in('status', ['pending', 'approved'])

    if (listingId) {
      query = query.eq('listing_id', listingId)
    } else {
      // Look up listing by vertical + source_id first
      const { data: listing } = await sb
        .from('listings')
        .select('id')
        .eq('vertical', vertical)
        .eq('source_id', sourceId)
        .maybeSingle()

      if (!listing) {
        return NextResponse.json({ exists: false, claim: null })
      }

      query = query.eq('listing_id', listing.id)
    }

    // Optionally narrow to a specific email
    if (email) {
      query = query.eq('claimant_email', email)
    }

    const { data: claims, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error

    if (claims?.length) {
      return NextResponse.json({
        exists: true,
        claim: {
          id: claims[0].id,
          status: claims[0].status,
          claimant_email: claims[0].claimant_email,
          created_at: claims[0].created_at,
        },
      })
    }

    return NextResponse.json({ exists: false, claim: null })
  } catch (err) {
    console.error('[claim-check] Error:', err.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
