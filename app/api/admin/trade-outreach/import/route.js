import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 500

/**
 * POST /api/admin/trade-outreach/import
 * Bulk-import trade companies into the directory (CSV parsed client-side).
 *
 * Body: { rows: [{ company_name, org_type?, state?, website?, contact_email?, region_slug?, region_name?, focus?, contact_name?, contact_role? }] }
 * Dedup: case-insensitive (company_name, state) against existing rows and
 * within the payload. Existing rows are never modified — import only adds.
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
    .from('trade_outreach')
    .select('company_name, state')
    .limit(5000)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const seen = new Set((existingRows || []).map((r) => `${(r.company_name || '').toLowerCase()}|${r.state || ''}`))

  // Region lookup maps (slug and lower-cased name).
  const { data: regions } = await sb.from('regions').select('id, name, slug')
  const bySlug = new Map((regions || []).map((r) => [r.slug, r]))
  const byName = new Map((regions || []).map((r) => [r.name.toLowerCase(), r]))

  const now = new Date().toISOString()
  const toInsert = []
  let skippedDuplicate = 0
  let skippedInvalid = 0

  for (const raw of rows) {
    const name = (raw.company_name || '').trim()
    if (!name) { skippedInvalid++; continue }
    const state = (raw.state || '').trim().toUpperCase() || null
    const key = `${name.toLowerCase()}|${state || ''}`
    if (seen.has(key)) { skippedDuplicate++; continue }
    seen.add(key)

    const region = (raw.region_slug && bySlug.get(String(raw.region_slug).trim()))
      || (raw.region_name && byName.get(String(raw.region_name).trim().toLowerCase()))
      || null
    const email = (raw.contact_email || '').trim().toLowerCase() || null

    toInsert.push({
      company_name: name,
      org_type: (raw.org_type || '').trim() || null,
      state,
      website: (raw.website || '').trim() || null,
      region_id: region?.id || null,
      region_name: region?.name || (raw.region_name ? String(raw.region_name).trim() : null),
      focus: (raw.focus || '').trim() || null,
      contact_name: (raw.contact_name || '').trim() || null,
      contact_role: (raw.contact_role || '').trim() || null,
      contact_email: email,
      email_source: email ? 'import' : null,
      status: 'not_contacted',
      created_at: now,
      updated_at: now,
    })
  }

  let inserted = 0
  if (toInsert.length) {
    const { error: insErr } = await sb.from('trade_outreach').insert(toInsert)
    if (insErr) {
      console.error('[trade-outreach/import] insert error:', insErr.message)
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
    unmatchedRegion: toInsert.filter((r) => !r.region_id).length,
  })
}
