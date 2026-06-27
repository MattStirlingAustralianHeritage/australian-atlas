/**
 * Operator-suggested trail — read helper.
 *
 * Resolves the single PUBLISHED operator trail for a listing, fully hydrated
 * with its ordered stops (each a live listing: name, slug, vertical, coords,
 * image, plus the operator's per-stop note). Reads the curated public views
 * (migration 189), so the base trails / trail_stops tables stay RLS-locked.
 *
 * Works with any Supabase client:
 *   - the portal place page passes the service-role admin client;
 *   - (the vertical reads the same two views via its own anon portal client —
 *     see the vertical's lib/portal-data.js getPortalListingTrail).
 *
 * Returns null when the listing has no published operator trail.
 */

const TRAIL_COLS =
  'id, listing_id, slug, title, intro, description, region_id, region, stop_count, vertical_mix, updated_at'
const STOP_COLS =
  'trail_id, position, editorial_copy, listing_id, venue_name, venue_slug, vertical, sub_type, venue_lat, venue_lng, venue_image_url'

export async function readOperatorTrailForListing(client, listingId) {
  if (!client || !listingId) return null

  const { data: trail, error } = await client
    .from('operator_trails_public')
    .select(TRAIL_COLS)
    .eq('listing_id', listingId)
    .maybeSingle()

  if (error || !trail) return null

  const { data: stops } = await client
    .from('operator_trail_stops_public')
    .select(STOP_COLS)
    .eq('trail_id', trail.id)
    .order('position', { ascending: true })

  const ordered = (stops || []).filter(
    s => s.venue_lat != null && s.venue_lng != null && s.venue_slug
  )

  // A trail with fewer than two resolvable stops isn't a trail — hide it.
  if (ordered.length < 2) return null

  return { ...trail, stops: ordered }
}
