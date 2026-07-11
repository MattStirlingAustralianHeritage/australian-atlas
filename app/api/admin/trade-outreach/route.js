import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

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
 * POST /api/admin/trade-outreach
 * Add one company to the trade outreach directory.
 * Body: { company_name, org_type?, state?, website?, contact_email?, contact_name?, contact_role?, region_slug?, region_name?, focus?, notes? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const name = (body.company_name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const state = (body.state || '').trim().toUpperCase() || null

  // Dedup on (name, state) — the unique index is on expressions, so check first
  // for a clean 409 instead of a raw constraint error.
  const { data: existing } = await sb
    .from('trade_outreach')
    .select('id, company_name, state')
    .ilike('company_name', name)
  if ((existing || []).some((r) => (r.state || '') === (state || ''))) {
    return NextResponse.json({ error: 'That company is already in the directory' }, { status: 409 })
  }

  const { region_id, region_name } = await resolveRegion(sb, body)
  const now = new Date().toISOString()
  const email = (body.contact_email || '').trim().toLowerCase() || null

  const { data, error } = await sb
    .from('trade_outreach')
    .insert({
      company_name: name,
      org_type: (body.org_type || '').trim() || null,
      state,
      website: (body.website || '').trim() || null,
      region_id,
      region_name,
      focus: (body.focus || '').trim() || null,
      contact_name: (body.contact_name || '').trim() || null,
      contact_role: (body.contact_role || '').trim() || null,
      contact_email: email,
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
      return NextResponse.json({ error: 'That company is already in the directory' }, { status: 409 })
    }
    console.error('[trade-outreach POST] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, company: data })
}

/**
 * PATCH /api/admin/trade-outreach
 * Update a directory row.
 * Body: { id, status?, notes?, org_type?, focus?, contact_email?, contact_name?, contact_role?, website?, region_slug? }
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
  if (body.org_type !== undefined) updates.org_type = body.org_type || null
  if (body.focus !== undefined) updates.focus = body.focus || null
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name || null
  if (body.contact_role !== undefined) updates.contact_role = body.contact_role || null
  if (body.website !== undefined) updates.website = body.website || null
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
    .from('trade_outreach')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[trade-outreach PATCH] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, company: data })
}
