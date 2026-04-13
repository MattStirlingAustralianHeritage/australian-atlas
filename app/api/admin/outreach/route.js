import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/admin/outreach
 * Create an outreach record for a listing.
 * Body: { listing_id, contact_email?, notes?, status? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { listing_id, contact_email, notes, status } = body

  if (!listing_id) {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Check if outreach record already exists for this listing
  const { data: existing } = await sb
    .from('operator_outreach')
    .select('id')
    .eq('listing_id', listing_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Outreach record already exists for this listing' }, { status: 409 })
  }

  const record = {
    listing_id,
    contact_email: contact_email || null,
    notes: notes || null,
    status: status || 'contacted',
    last_contacted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await sb
    .from('operator_outreach')
    .insert(record)
    .select()
    .single()

  if (error) {
    console.error('[outreach POST] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, outreach: data })
}

/**
 * PATCH /api/admin/outreach
 * Update an outreach record.
 * Body: { id, status?, notes?, contact_email? }
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, status, notes, contact_email } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const updates = { updated_at: new Date().toISOString() }
  if (status !== undefined) updates.status = status
  if (notes !== undefined) updates.notes = notes
  if (contact_email !== undefined) updates.contact_email = contact_email
  if (status === 'contacted') updates.last_contacted_at = new Date().toISOString()

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('operator_outreach')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[outreach PATCH] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, outreach: data })
}
