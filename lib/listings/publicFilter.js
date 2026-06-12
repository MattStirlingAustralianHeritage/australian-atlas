// ============================================================
// Public-surface fixture filter
// ============================================================
// Admin/QA fixture listings (Admin Test Brewery, Admin Test Roastery,
// Admin Cafe, Admin's Test Museum) are real rows in active use by claim-flow
// and search e2e tests, so they must never be archived or modified — they are
// instead excluded from public-facing reads at the query level. Admin views
// and direct /place/<slug> and /claim/<slug> URLs are deliberately unaffected.
//
// All fixtures share the slug prefix 'admin' ('admin-test-…', 'admin-cafe',
// 'admins-test-museum'); no legitimate venue slug matches it (verified against
// prod 2026-06-12).

const TEST_SLUG_PREFIX = 'admin'

/** Chain onto a PostgREST listings query to drop fixture rows. */
export function excludeTestListings(query) {
  return query.not('slug', 'ilike', `${TEST_SLUG_PREFIX}%`)
}

/** Row-level variant for results that arrive via RPC (e.g. search_listings_hybrid). */
export function isPublicListing(row) {
  return !(typeof row?.slug === 'string' && row.slug.toLowerCase().startsWith(TEST_SLUG_PREFIX))
}
