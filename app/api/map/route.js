import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeNeedsReview, excludeTestListings } from '@/lib/listings/publicFilter'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { readGallery } from '@/lib/listing-gallery'

// Pin data only changes on sync (~every 6h), so hold the CDN copy for an hour
// and serve stale for a day while it revalidates. This keeps all but a handful
// of cold-edge loads on the fast warm path — a MISS used to block the whole
// /map "Loading the atlas…" state on the multi-second origin fetch below.
export const revalidate = 3600

// Kept in sync with lib/listings/publicFilter.js (excludeTestListings) — the
// value is passed to the RPC so the SQL filter matches the JS fallback exactly.
const TEST_SLUG_PREFIX = 'admin'

// Fallback pin fetch — only runs if the map_pins RPC is unavailable (not yet
// migrated on a fresh DB / PostgREST schema cache cold). Paginates the listings
// table 1000 rows at a time, ordered by id so pages can't overlap or skip.
async function fetchPinsFallback(sb) {
  const hasVerticals = await relationHasVerticals(sb, 'listings')
  const PAGE_SIZE = 1000
  const cols = `id, vertical, ${hasVerticals ? 'verticals, ' : ''}name, slug, description, region, state, lat, lng, is_featured, is_claimed, sub_type, trail_suitable`
  const filters = [
    q => q.eq('status', 'active'),
    q => q.in('vertical', getPublicVerticals()),
    q => excludeNeedsReview(q),
    q => excludeTestListings(q),
    q => q.not('lat', 'is', null),
    q => q.not('lng', 'is', null),
    q => q.or('address_on_request.eq.false,address_on_request.is.null'),
    // Online-only / markets-only makers have no street address — their pin is a
    // bare locality centroid, so a city's worth of them stacks on one point.
    q => q.or('visitable.eq.true,visitable.is.null'),
    // Stable sort — without it, PostgREST .range() pages can overlap/skip rows,
    // duplicating some pins and dropping others.
    q => q.order('id', { ascending: true }),
  ]
  let all = []
  let page = 0
  while (true) {
    let query = sb.from('listings').select(cols).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    for (const f of filters) query = f(query)
    const { data, error } = await query
    if (error) { console.error(`[map] fallback page ${page} error:`, error.message); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all.map(l => ({ ...l, description: l.description ? String(l.description).slice(0, 160) : null }))
}

export async function GET(request) {
  try {
    const sb = getSupabaseAdmin()
    const locale = new URL(request.url).searchParams.get('locale')

    // Only ship listings for verticals that are publicly live — the
    // authoritative no-leak boundary, read server-side and passed to the RPC.
    const publicVerticals = getPublicVerticals()

    // Fast path: one round trip. map_pins() applies the identical public filter
    // (status/vertical/needs_review/test-slug/lat-lng/address-on-request/visitable), trims
    // description to 160 chars IN SQL so full editorial bodies never leave the
    // DB, and returns every matching listing exactly once (no pagination = no
    // duplicated or dropped pins). See supabase/migrations/199_map_pins_rpc.sql
    // and 203_map_pins_visitable.sql.
    let listings = null
    const { data, error } = await sb.rpc('map_pins', {
      p_verticals: publicVerticals,
      p_test_prefix: TEST_SLUG_PREFIX,
    })
    if (error) {
      console.error('[map] map_pins RPC failed, falling back to pagination:', error.message)
    } else {
      listings = Array.isArray(data) ? data : []
    }

    if (listings === null) {
      listings = await fetchPinsFallback(sb)
    }

    // Claimed = active row in listing_claims (any tier), overlaid onto the pin
    // rows. The listings.is_claimed column is NOT a reliable render signal —
    // it is false on paying listings — so the claims table is the source of
    // truth here, same as the /place paid-perk gate. Claimed pins also carry
    // their card image inline (hero when it passes the approved-source +
    // moderation gates, else the first clean gallery photo) so the seal card
    // never races the /api/map/cards hydration. The claimed set is tiny, so
    // the per-listing lookups are fine under ISR.
    const { data: claimRows } = await sb
      .from('listing_claims')
      .select('listing_id')
      .eq('status', 'active')
    const claimedIds = new Set((claimRows || []).map(r => r.listing_id))
    if (claimedIds.size) {
      const claimedImage = new Map()
      const { data: heroRows } = await sb
        .from('listings')
        .select('id, hero_image_url, image_moderation_status')
        .in('id', [...claimedIds])
      for (const r of heroRows || []) {
        if (r.hero_image_url && isApprovedImageSource(r.hero_image_url) && isHeroDisplayable(r)) {
          claimedImage.set(r.id, r.hero_image_url)
        }
      }
      await Promise.all([...claimedIds]
        .filter(id => !claimedImage.has(id))
        .map(async (id) => {
          const [url] = await readGallery(sb, id)
          if (url) claimedImage.set(id, url)
        }))
      listings = listings.map(l => claimedIds.has(l.id)
        ? { ...l, is_claimed: true, image_url: claimedImage.get(l.id) || null }
        : l)
    }

    // Korean launch: overlay translated name/description onto the pin set for
    // the active locale (English default unchanged). Fail-open + batched.
    listings = await overlayListingTranslations(listings, locale, sb)

    return NextResponse.json(
      { listings, total: listings.length },
      // The pin payload is the heaviest fetch on / and /map and only changes on
      // sync. Let the CDN absorb repeat loads; SWR keeps it fresh enough.
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    console.error('[map] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
