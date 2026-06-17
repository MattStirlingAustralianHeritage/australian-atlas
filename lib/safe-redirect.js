// lib/safe-redirect.js
// Open-redirect guard for post-auth `next` params.
//
// A `next` value flows into `${origin}${next}` redirects AFTER the user has
// authenticated, so an attacker-controlled value is a phishing primitive.
// `next.startsWith('/')` is NOT sufficient: the browser treats `//evil.com`
// and `/\evil.com` as protocol-relative URLs and navigates off-site. Only a
// single-leading-slash, same-origin relative path is allowed.

export function safeNextPath(next, fallback = '/account') {
  if (typeof next !== 'string' || next.length === 0) return fallback
  if (next[0] !== '/') return fallback                       // must be relative
  if (next[1] === '/' || next[1] === '\\') return fallback   // reject //host and /\host
  return next
}
