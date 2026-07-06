import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'
import { excludeNeedsReview, excludeTestListings, isPublicListing } from '@/lib/listings/publicFilter'
import { nameMatchesQuery } from '@/lib/search/nameMatch'

// Nicely-pluralised labels for the common categories; everything else falls back
// to a title-cased "<words>s". Used for the category suggestion chips.
const CATEGORY_LABELS = {
  chocolatier: 'Chocolatiers', brewery: 'Breweries', winery: 'Wineries',
  distillery: 'Distilleries', cidery: 'Cideries', roaster: 'Coffee roasters',
  cafe: 'Cafés', bakery: 'Bakeries', creamery: 'Cheesemakers', restaurant: 'Restaurants',
  bookshop: 'Bookshops', records: 'Record stores', museum: 'Museums', gallery: 'Galleries',
  op_shop: 'Op shops', antiques: 'Antique dealers', vintage_clothing: 'Vintage clothing',
  boutique_hotel: 'Boutique hotels', cottage: 'Cottages', glamping: 'Glamping',
  farm_stay: 'Farm stays', waterfall: 'Waterfalls', lookout: 'Lookouts',
  national_park: 'National parks', swimming_hole: 'Swimming holes',
}
function pluralize(word) {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies'
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es'
  return word + 's'
}
function categoryLabel(subType) {
  if (CATEGORY_LABELS[subType]) return CATEGORY_LABELS[subType]
  const words = String(subType || '').replace(/_/g, ' ').trim()
  if (!words) return 'Places'
  const parts = words.split(' ')
  parts[parts.length - 1] = pluralize(parts[parts.length - 1])
  return parts.join(' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  const sb = getSupabaseAdmin()
  const prefix = q.trim()
  // PostgREST .or() reserved chars (, . : ( ) and LIKE wildcards) — strip them so
  // a crafted `q` can't break out of the filter grammar below.
  const safe = prefix.replace(/[,.:()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!safe) return NextResponse.json({ results: [] })

  try {
    const publicVerticals = getPublicVerticals()
    // Parallel: name prefix matches, suburb matches, region matches, category matches.
    // The listings queries apply the SAME public-visibility gate as the
    // /place/[slug] detail page (status=active + needs_review≠true + public
    // vertical + no admin fixtures) so autocomplete never suggests a place that
    // 404s on click (the original Port Fairy bug).
    const [nameRes, suburbRes, regionRes, catRes] = await Promise.all([
      excludeTestListings(excludeNeedsReview(
        sb.from('listings')
          .select(`id, name, slug, vertical, region, state, suburb, ${LISTING_REGION_SELECT}`)
          .eq('status', 'active')
          .in('vertical', publicVerticals)
          .or(`name.ilike.${safe}%,name.ilike.% ${safe}%`)
      ))
        .order('quality_score', { ascending: false, nullsFirst: false })
        .order('is_claimed', { ascending: false })
        .limit(6),

      excludeTestListings(excludeNeedsReview(
        sb.from('listings')
          .select(`suburb, state, region, ${LISTING_REGION_SELECT}`)
          .eq('status', 'active')
          .in('vertical', publicVerticals)
          .not('suburb', 'is', null)
          .ilike('suburb', `${prefix}%`)
      ))
        .limit(20),

      sb.from('regions')
        .select('name, state, slug')
        .ilike('name', `${prefix}%`)
        .limit(5),

      // Category suggestions: a typed term that appears in a category's synonym
      // bag ("brew" -> Breweries, "choc" -> Chocolatiers).
      sb.from('listing_category_synonyms')
        .select('vertical, sub_type')
        .not('sub_type', 'is', null)
        .or(`terms.ilike.${safe}%,terms.ilike.% ${safe}%`)
        .limit(8),
    ])

    // Deduplicate suburbs
    const seenSuburbs = new Set()
    const suburbs = (suburbRes.data || [])
      .filter(s => {
        const key = `${s.suburb}|${s.state}`
        if (seenSuburbs.has(key)) return false
        seenSuburbs.add(key)
        return true
      })
      .slice(0, 3)
      .map(s => ({
        type: 'suburb',
        label: s.suburb,
        state: s.state,
        region: getListingRegion(s)?.name ?? null,
      }))

    let places = (nameRes.data || []).slice(0, 4).map(l => ({
      type: 'place',
      id: l.id,
      label: l.name,
      slug: l.slug,
      vertical: l.vertical,
      region: getListingRegion(l)?.name ?? null,
      state: l.state,
      suburb: l.suburb,
    }))

    // Typo-tolerant fallback: when the prefix match is thin, reuse the hybrid
    // RPC's trigram fuzzy arm so a misspelt name ("Breww") still suggests venues.
    // Its lexical arm is OR-recall, so each candidate must ALSO pass the
    // all-tokens name gate — otherwise "australiana themed earrings" pads the
    // dropdown with single-token flukes (Australiana Pioneer Village, a Theme
    // Park…) that read as name matches. No genuine match → no Places section.
    if (places.length < 3) {
      const { data: fuzzy } = await sb.rpc('search_listings_hybrid', {
        query_embedding: null, query_text: safe, match_count: 6,
        include_way: isVerticalPublic('way'),
      })
      const seen = new Set(places.map(p => p.id))
      for (const l of (fuzzy || [])) {
        if (places.length >= 4) break
        if (seen.has(l.id) || !isPublicListing(l) || !publicVerticals.includes(l.vertical)) continue
        if (!nameMatchesQuery(prefix, l.name, { suburb: l.suburb, state: l.state })) continue
        seen.add(l.id)
        places.push({
          type: 'place', id: l.id, label: l.name, slug: l.slug, vertical: l.vertical,
          region: l.region ?? null, state: l.state, suburb: l.suburb,
        })
      }
    }

    const regions = (regionRes.data || []).map(r => ({
      type: 'region',
      label: r.name,
      slug: r.slug,
      state: r.state,
    }))

    // Distinct categories (by sub_type), best-known label, searched as the plain words.
    const seenCat = new Set()
    const categories = []
    for (const c of (catRes.data || [])) {
      if (!c.sub_type || seenCat.has(c.sub_type)) continue
      seenCat.add(c.sub_type)
      categories.push({
        type: 'category',
        label: categoryLabel(c.sub_type),
        query: String(c.sub_type).replace(/_/g, ' '),
      })
      if (categories.length >= 3) break
    }

    // Server order = render order (region/suburb first when the user is typing a
    // place name; categories and venues follow).
    return NextResponse.json({
      results: [...regions, ...suburbs, ...categories, ...places],
    })
  } catch (err) {
    console.error('[autocomplete] Error:', err)
    return NextResponse.json({ results: [] })
  }
}
