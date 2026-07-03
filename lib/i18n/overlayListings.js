import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { defaultLocale } from '@/lib/i18n/config'

// Korean launch (feat/ko-launch): overlay translated name/description onto a
// LIST of listing objects for the active locale, field-by-field, with English
// fallback (never blank). No-op for the default locale. One batched query
// (chunked past the 1000-id .in() cap). Fully resilient — on any error the
// original English listings are returned unchanged.
//
// Use anywhere a list of listings is rendered under /ko (home rows, region
// pages, discover, nearby, search results, related rows, collections, plans):
//   const locale = await getLocale()
//   listings = await overlayListingTranslations(listings, locale)
export async function overlayListingTranslations(listings, locale, sb = null) {
  if (!Array.isArray(listings) || listings.length === 0) return listings
  if (!locale || locale === defaultLocale) return listings

  const ids = [...new Set(listings.map((l) => l && l.id).filter(Boolean))]
  if (ids.length === 0) return listings

  try {
    const client = sb || getSupabaseAdmin()
    const map = new Map()
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000)
      const { data, error } = await client
        .from('listing_translations')
        .select('listing_id, name, description')
        .eq('locale', locale)
        .in('listing_id', chunk)
      if (error) continue
      for (const r of data || []) map.set(r.listing_id, r)
    }
    if (map.size === 0) return listings

    return listings.map((l) => {
      if (!l || !l.id) return l
      const tr = map.get(l.id)
      if (!tr) return l
      // Split name on cards: keep the English name (recognisable) and append the
      // Korean rendering in parentheses when it differs. Descriptions are fully
      // Korean (English fallback).
      const koName = tr.name && String(tr.name).trim() ? String(tr.name).trim() : null
      const name = koName && koName !== l.name ? `${l.name} (${koName})` : l.name
      return {
        ...l,
        name,
        name_ko: koName && koName !== l.name ? koName : null,
        description:
          tr.description && String(tr.description).trim() ? tr.description : l.description,
      }
    })
  } catch {
    return listings
  }
}
