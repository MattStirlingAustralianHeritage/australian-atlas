import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['desk', 'journalist'])

// Normalise a beat field into a text[] — accepts an array or a comma/semicolon
// separated string, lower-cased and de-duped.
function normBeat(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[;,]/) : [])
  const out = []
  for (const b of list) {
    const v = String(b).trim().toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

// Resolve an optional region reference (slug preferred, name fallback) to a
// regions row. Returns { region_id, region_name } — both null when no match,
// keeping the free-text name if one was given so the row still displays.
async function resolveRegion(sb, { region_slug, region_name }) {
  if (region_slug) {
    const { data } = await sb.from('regions').select('id, name').eq('slug', String(region_slug).trim()).maybeSingle()
    if (data) return { region_id: data.id, region_name: data.name }
  }
  if (region_name) {
    const { data } = await sb.from('regions').select('id, name').ilike('name', String(region_name).trim()).maybeSingle()
    if (data) return { region_id: data.id, region_name: data.name }
    return { region_id: null, region_name: String(region_name).trim() }
  }
  return { region_id: null, region_name: null }
}

/**
 * POST /api/admin/press-outreach
 * Add one press contact (desk or journalist) to the outreach directory.
 * Body: { kind?, outlet_name, journalist_name?, role_title?, beat?, state?,
 *         website?, contact_email?, twitter?, region_slug?, region_name?, notes? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const outlet = (body.outlet_name || '').trim()
  if (!outlet) {
    return NextResponse.json({ error: 'outlet_name is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const kind = KINDS.has(body.kind) ? body.kind : (body.journalist_name ? 'journalist' : 'desk')
  const journalist = (body.journalist_name || '').trim() || null
  const email = (body.contact_email || '').trim().toLowerCase() || null

  // Dedup on the identity triple (outlet, journalist, email) — the unique index
  // is on expressions, so check first for a clean 409 instead of a raw error.
  const { data: existing } = await sb
    .from('press_outreach')
    .select('id, outlet_name, journalist_name, contact_email')
    .ilike('outlet_name', outlet)
  const dup = (existing || []).some((r) =>
    (r.journalist_name || '').toLowerCase() === (journalist || '').toLowerCase() &&
    (r.contact_email || '').toLowerCase() === (email || ''))
  if (dup) {
    return NextResponse.json({ error: 'That contact is already in the directory' }, { status: 409 })
  }

  const { region_id, region_name } = await resolveRegion(sb, body)
  const now = new Date().toISOString()

  const { data, error } = await sb
    .from('press_outreach')
    .insert({
      kind,
      outlet_name: outlet,
      journalist_name: journalist,
      role_title: (body.role_title || '').trim() || null,
      beat: normBeat(body.beat),
      state: (body.state || '').trim().toUpperCase() || null,
      region_id,
      region_name,
      website: (body.website || '').trim() || null,
      contact_email: email,
      twitter: (body.twitter || '').trim() || null,
      email_source: email ? 'manual' : null,
      notes: (body.notes || '').trim() || null,
      status: 'not_contacted',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That contact is already in the directory' }, { status: 409 })
    }
    console.error('[press-outreach POST] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, press: data })
}

/**
 * PATCH /api/admin/press-outreach
 * Update a directory row.
 * Body: { id, status?, notes?, contact_email?, journalist_name?, role_title?,
 *         beat?, state?, website?, twitter?, kind?, region_slug? }
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const updates = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) updates.status = body.status
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.journalist_name !== undefined) updates.journalist_name = (body.journalist_name || '').trim() || null
  if (body.role_title !== undefined) updates.role_title = (body.role_title || '').trim() || null
  if (body.beat !== undefined) updates.beat = normBeat(body.beat)
  if (body.state !== undefined) updates.state = (body.state || '').trim().toUpperCase() || null
  if (body.website !== undefined) updates.website = (body.website || '').trim() || null
  if (body.twitter !== undefined) updates.twitter = (body.twitter || '').trim() || null
  if (KINDS.has(body.kind)) updates.kind = body.kind
  if (body.contact_email !== undefined) {
    updates.contact_email = (body.contact_email || '').trim().toLowerCase() || null
    if (updates.contact_email) updates.email_source = 'manual'
  }
  if (body.region_slug !== undefined) {
    const { region_id, region_name } = await resolveRegion(sb, body)
    updates.region_id = region_id
    if (region_name) updates.region_name = region_name
  }
  if (body.status === 'contacted') updates.last_contacted_at = new Date().toISOString()

  const { data, error } = await sb
    .from('press_outreach')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[press-outreach PATCH] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, press: data })
}
