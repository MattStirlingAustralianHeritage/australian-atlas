import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import HumanatorReview from './HumanatorReview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'The Humanator — Admin' }

export default async function HumanatorPage() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    redirect('/admin/login')
  }

  const sb = getSupabaseAdmin()

  // Fetch initial listing and stats in parallel
  let initialListing = null
  let initialStats = { humanised_count: 0, total_active_count: 0 }

  try {
    // Stats
    const [humanisedRes, totalRes] = await Promise.all([
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('humanised', true),
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    initialStats = {
      humanised_count: humanisedRes.count || 0,
      total_active_count: totalRes.count || 0,
    }

    // First listing — un-humanised, most missing fields
    const { data: candidates } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, humanised, humanised_at, created_at, updated_at')
      .eq('status', 'active')
      .eq('humanised', false)
      .limit(50)

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
    console.error('[admin/humanator] Init error:', err.message)
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <HumanatorReview
        initialListing={initialListing}
        initialStats={initialStats}
      />
    </div>
  )
}
