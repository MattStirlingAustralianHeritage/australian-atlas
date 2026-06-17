// One-time data repair (2026-06-17).
//
// Bug: app/api/admin/candidates/[id]/route.js set `needs_review = isAiOriginated`
// on approval, so every AI-prospector candidate an admin approved became an
// active-but-needs_review=true listing. The public gate (lib/listings/publicFilter.js
// + app/place/[slug]/page.js) 404s / hides any needs_review=true row, so 663
// approved listings never went live (place page, search, explore, map, sitemap,
// network stats). The candidate-approval route is the ONLY writer of
// needs_review=true on listings, so every such row is an admin-approved candidate.
//
// Fix: an admin's approval in /admin/candidates IS the human review, so clear the
// flag for every active row carrying it. data_source stays 'ai_generated' (accurate
// provenance; still drives the "auto-generated — claim it" disclaimer). Idempotent.
//
// Usage:  node --env-file=.env.local scripts/clear-needs-review-approved-2026-06-17.mjs [--execute]
import { createClient } from '@supabase/supabase-js'

const EXECUTE = process.argv.includes('--execute')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { count: target } = await sb.from('listings')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active').eq('needs_review', true)
console.log(`Target: ${target} active + needs_review=true listings`)

if (!EXECUTE) {
  console.log('DRY RUN — re-run with --execute to apply. Nothing changed.')
  process.exit(0)
}

// Page through ids and clear in batches (PostgREST update returns the changed rows).
let cleared = 0
for (;;) {
  const { data, error } = await sb.from('listings')
    .update({ needs_review: false })
    .eq('status', 'active').eq('needs_review', true)
    .select('id')
    .limit(500)
  if (error) { console.error('update error:', error.message); process.exit(1) }
  cleared += (data?.length || 0)
  if (!data || data.length === 0) break
  console.log(`  cleared ${cleared}…`)
}
console.log(`Done. Cleared needs_review on ${cleared} listings.`)

const { count: remaining } = await sb.from('listings')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'active').eq('needs_review', true)
console.log(`Remaining active + needs_review=true: ${remaining}`)
