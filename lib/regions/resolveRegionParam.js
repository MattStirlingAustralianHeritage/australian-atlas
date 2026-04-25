// ─────────────────────────────────────────────────────────────────────────────
// Region URL-param resolver — Phase 3 step 1 (Batch 3).
//
// Implements Decision 2 dual-acceptance: callers accept either a slug-shaped
// or a name-shaped `?region=` value, look up the regions row, and (on
// name-shaped input) signal that a 301 redirect to the canonical slug URL
// should be issued.
//
// Usage:
//
//     import { resolveRegionParam } from '@/lib/regions'
//
//     const { region, canonicalParam, redirectNeeded } =
//       await resolveRegionParam(searchParams.get('region'))
//
//     if (redirectNeeded && canonicalParam) {
//       const url = new URL(request.url)
//       url.searchParams.set('region', canonicalParam)
//       return NextResponse.redirect(url, 301)
//     }
//
//     // proceed with `region` (may be null if no match)
//
// For server-component pages, prefer `permanentRedirect` from next/navigation
// over building the URL manually.
//
// Lookups are restricted to status='live' regions — drafts are not surfaced
// via public URL params.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * @typedef {Object} ResolveResult
 * @property {{id, slug, name, state} | null} region
 * @property {string | null} canonicalParam - slug-shaped param to canonicalise to
 * @property {boolean} redirectNeeded - true when input was name-shaped and a 301 is appropriate
 */

/**
 * Resolve a raw `?region=` URL parameter against the regions table.
 *
 * Strategy:
 *   1. Empty/null/undefined → return all-null
 *   2. Try slug match (status='live')
 *   3. Try exact name match (case-insensitive, status='live') → redirect to slug
 *   4. Try whitespace-normalised name match → redirect to slug
 *   5. No match → return { region: null, canonicalParam: input, redirectNeeded: false }
 *
 * @param {string|null|undefined} input
 * @returns {Promise<ResolveResult>}
 */
export async function resolveRegionParam(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { region: null, canonicalParam: null, redirectNeeded: false }
  }

  const trimmed = input.trim()
  const sb = getSupabaseAdmin()

  // 1. Slug match — preferred form, no redirect needed
  const { data: bySlug } = await sb
    .from('regions')
    .select('id, slug, name, state')
    .eq('slug', trimmed)
    .eq('status', 'live')
    .maybeSingle()
  if (bySlug) {
    return { region: bySlug, canonicalParam: trimmed, redirectNeeded: false }
  }

  // 2. Exact name match (case-insensitive) — redirect to slug
  const { data: byName } = await sb
    .from('regions')
    .select('id, slug, name, state')
    .ilike('name', trimmed)
    .eq('status', 'live')
    .maybeSingle()
  if (byName) {
    return { region: byName, canonicalParam: byName.slug, redirectNeeded: true }
  }

  // 3. Whitespace-normalised name match — redirect to slug
  const normalised = trimmed.replace(/\s+/g, ' ').trim()
  if (normalised !== trimmed) {
    const { data: byNorm } = await sb
      .from('regions')
      .select('id, slug, name, state')
      .ilike('name', normalised)
      .eq('status', 'live')
      .maybeSingle()
    if (byNorm) {
      return { region: byNorm, canonicalParam: byNorm.slug, redirectNeeded: true }
    }
  }

  // No match — leave the param as-is, return null region
  return { region: null, canonicalParam: input, redirectNeeded: false }
}
