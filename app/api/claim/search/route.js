import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import { excludeTestListings } from '@/lib/listings/publicFilter'

export const dynamic = 'force-dynamic'

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
  way: 'Way Atlas',
}

const MAX_RESULTS = 20

/**
 * GET /api/claim/search?q=<term>
 *
 * Server-side claim-flow venue search over the FULL listings table, replacing
 * the old serialise-everything-to-the-client approach that silently truncated
 * at PostgREST's 1000-row cap (only ~15% of venues were findable). Each
 * whitespace-separated term must ilike-match name, region, suburb or state.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  // PostgREST .or() filter values: strip reserved chars, escape LIKE wildcards.
  const terms = q
    .split(/\s+/)
    .map(t => t.replace(/[,()]/g, '').replace(/[%_]/g, '\\$&'))
    .filter(Boolean)
    .slice(0, 6)
  if (!terms.length) return NextResponse.json({ results: [] })

  const sb = getSupabaseAdmin()
  let query = excludeTestListings(
    sb
      .from('listings')
      .select(`id, name, slug, vertical, region, suburb, state, is_claimed, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .neq('vertical', 'field')
  )
  for (const t of terms) {
    query = query.or(`name.ilike.%${t}%,region.ilike.%${t}%,suburb.ilike.%${t}%,state.ilike.%${t}%`)
  }
  const { data, error } = await query.order('name').limit(MAX_RESULTS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = (data || []).map(l => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    verticalLabel: VERTICAL_LABELS[l.vertical] || l.vertical,
    verticalColor: VERTICAL_ACCENTS[l.vertical] || '#5F8A7E',
    region: getListingRegion(l)?.name ?? l.region ?? null,
    state: l.state,
    isClaimed: l.is_claimed || false,
  }))

  return NextResponse.json({ results })
}
