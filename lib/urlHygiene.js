// ============================================================
// URL hygiene — strip ad/analytics tracking params from operator
// website URLs at render time. Second layer of defence on top of
// migration 160, which cleaned the stored values; future syncs from
// Google-Places-sourced data can reintroduce them.
// ============================================================

const TRACKING_PARAM = /^(utm_[a-z0-9_-]*|gclid|fbclid)$/i

/**
 * Remove utm_* / gclid / fbclid query params, preserving every other
 * param and any #fragment. Returns the input unchanged when there is
 * nothing to strip or it isn't parseable as a URL.
 * @param {string|null|undefined} raw
 * @returns {string|null|undefined}
 */
export function stripTrackingParams(raw) {
  if (!raw || typeof raw !== 'string' || !raw.includes('?')) return raw
  try {
    const hasScheme = /^https?:\/\//i.test(raw)
    const u = new URL(hasScheme ? raw : `https://${raw}`)
    let changed = false
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        u.searchParams.delete(key)
        changed = true
      }
    }
    if (!changed) return raw
    let out = u.toString()
    if (!hasScheme) out = out.replace(/^https:\/\//i, '')
    return out
  } catch {
    return raw
  }
}
