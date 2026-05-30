import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import {
  MAX_PICKS,
  listOutgoing,
  listIncoming,
  createPick,
  deletePick,
  hydrateListings,
} from '@/lib/picks/producerPicks'
import { revalidatePlacePages } from '@/lib/picks/revalidate'

// Resolve the listings owned by the signed-in user via the canonical
// ownership table (listing_claims: claimed_by + status='active'). This is the
// authoritative owner link — listings.is_claimed alone has no owner attribution.
async function getMyListingIds(admin, userId) {
  const { data } = await admin
    .from('listing_claims')
    .select('listing_id')
    .eq('claimed_by', userId)
    .eq('status', 'active')
  return [...new Set((data || []).map(c => c.listing_id).filter(Boolean))]
}

async function requireUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// GET — the signed-in operator's outgoing picks, incoming picks, and the set
// of listings they own (so the UI can pick which one is doing the vouching).
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)

  if (!myIds.length) {
    return NextResponse.json({ outgoing: [], incoming: [], myListings: [], maxPicks: MAX_PICKS })
  }

  const [outgoing, incoming, listingMap] = await Promise.all([
    listOutgoing(admin, myIds),
    listIncoming(admin, myIds),
    hydrateListings(admin, myIds),
  ])

  const myListings = myIds
    .map(id => listingMap[id])
    .filter(Boolean)
    .map(l => ({
      id: l.id,
      name: l.name,
      vertical: l.vertical,
      slug: l.slug,
      pickCount: outgoing.filter(p => p.curatorId === l.id).length,
    }))

  return NextResponse.json({ outgoing, incoming, myListings, maxPicks: MAX_PICKS })
}

// POST — create a pick. Body: { curatorListingId, pickedListingId, note? }.
// The curator listing must be owned by the signed-in user.
export async function POST(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { curatorListingId, pickedListingId, note } = body || {}

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)
  if (!myIds.includes(curatorListingId)) {
    return NextResponse.json({ error: 'You can only add picks for a listing you own' }, { status: 403 })
  }

  const result = await createPick(admin, {
    curatorId: curatorListingId,
    pickedId: pickedListingId,
    note,
    source: 'operator',
    createdBy: 'operator',
  })

  if (!result.ok) {
    const status = result.code === 'cap' ? 409 : result.code === 'duplicate' ? 409 : 400
    return NextResponse.json({ error: result.error, code: result.code }, { status })
  }
  await revalidatePlacePages(admin, [curatorListingId, pickedListingId])
  return NextResponse.json({ pick: result.pick })
}

// DELETE — remove one of the operator's own picks. Body: { id } or ?id=.
export async function DELETE(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  let id = searchParams.get('id')
  if (!id) {
    try { id = (await request.json())?.id } catch { /* no body */ }
  }
  if (!id) return NextResponse.json({ error: 'Missing pick id' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const myIds = await getMyListingIds(admin, user.id)

  // Confirm the pick was made by one of the user's listings before deleting.
  const { data: rel } = await admin
    .from('listing_relationships')
    .select('id, listing_id_a, listing_id_b')
    .eq('id', id)
    .maybeSingle()
  if (!rel || !myIds.includes(rel.listing_id_a)) {
    return NextResponse.json({ error: 'Pick not found' }, { status: 404 })
  }

  const result = await deletePick(admin, { id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  await revalidatePlacePages(admin, [rel.listing_id_a, rel.listing_id_b])
  return NextResponse.json({ success: true, deletedId: id })
}
