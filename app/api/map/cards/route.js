import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { excludeNeedsReview, excludeTestListings } from '@/lib/listings/publicFilter'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'

// Card hydration for the /map discovery panel and pin preview cards.
//
// The cached /api/map pin payload stays deliberately slim (no image URLs —
// ~7k rows are shipped to every visitor), so the panel asks for the visual
// fields of just the listings actually on screen, in small id batches. The
// response ships a display-ready `image` (source-whitelisted AND moderation-
// gated server-side) so no client surface can accidentally render a rejected
// or unapproved-host hero.

const MAX_IDS = 60
const UUID_RE = /^[0-9a-f-]{32,40}$/i

export async function GET(request) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids') || ''
  const locale = url.searchParams.get('locale')
  const ids = [...new Set(idsParam.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)))].slice(0, MAX_IDS)
  if (!ids.length) return NextResponse.json({ cards: {} })

  try {
    const sb = getSupabaseAdmin()
    // Same public gate as the pin payload — ids arrive from the client, so
    // this must not become a side door around the /api/map visibility filter.
    let query = sb.from('listings')
      .select('id, name, description, hero_image_url, image_moderation_status, suburb, editors_pick')
      .in('id', ids)
      .eq('status', 'active')
      .in('vertical', getPublicVerticals())
    query = excludeNeedsReview(query)
    query = excludeTestListings(query)
    const { data, error } = await query
    if (error) throw error

    // Korean launch: overlay translated name/description for the active locale
    // (English default unchanged). Fail-open + batched; other fields untouched.
    const rows = await overlayListingTranslations(data || [], locale, sb)

    const cards = {}
    for (const l of rows) {
      cards[l.id] = {
        name: l.name || null,
        description: l.description ? String(l.description).slice(0, 160) : null,
        image: isApprovedImageSource(l.hero_image_url) && isHeroDisplayable(l) ? l.hero_image_url : null,
        suburb: l.suburb || null,
        editors_pick: l.editors_pick === true,
      }
    }
    return NextResponse.json(
      { cards },
      // Card data changes on the same ~6h sync cadence as the pins. Batches
      // are id-sorted client-side so repeat viewports hit the same CDN key.
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    console.error('[map/cards] error:', err.message)
    return NextResponse.json({ cards: {} }, { status: 200 })
  }
}
