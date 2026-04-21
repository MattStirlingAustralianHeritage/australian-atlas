#!/usr/bin/env node
/**
 * One-time backfill to fix Field Atlas sync drift.
 *
 * Two fix directions:
 *   A) Portal→Portal: Fill null sub_type on portal listings from Field Atlas's place_type
 *   B) Portal→Vertical: Push correct place_type back to Field Atlas where a bad
 *      VERTICAL_CATEGORIES fallback wrote "lookout" over the real type
 *
 * Usage:
 *   node scripts/backfill-field-sync.mjs --dry-run   # preview changes
 *   node scripts/backfill-field-sync.mjs              # apply changes
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const portal = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const field = createClient(
  process.env.FIELD_SUPABASE_URL,
  process.env.FIELD_SUPABASE_SERVICE_KEY
)

const dryRun = process.argv.includes('--dry-run')

async function fetchAll(client, table, select, filters = {}) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    let q = client.from(table).select(select).range(from, from + PAGE - 1)
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw new Error(`Fetch ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Field Atlas Sync Backfill ${dryRun ? '(DRY RUN)' : '(LIVE)'} ===\n`)

  const portalListings = await fetchAll(portal, 'listings',
    'id, name, slug, sub_type, source_id, status',
    { vertical: 'field' }
  )
  console.log(`Portal Field listings: ${portalListings.length}`)

  const metaRows = await fetchAll(portal, 'field_meta', 'listing_id, feature_type', {})
  const metaByListingId = Object.fromEntries(metaRows.map(m => [m.listing_id, m]))

  const fieldPlaces = await fetchAll(field, 'places', 'id, name, slug, place_type', {})
  const fieldById = Object.fromEntries(fieldPlaces.map(p => [String(p.id), p]))
  console.log(`Field Atlas places: ${fieldPlaces.length}`)

  // --- Direction A: Fix portal sub_type nulls from Field Atlas ---
  let portalFixed = 0
  let metaFixed = 0

  for (const listing of portalListings) {
    if (!listing.source_id || listing.source_id.startsWith('candidate-')) continue

    const place = fieldById[listing.source_id]
    if (!place || !place.place_type) continue

    // Fix null sub_type on portal
    if (!listing.sub_type && place.place_type) {
      console.log(`  [A] ${listing.slug}: sub_type null → ${place.place_type}`)
      if (!dryRun) {
        const { error } = await portal
          .from('listings')
          .update({ sub_type: place.place_type })
          .eq('id', listing.id)
        if (error) console.error(`    ERROR: ${error.message}`)
        else portalFixed++
      } else {
        portalFixed++
      }
    }

    // Fix field_meta.feature_type if null or mismatched with Field Atlas
    const meta = metaByListingId[listing.id]
    if (meta && !meta.feature_type && place.place_type) {
      console.log(`  [A] ${listing.slug}: field_meta.feature_type null → ${place.place_type}`)
      if (!dryRun) {
        const { error } = await portal
          .from('field_meta')
          .update({ feature_type: place.place_type })
          .eq('listing_id', listing.id)
        if (error) console.error(`    ERROR: ${error.message}`)
        else metaFixed++
      } else {
        metaFixed++
      }
    }
  }

  console.log(`\n  Direction A (portal sub_type backfill): ${portalFixed} listings, ${metaFixed} meta rows`)

  // --- Direction B: Push correct type from portal back to Field Atlas ---
  // These are listings where portal has a real type (botanic_garden, nature_reserve,
  // wildlife_zoo, bush_walk) but Field Atlas has "lookout" from the stale
  // VERTICAL_CATEGORIES default fallback.
  let verticalFixed = 0
  const verticalFixes = []

  for (const listing of portalListings) {
    if (!listing.source_id || listing.source_id.startsWith('candidate-')) continue
    if (!listing.sub_type) continue

    const place = fieldById[listing.source_id]
    if (!place) continue

    // Only fix if portal type differs from Field Atlas AND Field Atlas has the old default
    if (listing.sub_type !== place.place_type && place.place_type === 'lookout') {
      verticalFixes.push({
        placeId: place.id,
        slug: listing.slug,
        from: place.place_type,
        to: listing.sub_type,
      })
    }
  }

  for (const fix of verticalFixes) {
    console.log(`  [B] ${fix.slug}: Field Atlas place_type ${fix.from} → ${fix.to}`)
    if (!dryRun) {
      const { error } = await field
        .from('places')
        .update({ place_type: fix.to })
        .eq('id', fix.placeId)
      if (error) console.error(`    ERROR: ${error.message}`)
      else verticalFixed++
    } else {
      verticalFixed++
    }
  }

  console.log(`\n  Direction B (Field Atlas place_type correction): ${verticalFixed} places`)

  console.log(`\n=== Backfill ${dryRun ? 'preview' : 'complete'} ===\n`)
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
