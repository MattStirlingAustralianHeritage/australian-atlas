import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['org', 'contact'])
const ORG_TYPES = new Set(['peak_body', 'association', 'tourism_org', 'government', 'education', 'other'])

// Normalise a focus field into a text[] — accepts an array or a comma/semicolon
// separated string, lower-cased and de-duped.
function normFocus(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[;,]/) : [])
  const out = []
  for (const f of list) {
    const v = String(f).trim().toLowerCase()
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
 * POST /api/admin/industry-outreach
 * Add one industry contact (org or named person) to the outreach directory.
 * Body: { kind?, org_name, contact_name?, role_title?, org_type?, focus?,
 *         state?, website?, contact_email?, linkedin?, region_slug?, region_name?, notes? }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const orgName = (body.org_name || '').trim()
  if (!orgName) {
    return NextResponse.json({ error: 'org_name is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const kind = KINDS.has(body.kind) ? body.kind : (body.contact_name ? 'contact' : 'org')
  const contact = (body.contact_name || '').trim() || null
  const email = (body.contact_email || '').trim().toLowerCase() || null

  // Dedup on the identity triple (org, contact, email) — the unique index is
  // on expressions, so check first for a clean 409 instead of a raw error.
  const { data: existing } = await sb
    .from('industry_outreach')
    .select('id, org_name, contact_name, contact_email')
    .ilike('org_name', orgName)
  const dup = (existing || []).some((r) =>
    (r.contact_name || '').toLowerCase() === (contact || '').toLowerCase() &&
    (r.contact_email || '').toLowerCase() === (email || ''))
  if (dup) {
    return NextResponse.json({ error: 'That contact is already in the directory' }, { status: 409 })
  }

  const { region_id, region_name } = await resolveRegion(sb, body)
  const now = new Date().toISOString()

  const { data, error } = await sb
    .from('industry_outreach')
    .insert({
      kind,
      org_name: orgName,
      contact_name: contact,
      role_title: (body.role_title || '').trim() || null,
      org_type: ORG_TYPES.has(body.org_type) ? body.org_type : null,
      focus: normFocus(body.focus),
      state: (body.state || '').trim().toUpperCase() || null,
      region_id,
      region_name,
      website: (body.website || '').trim() || null,
      contact_email: email,
      linkedin: (body.linkedin || '').trim() || null,
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
    console.error('[industry-outreach POST] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, org: data })
}

/**
 * PATCH /api/admin/industry-outreach
 * Update a directory row.
 * Body: { id, status?, notes?, contact_email?, contact_name?, role_title?,
 *         org_type?, focus?, state?, website?, linkedin?, kind?, region_slug? }
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
  if (body.contact_name !== undefined) updates.contact_name = (body.contact_name || '').trim() || null
  if (body.role_title !== undefined) updates.role_title = (body.role_title || '').trim() || null
  if (body.org_type !== undefined) updates.org_type = ORG_TYPES.has(body.org_type) ? body.org_type : null
  if (body.focus !== undefined) updates.focus = normFocus(body.focus)
  if (body.state !== undefined) updates.state = (body.state || '').trim().toUpperCase() || null
  if (body.website !== undefined) updates.website = (body.website || '').trim() || null
  if (body.linkedin !== undefined) updates.linkedin = (body.linkedin || '').trim() || null
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
    .from('industry_outreach')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[industry-outreach PATCH] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, org: data })
}
