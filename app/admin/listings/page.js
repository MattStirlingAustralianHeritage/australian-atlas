import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import ListingEditor from './ListingEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listing Editor — Admin' }

export default async function ListingsPage() {
  const sb = getSupabaseAdmin()

  // Initial listings (first 25, sorted by recently updated) and the regions
  // dropdown, fetched in parallel — they are independent, and serialising them
  // put both round-trips on the first paint's critical path.
  let listings = []
  let total = 0
  let regions = []

  const [listingsRes, regionsRes] = await Promise.allSettled([
    // Join the region FK relations (LISTING_REGION_SELECT) so the editor can
    // show the effective region (override ?? computed) — the same value the
    // public page shows — rather than the deprecated `region` text column.
    // Mirrors the GET /api/admin/listings select used for pagination.
    sb
      .from('listings')
      .select(`id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at, ${LISTING_REGION_SELECT}`, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(0, 24),

    // Regions for the filter + per-listing region dropdowns — pull canonical
    // names from the regions table (Phase 3 step 1). Restricted to assignable
    // statuses (live + draft): archived regions are retired, and — crucially —
    // updateListing's explicit-region path only resolves live/draft names to the
    // region_override_id FK. Offering an archived region here would let an admin
    // pick a value the save silently drops (it would land only in the dead
    // `region` text column, never on the public page). Keep the two in lockstep.
    sb
      .from('regions')
      .select('name')
      .in('status', ['live', 'draft'])
      .order('name'),
  ])

  if (listingsRes.status === 'fulfilled' && !listingsRes.value.error && listingsRes.value.data) {
    listings = listingsRes.value.data
    total = listingsRes.value.count || 0
  } else {
    console.error('[admin/listings] Query error:', listingsRes.status === 'fulfilled' ? listingsRes.value.error?.message : listingsRes.reason?.message)
  }

  if (regionsRes.status === 'fulfilled' && regionsRes.value.data) {
    regions = regionsRes.value.data.map(r => r.name).filter(Boolean)
  } else {
    console.error('[admin/listings] Regions query error:', regionsRes.status === 'fulfilled' ? regionsRes.value.error?.message : regionsRes.reason?.message)
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
