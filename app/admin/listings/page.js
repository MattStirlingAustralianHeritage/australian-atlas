import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ListingEditor from './ListingEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Editor — Admin' }

export default async function ListingsPage() {
  const sb = getSupabaseAdmin()

  // Initial listings (first 25, sorted by recently updated)
  let listings = []
  let total = 0

  try {
    const { data, error, count } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(0, 24)

    if (!error && data) {
      listings = data
      total = count || 0
    }
  } catch (err) {
    console.error('[admin/listings] Query error:', err.message)
  }

  // Get regions for filter dropdown
  let regions = []
  try {
    const { data } = await sb
      .from('listings')
      .select('region')
      .not('region', 'is', null)
      .order('region')

    if (data) {
      regions = [...new Set(data.map(r => r.region).filter(Boolean))].sort()
    }
  } catch (err) {
    console.error('[admin/listings] Regions query error:', err.message)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Listing Editor
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Browse and edit live listings across the Atlas Network.
        </p>
      </div>

      <ListingEditor initialListings={listings} initialTotal={total} regions={regions} />
    </div>
  )
}
