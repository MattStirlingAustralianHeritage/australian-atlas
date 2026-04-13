import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import ForYouClient from './ForYouClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return {
    title: 'For You — Australian Atlas',
    description: 'Personalised recommendations across Australia\'s best independent venues, makers, stays, and experiences.',
    openGraph: {
      title: 'For You — Australian Atlas',
      description: 'Personalised recommendations across Australia\'s best independent venues, makers, stays, and experiences.',
    },
  }
}

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

const ALL_VERTICALS = Object.keys(VERTICAL_NAMES)

async function getUserId() {
  const cookieStore = await cookies()
  const token = cookieStore.get('atlas_auth_token')?.value
  if (!token) return null
  try {
    const { valid, user } = await verifySharedToken(token)
    return valid ? user.id : null
  } catch { return null }
}

async function getLoggedOutListings(sb) {
  // Top listings by quality_score, 2 per vertical, limit 18
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, hero_image_url, quality_score')
    .eq('status', 'active')
    .order('quality_score', { ascending: false })
    .limit(200)

  if (!data || data.length === 0) return []

  // Pick up to 2 per vertical
  const perVertical = {}
  const result = []
  for (const listing of data) {
    const v = listing.vertical
    if (!perVertical[v]) perVertical[v] = 0
    if (perVertical[v] < 2) {
      perVertical[v]++
      result.push(listing)
    }
    if (result.length >= 18) break
  }
  return result
}

async function getPersonalisedListings(sb, userId) {
  // Fetch user's recent views (last 50 distinct listing_ids)
  const { data: views } = await sb
    .from('user_views')
    .select('listing_id')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(200)

  if (!views || views.length === 0) return null // Fall back to logged-out flow

  // Deduplicate viewed listing IDs
  const viewedIds = [...new Set(views.map(v => v.listing_id))].slice(0, 50)

  // Fetch viewed listings to get their verticals and regions
  const { data: viewedListings } = await sb
    .from('listings')
    .select('vertical, region')
    .in('id', viewedIds)

  if (!viewedListings || viewedListings.length === 0) return null

  // Count verticals and regions the user has viewed
  const verticalCounts = {}
  const regionCounts = {}
  for (const l of viewedListings) {
    if (l.vertical) verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
    if (l.region) regionCounts[l.region] = (regionCounts[l.region] || 0) + 1
  }

  // Get top verticals and regions by view count
  const topVerticals = Object.entries(verticalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([v]) => v)

  const topRegions = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([r]) => r)

  // Fetch user's dismissed listing IDs
  const { data: dismissals } = await sb
    .from('user_dismissals')
    .select('listing_id')
    .eq('user_id', userId)

  const dismissedIds = new Set((dismissals || []).map(d => d.listing_id))
  const excludeIds = new Set([...viewedIds, ...dismissedIds])

  // Query listings in user's preferred verticals/regions, ordered by quality
  const { data: candidates } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, hero_image_url, quality_score')
    .eq('status', 'active')
    .in('vertical', topVerticals.length > 0 ? topVerticals : ALL_VERTICALS)
    .order('quality_score', { ascending: false })
    .limit(200)

  if (!candidates || candidates.length === 0) return null

  // Filter out viewed/dismissed, prefer matching regions, max 4 per vertical
  const perVertical = {}
  const result = []

  // First pass: matching regions
  for (const listing of candidates) {
    if (excludeIds.has(listing.id)) continue
    const v = listing.vertical
    if (!perVertical[v]) perVertical[v] = 0
    if (perVertical[v] >= 4) continue
    if (topRegions.includes(listing.region)) {
      perVertical[v]++
      result.push(listing)
    }
    if (result.length >= 20) break
  }

  // Second pass: fill remaining slots with any matching vertical
  if (result.length < 20) {
    const addedIds = new Set(result.map(r => r.id))
    for (const listing of candidates) {
      if (excludeIds.has(listing.id) || addedIds.has(listing.id)) continue
      const v = listing.vertical
      if (!perVertical[v]) perVertical[v] = 0
      if (perVertical[v] >= 4) continue
      perVertical[v]++
      result.push(listing)
      if (result.length >= 20) break
    }
  }

  return result.length > 0 ? result : null
}

export default async function ForYouPage() {
  const sb = getSupabaseAdmin()
  const userId = await getUserId()
  const isLoggedIn = !!userId

  let listings
  if (userId) {
    listings = await getPersonalisedListings(sb, userId)
    if (!listings) {
      listings = await getLoggedOutListings(sb)
    }
  } else {
    listings = await getLoggedOutListings(sb)
  }

  return (
    <div style={{
      minHeight: '80vh',
      background: 'var(--color-cream, #FAF7F2)',
      padding: '3rem 1.5rem 4rem',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: '0 0 0.5rem',
          }}>
            For You
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            Places we think you'll love
          </p>
        </div>

        <ForYouClient listings={listings || []} isLoggedIn={isLoggedIn} />
      </div>
    </div>
  )
}
