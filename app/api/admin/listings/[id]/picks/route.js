import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { MAX_PICKS, listIncoming, listOutgoing, createPick, deletePick } from '@/lib/picks/producerPicks'
import { revalidatePlacePages } from '@/lib/picks/revalidate'

// GET — producer picks involving this listing.
//   receivedFrom (incoming): venues that have picked THIS listing ("picked by")
//   given (outgoing): venues THIS listing has picked
export async function GET(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const [receivedFrom, given] = await Promise.all([
    listIncoming(sb, [id]),
    listOutgoing(sb, [id]),
  ])
  return NextResponse.json({ receivedFrom, given, maxPicks: MAX_PICKS })
}

// POST — record that this listing was PICKED BY another venue.
// Body: { pickerListingId, note? }. The picker is the curator; this listing
// is the picked venue. Enforces the picker's per-curator cap.
export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing listing ID' }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const { pickerListingId, note } = body || {}
  if (!pickerListingId) return NextResponse.json({ error: 'Select the venue that picked this listing' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const result = await createPick(sb, {
    curatorId: pickerListingId,
    pickedId: id,
    note,
    source: 'manual',
    createdBy: 'admin',
  })

  if (!result.ok) {
    const status = result.code === 'cap' || result.code === 'duplicate' ? 409 : 400
    return NextResponse.json({ error: result.error, code: result.code }, { status })
  }
  await revalidatePlacePages(sb, [pickerListingId, id])
  return NextResponse.json({ pick: result.pick })
}

// DELETE — remove a producer-pick relationship by its id. Body: { relId } or ?relId=.
export async function DELETE(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { searchParams } = new URL(request.url)
  let relId = searchParams.get('relId')
  if (!relId) {
    try { relId = (await request.json())?.relId } catch { /* no body */ }
  }
  if (!relId) return NextResponse.json({ error: 'Missing relationship id' }, { status: 400 })

  const sb = getSupabaseAdmin()
  // Capture both sides before deletion so we can revalidate both place pages.
  const { data: rel } = await sb
    .from('listing_relationships')
    .select('listing_id_a, listing_id_b')
    .eq('id', relId)
    .maybeSingle()

  const result = await deletePick(sb, { id: relId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code === 'not_found' ? 404 : 400 })
  }
  await revalidatePlacePages(sb, [rel?.listing_id_a, rel?.listing_id_b])
  return NextResponse.json({ success: true, deletedId: relId })
}
