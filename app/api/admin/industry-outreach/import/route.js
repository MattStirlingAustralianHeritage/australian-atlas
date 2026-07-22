import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 800
const KINDS = new Set(['org', 'contact'])
const ORG_TYPES = new Set(['peak_body', 'association', 'tourism_org', 'government', 'education', 'other'])

function normFocus(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[;,]/) : [])
  const out = []
  for (const f of list) {
    const v = String(f).trim().toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

// Identity key mirrors the DB unique index: (org, contact, email).
const keyOf = (org, contact, email) =>
  `${(org || '').toLowerCase()}|${(contact || '').toLowerCase()}|${(email || '').toLowerCase()}`

/**
 * POST /api/admin/industry-outreach/import
 * Bulk-import industry contacts into the directory (CSV parsed client-side).
 *
 * Body: { rows: [{ org_name, contact_name?, role_title?, org_type?, focus?,
 *          state?, website?, contact_email?, linkedin?, region_slug?, region_name?, kind? }] }
 * Dedup: (org, contact, email) against existing rows and within the payload.
 * Existing rows are never modified — import only adds.
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : []
  if (rows.length === 0) {
    return NextResponse.json({ error: 'rows required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Existing dedup keys. The directory stays small (hundreds), one page is fine.
  const { data: existingRows, error: exErr } = await sb
    .from('industry_outreach')
    .select('org_name, contact_name, contact_email')
    .limit(5000)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const seen = new Set((existingRows || []).map((r) => keyOf(r.org_name, r.contact_name, r.contact_email)))

  // Region lookup maps (slug and lower-cased name).
  const { data: regions } = await sb.from('regions').select('id, name, slug')
  const bySlug = new Map((regions || []).map((r) => [r.slug, r]))
  const byName = new Map((regions || []).map((r) => [r.name.toLowerCase(), r]))

  const now = new Date().toISOString()
  const toInsert = []
  let skippedDuplicate = 0
  let skippedInvalid = 0

  for (const raw of rows) {
    const org = (raw.org_name || '').trim()
    if (!org) { skippedInvalid++; continue }
    const contact = (raw.contact_name || '').trim() || null
    const email = (raw.contact_email || '').trim().toLowerCase() || null
    const key = keyOf(org, contact, email)
    if (seen.has(key)) { skippedDuplicate++; continue }
    seen.add(key)

    const region = (raw.region_slug && bySlug.get(String(raw.region_slug).trim()))
      || (raw.region_name && byName.get(String(raw.region_name).trim().toLowerCase()))
      || null
    const kind = KINDS.has(raw.kind) ? raw.kind : (contact ? 'contact' : 'org')

    toInsert.push({
      kind,
      org_name: org,
      contact_name: contact,
      role_title: (raw.role_title || '').trim() || null,
      org_type: ORG_TYPES.has(raw.org_type) ? raw.org_type : null,
      focus: normFocus(raw.focus),
      state: (raw.state || '').trim().toUpperCase() || null,
      region_id: region?.id || null,
      region_name: region?.name || (raw.region_name ? String(raw.region_name).trim() : null),
      website: (raw.website || '').trim() || null,
      contact_email: email,
      linkedin: (raw.linkedin || '').trim() || null,
      email_source: email ? 'import' : null,
      status: 'not_contacted',
      created_at: now,
      updated_at: now,
    })
  }

  let inserted = 0
  if (toInsert.length) {
    const { error: insErr } = await sb.from('industry_outreach').insert(toInsert)
    if (insErr) {
      console.error('[industry-outreach/import] insert error:', insErr.message)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    inserted = toInsert.length
  }

  return NextResponse.json({
    ok: true,
    received: rows.length,
    inserted,
    skippedDuplicate,
    skippedInvalid,
    unmatchedRegion: toInsert.filter((r) => r.state && !r.region_id).length,
  })
}
