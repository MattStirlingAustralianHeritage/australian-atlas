import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/dashboard/recommend
 *
 * Lets a signed-in operator recommend a venue they think belongs on the
 * network. It drops a pending `user_suggested` candidate into the exact same
 * review queue (/admin/candidates) as admin-added and auto-discovered ones —
 * no separate pipeline. The operator's identity (and the listing they own) is
 * recorded in the candidate notes so the reviewer can weigh the source.
 *
 * Body: { name, vertical, website_url?, region?, note? }
 * Auth: operator Supabase session cookie (same as Producer Picks)
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

async function requireUser() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Names of the listings this operator owns — surfaced in the candidate notes
// as a trust signal for the reviewer ("recommended by a real operator who
// runs X"). Best-effort: never blocks the recommendation.
async function getOwnedListingNames(admin, userId) {
  const { data: claims } = await admin
    .from('listing_claims')
    .select('listing_id')
    .eq('claimed_by', userId)
    .in('status', LIVE_CLAIM_STATUSES)
  const ids = [...new Set((claims || []).map(c => c.listing_id).filter(Boolean))]
  if (!ids.length) return []
  const { data: listings } = await admin
    .from('listings')
    .select('name')
    .in('id', ids)
  return (listings || []).map(l => l.name).filter(Boolean)
}

export async function POST(request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))

    const name = (body.name || '').trim()
    const vertical = (body.vertical || '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Please give the business a name.' }, { status: 400 })
    }
    if (name.length > 160) {
      return NextResponse.json({ error: 'That name looks too long — keep it under 160 characters.' }, { status: 400 })
    }
    if (!ALLOWED_VERTICALS.includes(vertical)) {
      return NextResponse.json({ error: 'Please choose which kind of place this is.' }, { status: 400 })
    }

    const website_url = normaliseUrl(body.website_url)
    const region = (body.region || '').trim() || null
    const reason = (body.note || '').trim().slice(0, 600) || null

    const admin = getSupabaseAdmin()

    // If it's already live on the Atlas (same name + vertical), tell the
    // operator rather than queuing a duplicate the reviewer would just bin.
    const { data: existing } = await admin
      .from('listings')
      .select('name, slug')
      .eq('vertical', vertical)
      .ilike('name', name)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        status: 'exists',
        message: `Good news — ${existing.name} is already on the Atlas.`,
        listing: existing,
      })
    }

    // Compose the reviewer-facing note: who recommended it, what they run,
    // and why. This is the signal that separates an operator vouch from an
    // anonymous web suggestion.
    const owned = await getOwnedListingNames(admin, user.id)
    const ownsClause = owned.length ? ` (operates: ${owned.slice(0, 3).join(', ')})` : ''
    const who = `Recommended by operator ${user.email}${ownsClause}.`
    const notes = reason ? `${who} Reason: ${reason}` : who

    const today = new Date().toISOString().split('T')[0]

    // Core columns present on every deployment — same shape the admin manual
    // "add a candidate" route uses, so this flows through the identical
    // review/enrich/publish pipeline. confidence omitted → table default (0.5).
    const row = {
      name,
      vertical,
      website_url,
      region,
      notes,
      source: 'user_suggested',
      source_detail: `operator recommendation — ${today}`,
      status: 'pending',
    }

    const { data, error } = await admin
      .from('listing_candidates')
      .insert(row)
      .select('id, name, vertical')
      .single()

    if (error) {
      // Unique index on (lower(trim(name)), vertical): already suggested or
      // already a candidate. Treat as a friendly no-op, not an error.
      if (error.code === '23505') {
        return NextResponse.json({
          status: 'duplicate',
          message: `Thanks — ${name} is already on our radar for review.`,
        })
      }
      console.error('[dashboard/recommend] Insert failed:', error.message)
      return NextResponse.json({ error: 'Something went wrong saving that. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      status: 'queued',
      message: `Thanks — ${name} has been sent to our team to review.`,
      candidate: data,
    })
  } catch (err) {
    console.error('[dashboard/recommend] Error:', err.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
