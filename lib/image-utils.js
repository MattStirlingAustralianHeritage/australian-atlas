const APPROVED_HOSTS = [
  'supabase.co',
  'storage.googleapis.com',
  'static.wixstatic.com',
  'images.squarespace-cdn.com',
  'cdn.shopify.com',
  'res.cloudinary.com',
  'i0.wp.com', 'i1.wp.com', 'i2.wp.com',
  'img1.wsimg.com',
  'imagekit.io',
  'imgix.net',
  'amazonaws.com',
  'framerusercontent.com',
  'wp.heide.com.au',
  'kakadu.gov.au',
  'cdn.sanity.io',
  'parks.vic.gov.au',
]

export function isApprovedImageSource(url) {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname
    return APPROVED_HOSTS.some(host => hostname.endsWith(host))
  } catch {
    return false
  }
}

// Statuses a hero image must NOT be in to be shown publicly. A new operator
// upload that the moderator (auto or human) rejected lands here. See migration
// 164 + lib/moderation/imageModeration.js.
const HIDDEN_MODERATION_STATUSES = ['flagged', 'held']

/**
 * Whether a listing's hero image is allowed to render publicly per moderation.
 *
 * SUBTRACTIVE + regression-free by design: it returns false ONLY when the row
 * carries an explicit 'flagged' or 'held' status. Everything else displays —
 * 'clean', the grandfathered live images (set to 'clean' in migration 164),
 * 'pending' auto-discovered heroes, and rows from queries that didn't select
 * image_moderation_status at all (the field is simply absent). This means a
 * surface that hasn't opted in still behaves exactly as before, and only the
 * images a moderator actually rejected are ever withheld.
 *
 * Callers should still pair this with isApprovedImageSource(url) as they do
 * today — this only adds the moderation veto on top.
 *
 * @param {{image_moderation_status?: string}|null|undefined} listing
 * @returns {boolean}
 */
export function isHeroDisplayable(listing) {
  const status = listing?.image_moderation_status
  if (!status) return true // absent / null / not selected → unchanged behaviour
  return !HIDDEN_MODERATION_STATUSES.includes(status)
}
