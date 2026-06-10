import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { generateShareSlug, fingerprintFor, tripTitle } from '@/lib/plan-a-stay/share-util'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — Save-to-account endpoint
   ═══════════════════════════════════════════════════════════════════════
   Like Share, but attaches the finished trip to the signed-in user so it
   shows up under "My trails". Reuses the same row + fingerprint as Share,
   so a trip that was shared then saved (or vice versa) stays one row.

   Returns 401 when there's no session — the client opens the sign-in
   modal and retries. The trip JSON is frozen at save time.             */

export async function POST(request) {
  try {
    // ── Who is saving? ───────────────────────────────────────────────
    const auth = await createAuthServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = await request.json()
    const { trip, answers, stays_only } = body

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
    const fingerprint = fingerprintFor(answers, trip, stays_only)

    // ── Does this exact trip already exist? ──────────────────────────
    const { data: existing } = await sb
      .from('plan_a_stay_trips')
      .select('id, share_slug, user_id')
      .eq('fingerprint', fingerprint)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Already mine → idempotent success.
      if (existing.user_id === user.id) {
        return NextResponse.json({
          slug: existing.share_slug,
          url: `/trip/${existing.share_slug}`,
          already_saved: true,
        })
      }
      // An anonymous share of the same trip → claim it for this account.
      if (!existing.user_id) {
        const { error: claimError } = await sb
          .from('plan_a_stay_trips')
          .update({ user_id: user.id, is_public: true })
          .eq('id', existing.id)
        if (claimError) {
          console.error('[plan-a-stay/save] Claim failed:', claimError.message)
          return NextResponse.json(
            { error: 'Failed to save trip', detail: claimError.message },
            { status: 500 }
          )
        }
        return NextResponse.json({
          slug: existing.share_slug,
          url: `/trip/${existing.share_slug}`,
          saved: true,
        })
      }
      // Owned by a different account: fall through and store a private copy.
      // We drop the fingerprint on the copy so it can coexist with the
      // original under the partial-unique fingerprint index.
    }

    // ── Persist a new row owned by this user ─────────────────────────
    const title = tripTitle(answers, trip)
    const row = {
      share_slug: generateShareSlug(title),
      answers,
      retrieval: {},           // Not needed for display; keep row lean
      trip: trip || null,
      stays_only: stays_only || null,
      fingerprint: existing ? null : fingerprint,
      user_id: user.id,
      is_public: true,
    }

    const { data: inserted, error: insertError } = await sb
      .from('plan_a_stay_trips')
      .insert(row)
      .select('id, share_slug')
      .single()

    if (insertError) {
      console.error('[plan-a-stay/save] Insert failed:', insertError.message)
      return NextResponse.json(
        { error: 'Failed to save trip', detail: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      slug: inserted.share_slug,
      url: `/trip/${inserted.share_slug}`,
      saved: true,
    })
  } catch (err) {
    console.error('[plan-a-stay/save]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
