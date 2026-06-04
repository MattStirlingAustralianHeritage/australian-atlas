import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/candidates/create
 *
 * Manually add a listing the admin came across to the review queue.
 * Inserts a pending `user_suggested` candidate that then flows through
 * the exact same review/enrich/publish pipeline as auto-discovered ones.
 *
 * Body: { name, vertical, website_url?, address?, state?, region?, notes? }
 * Auth: admin cookie
 */

const ALLOWED_VERTICALS = [
  'sba', 'collection', 'craft', 'fine_grounds', 'rest',
  'field', 'corner', 'found', 'table', 'way',
]

function normaliseUrl(url) {
  if (!url) return null
  let u = String(url).trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    const name = (body.name || '').trim()
    const vertical = (body.vertical || '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!ALLOWED_VERTICALS.includes(vertical)) {
      return NextResponse.json({ error: 'A valid vertical is required' }, { status: 400 })
    }

    const website_url = normaliseUrl(body.website_url)
    const region = (body.region || '').trim() || null
    const address = (body.address || '').trim() || null
    const state = (body.state || '').trim().toUpperCase() || null
    const notes = (body.notes || '').trim() || null
    const today = new Date().toISOString().split('T')[0]

    const sb = getSupabaseAdmin()

    // Core columns present on every deployment (migrations 024 / 029).
    // confidence is omitted so the table default (0.5) applies; gate_results
    // is left null so the review card simply skips the quality-gate panel.
    const core = {
      name,
      vertical,
      website_url,
      region,
      notes,
      source: 'user_suggested',
      source_detail: `manual — ${today}`,
      status: 'pending',
    }

    // Location columns landed in migration 086. They exist wherever the
    // prospector geocode flow works (production included), but fall back
    // gracefully if a deployment is a migration behind.
    const extended = { ...core, address, state }

    let { data, error } = await sb
      .from('listing_candidates')
      .insert(extended)
      .select('*')
      .single()

    if (error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''))) {
      console.warn('[admin/candidates/create] 086 columns absent — inserting core fields only')
      ;({ data, error } = await sb
        .from('listing_candidates')
        .insert(core)
        .select('*')
        .single())
    }

    if (error) {
      console.error('[admin/candidates/create] Insert failed:', error.message)
      return NextResponse.json({ error: `Create failed: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ candidate: data })
  } catch (err) {
    console.error('[admin/candidates/create] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 })
  }
}
