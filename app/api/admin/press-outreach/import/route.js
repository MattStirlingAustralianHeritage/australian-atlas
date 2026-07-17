import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 800
const KINDS = new Set(['desk', 'journalist'])

function normBeat(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[;,]/) : [])
  const out = []
  for (const b of list) {
    const v = String(b).trim().toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

// Identity key mirrors the DB unique index: (outlet, journalist, email).
const keyOf = (outlet, journalist, email) =>
  `${(outlet || '').toLowerCase()}|${(journalist || '').toLowerCase()}|${(email || '').toLowerCase()}`

/**
 * POST /api/admin/press-outreach/import
 * Bulk-import press contacts into the directory (CSV parsed client-side).
 *
 * Body: { rows: [{ outlet_name, journalist_name?, role_title?, beat?, state?,
 *          website?, contact_email?, twitter?, region_slug?, region_name?, kind? }] }
 * Dedup: (outlet, journalist, email) against existing rows and within the
 * payload. Existing rows are never modified — import only adds.
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
    .from('press_outreach')
    .select('outlet_name, journalist_name, contact_email')
    .limit(5000)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const seen = new Set((existingRows || []).map((r) => keyOf(r.outlet_name, r.journalist_name, r.contact_email)))

  // Region lookup maps (slug and lower-cased name).
  const { data: regions } = await sb.from('regions').select('id, name, slug')
  const bySlug = new Map((regions || []).map((r) => [r.slug, r]))
  const byName = new Map((regions || []).map((r) => [r.name.toLowerCase(), r]))

  const now = new Date().toISOString()
  const toInsert = []
  let skippedDuplicate = 0
  let skippedInvalid = 0

  for (const raw of rows) {
    const outlet = (raw.outlet_name || '').trim()
    if (!outlet) { skippedInvalid++; continue }
    const journalist = (raw.journalist_name || '').trim() || null
    const email = (raw.contact_email || '').trim().toLowerCase() || null
    const key = keyOf(outlet, journalist, email)
    if (seen.has(key)) { skippedDuplicate++; continue }
    seen.add(key)

    const region = (raw.region_slug && bySlug.get(String(raw.region_slug).trim()))
      || (raw.region_name && byName.get(String(raw.region_name).trim().toLowerCase()))
      || null
    const kind = KINDS.has(raw.kind) ? raw.kind : (journalist ? 'journalist' : 'desk')

    toInsert.push({
      kind,
      outlet_name: outlet,
      journalist_name: journalist,
      role_title: (raw.role_title || '').trim() || null,
      beat: normBeat(raw.beat),
      state: (raw.state || '').trim().toUpperCase() || null,
      region_id: region?.id || null,
      region_name: region?.name || (raw.region_name ? String(raw.region_name).trim() : null),
      website: (raw.website || '').trim() || null,
      contact_email: email,
      twitter: (raw.twitter || '').trim() || null,
      email_source: email ? 'import' : null,
      status: 'not_contacted',
      created_at: now,
      updated_at: now,
    })
  }

  let inserted = 0
  if (toInsert.length) {
    const { error: insErr } = await sb.from('press_outreach').insert(toInsert)
    if (insErr) {
      console.error('[press-outreach/import] insert error:', insErr.message)
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
