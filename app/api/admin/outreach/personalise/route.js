import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT, getListingRegion } from '@/lib/regions'
import { generatePersonalNotesBatch } from '@/lib/outreach/personalise'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/admin/outreach/personalise
 * Generate a one-sentence AI opener per listing and store it on operator_outreach
 * as personal_note. Reviewed/edited in the UI before send.
 *
 * Body: { listing_ids: string[] }  (max 20 per call)
 * Returns: { results: [{ listing_id, name, personal_note }] }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const listingIds = Array.isArray(body.listing_ids) ? body.listing_ids.slice(0, 20) : []
  if (listingIds.length === 0) {
    return NextResponse.json({ error: 'listing_ids required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: listings, error } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, suburb, description, ${LISTING_REGION_SELECT}`)
    .in('id', listingIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (listings || []).map((l) => ({
    id: l.id,
    name: l.name,
    vertical: l.vertical,
    region: getListingRegion(l)?.name || l.region || null,
    suburb: l.suburb || null,
    description: l.description || null,
  }))

  const { notes, budgetHit } = await generatePersonalNotesBatch(enriched, 4, sb)
  const noteById = new Map(notes.map((n) => [n.id, n.personal_note]))

  // Read existing outreach rows so we update rather than duplicate.
  const { data: existingRows } = await sb
    .from('operator_outreach')
    .select('id, listing_id')
    .in('listing_id', listingIds)
  const existingByListing = new Map((existingRows || []).map((r) => [r.listing_id, r]))

  const now = new Date().toISOString()
  const toInsert = []
  const results = []

  for (const l of listings || []) {
    const note = noteById.get(l.id) || ''
    if (note) {
      const existing = existingByListing.get(l.id)
      if (existing) {
        await sb
          .from('operator_outreach')
          .update({ personal_note: note, personal_note_generated_at: now, updated_at: now })
          .eq('id', existing.id)
      } else {
        toInsert.push({
          listing_id: l.id,
          status: 'not_contacted',
          personal_note: note,
          personal_note_generated_at: now,
          created_at: now,
          updated_at: now,
        })
      }
    }
    results.push({ listing_id: l.id, name: l.name, personal_note: note })
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await sb.from('operator_outreach').insert(toInsert)
    if (insErr) console.error('[outreach/personalise] insert error:', insErr.message)
  }

  const generated = results.filter((r) => r.personal_note).length
  return NextResponse.json({ ok: true, requested: results.length, generated, budgetHit: !!budgetHit, results })
}
