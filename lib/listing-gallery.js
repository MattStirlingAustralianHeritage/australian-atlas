// Listing photo gallery — paid-tier perk.
//
// Storage model: an ordered JSON manifest of public image URLs, kept in the
// existing public `listing-images` bucket at `listings/gallery/{id}/manifest.json`.
// This is deliberately NOT a listings column — the master DB password is voided
// for DDL (region move), so no column can be added; and like `listings.hours`,
// the gallery must be master-only (never written to a vertical source DB) so an
// inbound sync can't clobber it. A storage manifest satisfies both: it lives
// outside every DB and is read/written only by the portal.
//
// Capacity is gated in the app layer to PAID listings (an active `standard`
// claim in listing_claims — the same signal Producer's Picks uses). The store
// itself is neutral; callers enforce the gate before writing.

export const GALLERY_BUCKET = 'listing-images'
export const MAX_GALLERY_PHOTOS = 15

export function galleryManifestPath(listingId) {
  return `listings/gallery/${listingId}/manifest.json`
}

const GALLERY_STATUSES = ['clean', 'flagged', 'held', 'pending']

// Normalise a raw manifest item to a moderation-aware entry, or null to drop it.
// A legacy plain-string item is GRANDFATHERED to 'clean' (it pre-dates moderation
// and is already live). An object item must carry a known status; an unknown one
// fails closed to 'held'. See lib/moderation/imageModeration.js + migration 164.
function normaliseGalleryEntry(raw) {
  if (typeof raw === 'string') {
    return raw
      ? { url: raw, status: 'clean', category: 'clean', reason: 'grandfathered: pre-moderation gallery image', confidence: null, checked_at: null }
      : null
  }
  if (raw && typeof raw === 'object' && typeof raw.url === 'string' && raw.url) {
    return {
      url: raw.url,
      status: GALLERY_STATUSES.includes(raw.status) ? raw.status : 'held',
      category: raw.category ?? null,
      reason: raw.reason ?? null,
      confidence: raw.confidence ?? null,
      checked_at: raw.checked_at ?? null,
    }
  }
  return null
}

// Read the FULL ordered gallery as moderation-aware entries
// ({ url, status, category, reason, confidence, checked_at }). Returns [] when
// no gallery exists / the manifest is unreadable / the id is missing. `sb` must
// be a master-portal client (service role recommended — bypasses storage policies).
export async function readGalleryEntries(sb, listingId) {
  if (!listingId) return []
  const { data, error } = await sb.storage
    .from(GALLERY_BUCKET)
    .download(galleryManifestPath(listingId))
  if (error || !data) return []
  try {
    const arr = JSON.parse(await data.text())
    if (!Array.isArray(arr)) return []
    const out = []
    const seen = new Set()
    for (const item of arr) {
      const e = normaliseGalleryEntry(item)
      if (!e || seen.has(e.url)) continue
      seen.add(e.url)
      out.push(e)
      if (out.length >= MAX_GALLERY_PHOTOS) break
    }
    return out
  } catch {
    return []
  }
}

// Read the ordered URL list that is SAFE TO DISPLAY publicly — i.e. only entries
// whose moderation status is 'clean' (grandfathered legacy images included).
// Backward-compatible string[] return, so existing public consumers gate
// automatically with no change. Anything flagged/held/pending is withheld.
export async function readGallery(sb, listingId) {
  const entries = await readGalleryEntries(sb, listingId)
  return entries.filter(e => e.status === 'clean').map(e => e.url)
}

// Worst-of roll-up across a set of gallery entries, for the queryable marker on
// listings.gallery_moderation_status. Returns null for an empty gallery.
export function galleryModerationStatus(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null
  if (entries.some(e => e.status === 'flagged')) return 'flagged'
  if (entries.some(e => e.status === 'held')) return 'held'
  if (entries.some(e => e.status === 'pending')) return 'pending'
  return 'clean'
}

// Overwrite the gallery manifest with moderation-aware entries (master-only
// write). Dedupes by url, drops invalid items, caps at MAX_GALLERY_PHOTOS.
// Returns the persisted entries. Throws on a storage failure.
export async function writeGalleryEntries(sb, listingId, entries) {
  if (!listingId) throw new Error('listingId is required')
  const clean = []
  const seen = new Set()
  for (const item of Array.isArray(entries) ? entries : []) {
    const e = normaliseGalleryEntry(item)
    if (!e || seen.has(e.url)) continue
    seen.add(e.url)
    clean.push(e)
    if (clean.length >= MAX_GALLERY_PHOTOS) break
  }
  const body = Buffer.from(JSON.stringify(clean))
  const { error } = await sb.storage
    .from(GALLERY_BUCKET)
    .upload(galleryManifestPath(listingId), body, {
      contentType: 'application/json',
      cacheControl: '0',
      upsert: true,
    })
  if (error) throw new Error(error.message)
  return clean
}

// Backward-compatible URL-list writer. Marks each url 'pending' (NOT clean) so a
// non-moderated caller can never publish an unverified image — readGallery only
// returns 'clean' entries. The moderated save path uses writeGalleryEntries
// directly. Returns the persisted urls (string[]).
export async function writeGallery(sb, listingId, urls) {
  const entries = (Array.isArray(urls) ? urls : [])
    .filter(u => typeof u === 'string' && u)
    .map(url => ({ url, status: 'pending', reason: 'awaiting moderation' }))
  const saved = await writeGalleryEntries(sb, listingId, entries)
  return saved.map(e => e.url)
}

// Paid signal — the canonical "may use paid perks" state lives on listing_claims
// (an active `standard` claim), never on the listings row. Kept self-contained
// here (no cross-module import) so the gallery has no dependency on other perks.
const PAID_CLAIM_TIER = 'standard'

// Of the given listing ids, which hold an active standard claim. Returns a Set
// for O(1) membership tests. `sb` must be a master-portal client (listing_claims
// lives on master). On any query error the set is empty — callers fail closed.
export async function filterPaidListingIds(sb, listingIds) {
  const ids = [...new Set((listingIds || []).filter(Boolean))]
  if (!ids.length) return new Set()
  const { data } = await sb
    .from('listing_claims')
    .select('listing_id')
    .in('listing_id', ids)
    .eq('status', 'active')
    .eq('tier', PAID_CLAIM_TIER)
  return new Set((data || []).map(r => r.listing_id))
}

// Is this single listing PAID — i.e. does it hold an active standard claim?
export async function isListingPaid(sb, listingId) {
  if (!listingId) return false
  const set = await filterPaidListingIds(sb, [listingId])
  return set.has(listingId)
}
