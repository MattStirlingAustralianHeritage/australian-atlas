import { timingSafeEqual } from 'crypto'

/**
 * Constant-time equality for secret comparison (shared API secrets, tokens).
 * A plain `a === b` short-circuits on the first differing byte, leaking match
 * progress via response timing. This compares in time independent of content.
 *
 * Returns false unless both are non-empty strings of equal byte length whose
 * bytes are identical. (Length is compared non-constant-time — inherent to
 * timingSafeEqual, which requires equal-length buffers — which is the standard,
 * accepted trade-off for secret comparison.)
 */
export function secureEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length === 0 || b.length === 0) return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
