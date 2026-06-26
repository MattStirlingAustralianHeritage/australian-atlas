// ============================================================
// Session bridge for the planner Discovery onboarding.
//
// The onboarding popup (PlannerDiscoveryGate) lets a visitor swipe through
// Discover cards before they build a trip. The "I'd visit this" picks are
// stashed here, in sessionStorage, so the planner client (On This Road /
// Plan a Stay) can read them at submit time and post them as `discoveryPicks`.
//
// sessionStorage — not localStorage — because the scope we want is exactly the
// current tab/session: the picks should colour the trip you build now, then
// fall away. For signed-in users the durable signal still lives in user_saves /
// taste_profiles; this is only the immediate, in-the-moment nudge.
//
// Every function is SSR-safe (guards `window`) and never throws.
// ============================================================

const KEY = 'aa:discovery-picks:v1'

/** Read the stashed picks as a string[] (empty array when none / unavailable). */
export function readDiscoveryPicks() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

/** Stash the picks (dedup, capped). Writing an empty list clears the key. */
export function writeDiscoveryPicks(ids) {
  if (typeof window === 'undefined') return
  try {
    const clean = Array.isArray(ids) ? [...new Set(ids.map(String))].slice(0, 50) : []
    if (clean.length === 0) {
      window.sessionStorage.removeItem(KEY)
    } else {
      window.sessionStorage.setItem(KEY, JSON.stringify(clean))
    }
  } catch {
    /* private mode / quota — degrade to no personalisation */
  }
}

/** Forget any stashed picks (e.g. once consumed, or on reset). */
export function clearDiscoveryPicks() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
