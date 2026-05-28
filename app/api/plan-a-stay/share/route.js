import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — Share endpoint
   ═══════════════════════════════════════════════════════════════════════
   Persists a finished trip on demand (when the user clicks Share).
   Idempotent: sharing the same trip twice returns the same slug.
   The trip JSON is frozen — what was shown is what gets stored.        */


/* ─── Slugify ─────────────────────────────────────────────────────────── */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function generateShareSlug(title) {
  const base = slugify(title)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}


/* ─── Fingerprint for idempotency ─────────────────────────────────────
   Two trips are "the same" if they have the same region, intent,
   pacing, duration, and identical stop list. We hash the stop IDs
   per day to avoid re-persisting the exact same result.               */
function tripFingerprint(answers, trip) {
  const stopIds = (trip.days || [])
    .flatMap(d => (d.stops || []).map(s => s.listing_id))
    .join(',')
  return [
    answers.region || '',
    (answers.intent || []).sort().join('+'),
    answers.pacing || '',
    answers.duration || '',
    stopIds,
  ].join('|')
}


export async function POST(request) {
  try {
    const body = await request.json()
    const { trip, answers, stays_only } = body

    // Validate: must have either a normal trip or stays_only
    if (!trip && !stays_only) {
      return NextResponse.json(
        { error: 'Missing trip or stays_only in request body' },
        { status: 400 }
      )
    }

    if (!answers) {
      return NextResponse.json(
        { error: 'Missing answers in request body' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // ── Idempotency check ───────────────────────────────────────────
    // Build a fingerprint and check if we already persisted this exact trip.
    const fingerprint = trip
      ? tripFingerprint(answers, trip)
      : `stays_only|${answers.region}|${(answers.intent || []).join('+')}`

    const { data: existing } = await sb
      .from('plan_a_stay_trips')
      .select('id, share_slug')
      .eq('fingerprint', fingerprint)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        slug: existing.share_slug,
        url: `/trip/${existing.share_slug}`,
        already_shared: true,
      })
    }

    // ── Generate slug ────────────────────────────────────────────────
    const title = trip?.title || `${answers.region || 'Trip'} stays`
    const shareSlug = generateShareSlug(title)

    // ── Persist ──────────────────────────────────────────────────────
    const row = {
      share_slug: shareSlug,
      answers,
      retrieval: {},           // Not needed for display; keep row lean
      trip: trip || null,
      stays_only: stays_only || null,
      fingerprint,
      is_public: true,
    }

    const { data: inserted, error: insertError } = await sb
      .from('plan_a_stay_trips')
      .insert(row)
      .select('id, share_slug')
      .single()

    if (insertError) {
      console.error('[plan-a-stay/share] Insert failed:', insertError.message)
      return NextResponse.json(
        { error: 'Failed to save trip', detail: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      slug: inserted.share_slug,
      url: `/trip/${inserted.share_slug}`,
      already_shared: false,
    })
  } catch (err) {
    console.error('[plan-a-stay/share]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
