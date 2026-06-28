import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * Operator story pitches — "apply to have a story written about us".
 *
 * POST /api/dashboard/editorial/pitch
 *   Body: { listing_id?, angle, contact_email? }
 *   A signed-in operator pitches a story about a listing they own. The pitch
 *   lands in the admin "Listing Pitches" queue (/admin/listing-pitches). Auth
 *   is the operator Supabase session cookie (same as Producer Picks / Recommend).
 *
 * GET /api/dashboard/editorial/pitch
 *   Returns this operator's own submitted pitches (id, listing, angle, status),
 *   so the dashboard can show them their pitch history and its progress.
 */

async function requireUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Listings this operator owns (canonical source = listing_claims). Returns
// [{ id, name, vertical }]. Used both to validate the pitch target and to
// default to their only listing when they don't pass one.
async function getOwnedListings(admin, userId) {
  const { data: claims } = await admin
    .from('listing_claims')
    .select('listing_id')
    .eq('claimed_by', userId)
    .eq('status', 'active')
  const ids = [...new Set((claims || []).map(c => c.listing_id).filter(Boolean))]
  if (!ids.length) return []
  const { data } = await admin
    .from('listings')
    .select('id, name, vertical')
    .in('id', ids)
  return data || []
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('listing_story_pitches')
    .select('id, listing_id, listing_name, vertical, angle, status, created_at')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[dashboard/editorial/pitch GET] Query failed:', error.message)
    return NextResponse.json({ pitches: [] })
  }
  return NextResponse.json({ pitches: data || [] })
}

export async function POST(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))

    const angle = (body.angle || '').trim()
    const listingId = (body.listing_id || '').trim()
    const contactEmail = (body.contact_email || '').trim() || user.email || null

    if (angle.length < 20) {
      return NextResponse.json({ error: 'Tell us a little more — a sentence or two about the story you have in mind.' }, { status: 400 })
    }
    if (angle.length > 1500) {
      return NextResponse.json({ error: 'That’s a touch long — keep your pitch under 1500 characters.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const owned = await getOwnedListings(admin, user.id)
    if (!owned.length) {
      return NextResponse.json({ error: 'We couldn’t find a listing on your account to pitch for.' }, { status: 400 })
    }

    // Default to their only listing; otherwise the chosen listing_id must be
    // one they actually own (authz — never let an operator pitch for a venue
    // that isn't theirs).
    const target = owned.length === 1 ? owned[0] : owned.find(l => String(l.id) === listingId)
    if (!target) {
      return NextResponse.json({ error: 'Please choose which listing this story is about.' }, { status: 400 })
    }

    // One open pitch per listing at a time — don't let a venue flood the queue.
    const { data: openExisting } = await admin
      .from('listing_story_pitches')
      .select('id')
      .eq('listing_id', target.id)
      .in('status', ['new', 'reviewing', 'accepted'])
      .limit(1)
      .maybeSingle()
    if (openExisting) {
      return NextResponse.json({
        status: 'exists',
        message: 'You’ve already got a story pitch in for this listing — our editors are on it.',
      })
    }

    const row = {
      listing_id: target.id,
      listing_name: target.name || null,
      vertical: target.vertical || null,
      submitted_by: user.id,
      submitted_by_email: user.email || null,
      contact_email: contactEmail,
      angle,
      status: 'new',
    }

    const { data, error } = await admin
      .from('listing_story_pitches')
      .insert(row)
      .select('id, listing_id, listing_name, vertical, angle, status, created_at')
      .single()

    if (error) {
      console.error('[dashboard/editorial/pitch POST] Insert failed:', error.message)
      return NextResponse.json({ error: 'Something went wrong saving your pitch. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      status: 'queued',
      message: 'Thanks — your story pitch is with our editors. We’ll be in touch.',
      pitch: data,
    })
  } catch (err) {
    console.error('[dashboard/editorial/pitch POST] Error:', err.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
