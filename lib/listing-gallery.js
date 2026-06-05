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

import { filterPaidListingIds } from '@/lib/picks/producerPicks'

export const GALLERY_BUCKET = 'listing-images'
export const MAX_GALLERY_PHOTOS = 15

export function galleryManifestPath(listingId) {
  return `listings/gallery/${listingId}/manifest.json`
}

// Read the ordered URL list for a listing. Returns [] when no gallery exists,
// the manifest is unreadable, or the listing id is missing. `sb` must be a
// master-portal client (service role recommended — bypasses storage policies).
export async function readGallery(sb, listingId) {
  if (!listingId) return []
  const { data, error } = await sb.storage
    .from(GALLERY_BUCKET)
    .download(galleryManifestPath(listingId))
  if (error || !data) return []
  try {
    const arr = JSON.parse(await data.text())
    return Array.isArray(arr) ? arr.filter(u => typeof u === 'string' && u) : []
  } catch {
    return []
  }
}

// Overwrite the ordered URL list for a listing (master-only write). Dedupes,
// drops blanks, and caps at MAX_GALLERY_PHOTOS. Returns the persisted array.
// Throws on a storage failure so the caller can surface it.
export async function writeGallery(sb, listingId, urls) {
  if (!listingId) throw new Error('listingId is required')
  const clean = []
  for (const u of Array.isArray(urls) ? urls : []) {
    if (typeof u === 'string' && u && !clean.includes(u)) clean.push(u)
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

// Is this listing PAID — i.e. does it hold an active standard claim? This is
// the canonical "may use paid perks" signal (see filterPaidListingIds).
export async function isListingPaid(sb, listingId) {
  if (!listingId) return false
  const set = await filterPaidListingIds(sb, [listingId])
  return set.has(listingId)
}
