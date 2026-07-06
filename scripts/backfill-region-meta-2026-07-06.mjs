#!/usr/bin/env node

/**
 * Backfill missing region metadata for live regions — no AI involved,
 * everything is derived from real listing rows:
 *
 *  1. center_lat / center_lng / map_zoom where NULL — median of the region's
 *     active listing coordinates (median resists geocode outliers), zoom from
 *     the coordinate span. Without a centroid the /regions index card can't
 *     render its map and falls back to a flat tile.
 *
 *  2. description where NULL/empty — grounded template naming the real place
 *     count and the region's top verticals. Feeds <meta name=description>,
 *     og:description and the Place JSON-LD on /regions/[slug].
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-region-meta-2026-07-06.mjs           # dry run
 *   node --env-file=.env.local scripts/backfill-region-meta-2026-07-06.mjs --apply
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STATE_LABELS = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'the Australian Capital Territory', NT: 'the Northern Territory',
}

// Plain-English phrases per vertical for the description template.
const VERTICAL_PHRASES = {
  sba: 'small-batch producers',
  fine_grounds: 'coffee roasters',
  collection: 'galleries and museums',
  craft: 'makers and studios',
  rest: 'boutique stays',
  field: 'nature experiences',
  corner: 'independent shops',
  found: 'vintage and secondhand finds',
  table: 'independent dining',
  way: 'guided experiences',
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Rough zoom from coordinate span — matches the 7–10 range the existing
// hand-set regions use (bigger span → lower zoom).
function zoomForSpan(latSpan, lngSpan, atLat) {
  const span = Math.max(latSpan, lngSpan * Math.cos((atLat * Math.PI) / 180))
  if (span > 3) return 7
  if (span > 1.5) return 8
  if (span > 0.6) return 9
  return 10
}

function buildDescription(region, count, verticalCounts) {
  const top = Object.entries(verticalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([v]) => VERTICAL_PHRASES[v])
    .filter(Boolean)
  const stateLabel = STATE_LABELS[region.state] || region.state
  const kinds = top.length ? top.join(', ') : 'independent places'
  return `${count} independent places across ${region.name}, ${stateLabel} — ${kinds} — mapped by Australian Atlas.`
}

const { data: regions, error } = await supabase
  .from('regions')
  .select('id, name, slug, state, listing_count, center_lat, center_lng, map_zoom, description')
  .eq('status', 'live')
if (error) { console.error(error); process.exit(1) }

let centroids = 0
let descriptions = 0

for (const region of regions) {
  const needsCentroid = region.center_lat == null || region.center_lng == null
  const needsDescription = !(region.description || '').trim()
  if (!needsCentroid && !needsDescription) continue

  const { data: listings } = await supabase
    .from('listings_with_region')
    .select('vertical, lat, lng')
    .eq('status', 'active')
    .eq('region_id', region.id)
    .limit(500)
  const rows = listings || []
  const update = {}

  if (needsCentroid) {
    const coords = rows.filter(l => l.lat != null && l.lng != null)
    if (coords.length >= 3) {
      const lats = coords.map(l => l.lat)
      const lngs = coords.map(l => l.lng)
      const lat = median(lats)
      const lng = median(lngs)
      update.center_lat = Math.round(lat * 1e6) / 1e6
      update.center_lng = Math.round(lng * 1e6) / 1e6
      if (region.map_zoom == null) {
        update.map_zoom = zoomForSpan(
          Math.max(...lats) - Math.min(...lats),
          Math.max(...lngs) - Math.min(...lngs),
          lat
        )
      }
      centroids++
    } else {
      console.log(`[${region.slug}] centroid skipped — only ${coords.length} located listings`)
    }
  }

  if (needsDescription) {
    const verticalCounts = {}
    for (const l of rows) verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
    const count = region.listing_count || rows.length
    if (count > 0) {
      update.description = buildDescription(region, count, verticalCounts)
      descriptions++
    }
  }

  if (Object.keys(update).length === 0) continue
  console.log(`[${region.slug}]`, JSON.stringify(update))
  if (apply) {
    const { error: upErr } = await supabase.from('regions').update(update).eq('id', region.id)
    if (upErr) { console.error(`[${region.slug}] UPDATE FAILED: ${upErr.message}`); process.exit(1) }
  }
}

console.log(`\nDone${apply ? '' : ' (dry run)'}: ${centroids} centroids, ${descriptions} descriptions`)
