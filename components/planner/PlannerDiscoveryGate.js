'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import AuthModal from '@/components/AuthModal'
import DiscoverDeck from '@/components/discover/DiscoverDeck'
import { writeDiscoveryPicks } from '@/lib/discover/sessionPicks'
import './planner-discovery-gate.css'

/* ============================================================
   PlannerDiscoveryGate — the first-visit Discovery popup that fronts the two
   trip planners (On This Road, Plan a Stay).

   On a visitor's FIRST landing on either planner it overlays a compact instance
   of the Discover swipe deck and invites them to keep a handful of places, so
   the trip we build is tuned to their taste. The more they keep, the sharper it
   gets.

   • Signed-in    — picks persist immediately (the deck writes each to
                    user_saves) AND seed THIS trip.
   • Anonymous    — invited to create a free account so their taste becomes
                    durable; either way the in-session picks still inform the
                    trip they build now (carried via sessionStorage →
                    discoveryPicks on the planner's API call).
   • Skippable    — a close affordance and a "skip to planning" action drop
                    straight through to the planner, which renders underneath
                    the whole time.

   Shows once per browser (localStorage flag). The planner is always mounted as
   `children`; this only ever adds/removes an overlay on top.
   ============================================================ */

const SEEN_KEY = 'aa:planner-discovery-onboarding:v1'
// Picks stashed when the visitor starts account creation, so they survive a
// Google OAuth full-page redirect and get flushed to user_saves once signed in.
const PENDING_FLUSH_KEY = 'aa:planner-discovery-pending-flush:v1'

const PLANNER_COPY = {
  'on-this-road': { noun: 'road trip', whose: 'your road trip' },
  'plan-a-stay': { noun: 'stay', whose: 'your stay' },
}

export default function PlannerDiscoveryGate({ planner = 'plan-a-stay', children }) {
  const supabase = getAuthSupabase()
  const copy = PLANNER_COPY[planner] || PLANNER_COPY['plan-a-stay']

  const [open, setOpen] = useState(false)        // overlay visible
  const [authed, setAuthed] = useState(null)     // null = unknown
  const [picks, setPicks] = useState([])         // mirrored live from the deck
  const [authOpen, setAuthOpen] = useState(false)
  const [kept, setKept] = useState(false)        // picks flushed to a new account
  const decidedRef = useRef(false)

  // ── First-visit gate ────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true)
    } catch { /* private mode — skip the popup entirely */ }
  }, [])

  // ── Auth state ──────────────────────────────────────────────────────
  // The gate keeps its own subscription (the deck has a separate, harmless one
  // on the same singleton client). authed drives the account-invite copy and
  // the pending-flush effect below.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setAuthed(!!data?.user) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthed(!!session?.user)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [supabase])

  // ── Flush picks to the account once signed in (handles BOTH paths) ──
  // Set when account creation begins (beginAuth). Fires for the synchronous
  // email/password sign-in AND after a Google OAuth round-trip (the gate
  // re-mounts signed-in), so the anonymous picks become durable taste either
  // way. Idempotent: cleared as soon as it runs; absent for users who never
  // started account creation.
  useEffect(() => {
    if (authed !== true) return
    let pending = null
    try { pending = JSON.parse(window.sessionStorage.getItem(PENDING_FLUSH_KEY) || 'null') } catch {}
    if (!Array.isArray(pending) || pending.length === 0) return
    try { window.sessionStorage.removeItem(PENDING_FLUSH_KEY) } catch {}
    fetch('/api/user/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_ids: pending }),
    }).then((res) => { if (res.ok) setKept(true) }).catch(() => { /* still informs the trip */ })
  }, [authed])

  // ── Lock body scroll while the overlay is up ────────────────────────
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const markSeen = () => { try { window.localStorage.setItem(SEEN_KEY, '1') } catch {} }

  // Leave the popup for the planner, carrying whatever was kept into the trip
  // the visitor is about to build. A skip with picks still keeps them — the
  // picks are the signal; "skip" only means "stop swiping".
  const proceed = useCallback(() => {
    if (decidedRef.current) return
    decidedRef.current = true
    writeDiscoveryPicks(picks)   // empty list clears the key
    markSeen()
    setOpen(false)
  }, [picks])

  // ── Esc closes (= proceed) ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') proceed() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, proceed])

  // Begin account creation. Stash the picks BEFORE opening the modal so they
  // survive a Google OAuth full-page redirect: written to the discovery-picks
  // key (so they inform the trip regardless of outcome), stashed for the
  // post-sign-in flush, and the once-flag is set so the popup doesn't re-show
  // on the OAuth round-trip back. The pending-flush effect handles persistence.
  const beginAuth = useCallback(() => {
    writeDiscoveryPicks(picks)
    try { window.sessionStorage.setItem(PENDING_FLUSH_KEY, JSON.stringify(picks)) } catch {}
    markSeen()
    setAuthOpen(true)
  }, [picks])

  // Synchronous email/password sign-in resolved inside the modal — just close
  // it; the pending-flush effect (keyed on authed) persists the picks.
  const handleAuthSuccess = useCallback(() => {
    setAuthOpen(false)
    setAuthed(true)
  }, [])

  // Must be a PATH, not a full URL: /auth/callback runs `next` through
  // safeNextPath, which rejects absolute URLs (open-redirect guard) and falls
  // back to /account — which would strand the OAuth visitor off the planner and
  // never inform their trip. A same-origin path lands them back here, where the
  // SEEN flag suppresses the re-prompt and the pending-flush effect persists the
  // picks. (Mirrors PlanAStayV2Client's returnTo.)
  const returnTo = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : undefined
  const pickCount = picks.length

  return (
    <>
      {children}

      {open && (
        <div className="pdg-overlay" role="dialog" aria-modal="true" aria-labelledby="pdg-title">
          <div className="pdg-modal">
            <button type="button" className="pdg-close" onClick={proceed} aria-label="Skip and go to the planner">
              &times;
            </button>

            <div className="pdg-head">
              <p className="pdg-kicker">Before we build {copy.whose}</p>
              <h2 id="pdg-title" className="pdg-title">Tell us what you love</h2>
              <p className="pdg-sub">
                Keep a few places that catch your eye. The more you keep, the more
                tailored {copy.whose} becomes — we lean it toward the kinds of
                spots you pick.
              </p>

              {authed === false && (
                <div className="pdg-account">
                  <p className="pdg-account-copy">
                    {kept ? (
                      <><b>Saved to your account.</b> Your picks now build a lasting taste profile —
                      every future trip gets sharper.</>
                    ) : (
                      <>Want it to stick? <b>Create a free account</b> first and your picks
                      become a lasting taste profile. No account needed today — we&rsquo;ll
                      still use these picks for {copy.whose}.</>
                    )}
                  </p>
                  {!kept && (
                    <button type="button" className="pdg-account-btn" onClick={beginAuth}>
                      Create a free account
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="pdg-deck-host">
              <DiscoverDeck variant="onboarding" onPicksChange={setPicks} />
            </div>

            <div className="pdg-foot">
              <span className="pdg-tally">
                {pickCount > 0
                  ? <><b>{pickCount}</b> {pickCount === 1 ? 'place' : 'places'} you&rsquo;d visit</>
                  : 'Swipe right on anything you like'}
              </span>
              <button type="button" className="pdg-cta" onClick={proceed}>
                {pickCount > 0 ? `Plan ${copy.whose} →` : `Skip to planning →`}
              </button>
            </div>
          </div>

          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthSuccess={handleAuthSuccess} returnTo={returnTo} />
        </div>
      )}
    </>
  )
}
