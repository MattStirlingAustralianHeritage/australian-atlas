import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import ListingsReview from './ListingsReview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listings Review — Admin' }

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

export default async function ListingsReviewPage({ searchParams }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    redirect('/admin/login')
  }

  const resolvedParams = await searchParams
  const selectedVertical = resolvedParams?.vertical || 'all'

  const sb = getSupabaseAdmin()

  let initialListing = null
  let initialStats = { humanised_count: 0, total_active_count: 0 }
  let verticalCounts = {}

  try {
    // Stats + per-vertical unreviewed counts in parallel
    const countPromises = ALL_VERTICALS.map(v =>
      sb.from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('humanised', false)
        .eq('vertical', v)
        .then(({ count }) => ({ vertical: v, count: count || 0 }))
    )

    const [humanisedRes, totalRes, ...verticalResults] = await Promise.all([
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('humanised', true),
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ...countPromises,
    ])

    initialStats = {
      humanised_count: humanisedRes.count || 0,
      total_active_count: totalRes.count || 0,
    }

    for (const r of verticalResults) {
      verticalCounts[r.vertical] = r.count
    }

    // First listing — filtered by vertical if selected
    let query = sb
      .from('listings')
      .select(`id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, humanised, humanised_at, created_at, updated_at, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .eq('humanised', false)

    if (selectedVertical !== 'all') {
      query = query.eq('vertical', selectedVertical)
    }

    // Order by least recently reviewed (humanised_at null first, then oldest)
    query = query.order('humanised_at', { ascending: true, nullsFirst: true })

    const { data: candidates } = await query.limit(50)

    if (candidates && candidates.length > 0) {
      const scored = candidates.map(l => ({
        ...l,
        _missing: (
          (!l.description ? 1 : 0) +
          (!l.website ? 1 : 0) +
          (!l.address ? 1 : 0) +
          (!l.hero_image_url ? 1 : 0)
        ),
      }))
      scored.sort((a, b) => b._missing - a._missing || Math.random() - 0.5)
      const { _missing, ...listing } = scored[0]
      initialListing = listing
    }
  } catch (err) {
    console.error('[admin/listings-review] Init error:', err.message)
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <ListingsReview
        initialListing={initialListing}
        initialStats={initialStats}
        verticalCounts={verticalCounts}
        selectedVertical={selectedVertical}
      />
    </div>
  )
}
