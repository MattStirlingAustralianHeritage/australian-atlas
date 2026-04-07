import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST(request) {
  try {
    const body = await request.json()
    const { listingId, slug, name, email, role, tier, websiteDomain } = body

    // ── Validate required fields ──────────────────────────────
    if (!listingId || !name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'Name, email, and listing ID are required.' },
        { status: 400 }
      )
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // ── Verify listing exists and is active ───────────────────
    const { data: listing, error: listingError } = await sb
      .from('listings')
      .select('id, vertical, is_claimed')
      .eq('id', listingId)
      .eq('status', 'active')
      .single()

    if (listingError || !listing) {
      return NextResponse.json(
        { error: 'Listing not found or is not active.' },
        { status: 404 }
      )
    }

    if (listing.is_claimed) {
      return NextResponse.json(
        { error: 'This listing has already been claimed.' },
        { status: 409 }
      )
    }

    // ── Check for duplicate pending claim ─────────────────────
    const { data: existing } = await sb
      .from('claims_review')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimant_email', email.trim())
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'You already have a pending claim for this listing.' },
        { status: 409 }
      )
    }

    // ── Insert claim ──────────────────────────────────────────
    const { error: insertError } = await sb
      .from('claims_review')
      .insert({
        listing_id: listingId,
        vertical: listing.vertical,
        claimant_name: name.trim(),
        claimant_email: email.trim(),
        tier: ['free', 'standard'].includes(tier) ? tier : 'free',
        status: 'pending',
        admin_notes: `Role: ${role || 'not specified'}. Tier: ${tier || 'free'}. Domain: ${websiteDomain?.trim() || 'not provided'}`,
      })

    if (insertError) {
      console.error('[claim] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit claim. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[claim] Unexpected error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
