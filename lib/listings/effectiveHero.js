import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { filterPaidListingIds, readGallery } from '@/lib/listing-gallery'

// ── Effective hero for listing-card DTOs ────────────────────────────────────
//
// A PAID claimed venue may carry no operator hero on `listings.hero_image_url`
// yet still have a photo library (the gallery manifest — a paid perk). The place
// page already renders such a venue's FIRST clean gallery photo as its hero
// (`heroPhotos = [hero_image_url, ...galleryUrls]` in app/place/[slug]/page.js),
// and the autocomplete dropdown does the same for its suggestion cards. Every
// OTHER card surface, however, reads `hero_image_url` alone — so the same claimed
// venue that shows a photo on its detail page renders a blank typographic
// placeholder in search results, the map, etc. This closes that gap.
//
// For each DTO that lacks a displayable operator hero, if the listing is PAID
// (a live `standard` claim) we fill `hero_image_url` with the first clean,
// host-approved gallery photo. Purely read-time: it mutates the response DTO,
// never the stored row, so it can't be synced to a vertical and a lapsed
// subscription simply loses the fallback again (the gallery is withheld). Gating
// on the paid set means a normal (unclaimed) listing does exactly one cheap
// membership check and never touches storage — behaviour is unchanged for it.
//
// `sb` must be a master-portal service-role client (readGallery bypasses storage
// policies; filterPaidListingIds reads listing_claims on master).
export async function attachGalleryHeroes(sb, listings) {
  const arr = Array.isArray(listings) ? listings : []
  // Only listings that DON'T already have a displayable operator hero are candidates.
  const needing = arr.filter(
    (l) => l && l.id && !(isApprovedImageSource(l.hero_image_url) && isHeroDisplayable(l))
  )
  if (!needing.length) return listings

  const paidSet = await filterPaidListingIds(sb, needing.map((l) => l.id))
  if (!paidSet.size) return listings

  await Promise.all(
    needing
      .filter((l) => paidSet.has(l.id))
      .map(async (l) => {
        const gallery = await readGallery(sb, l.id).catch(() => [])
        const hero = gallery.find(isApprovedImageSource)
        if (hero) {
          l.hero_image_url = hero
          // The injected image is a clean gallery photo — mark it explicitly so
          // every card's isHeroDisplayable() gate passes regardless of the (now
          // irrelevant) operator-hero moderation status.
          l.image_moderation_status = 'clean'
          l.hero_from_gallery = true
        }
      })
  )
  return listings
}
