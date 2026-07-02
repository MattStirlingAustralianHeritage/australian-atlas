// Shared image gate for Discover cards. A card renders photographically ONLY
// when its hero passes BOTH standard gates (the approved-host allowlist and
// the moderation veto — same pair ListingCard uses); otherwise the typographic
// tinted card renders. The deck also uses this to preload upcoming heroes.

import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'

export function getCardImage(listing) {
  const url = listing?.hero_image_url
  if (!url) return null
  if (!isApprovedImageSource(url)) return null
  if (!isHeroDisplayable(listing)) return null
  return url
}
