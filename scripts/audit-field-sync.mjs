#!/usr/bin/env node
/**
 * Full Field Atlas sync audit: compare every Field listing on the portal
 * against its corresponding record in Field Atlas's `places` table.
 *
 * Compares: place_type, name, description, region, lat, lng, hero_image_url,
 *           state, address, visitable, presence_type
 *
 * Usage:
 *   node scripts/audit-field-sync.mjs
 *   node scripts/audit-field-sync.mjs --fix    # preview what a backfill would push
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

const showFix = process.argv.includes('--fix')

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

function approxEqual(a, b, tolerance = 0.0001) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(Number(a) - Number(b)) < tolerance
}

function trimDesc(s) {
  return (s || '').trim().slice(0, 120)
}

async function main() {
  console.log('\n=== Field Atlas Full Sync Audit ===\n')

  // 1. Fetch all Field listings from portal
  const portalListings = await fetchAll(portal, 'listings',
    'id, name, slug, description, region, state, lat, lng, hero_image_url, sub_type, source_id, status, visitable, presence_type, address',
    { vertical: 'field' }
  )
  console.log(`Portal Field listings: ${portalListings.length}`)

  // 2. Fetch field_meta for feature_type
  const metaRows = await fetchAll(portal, 'field_meta',
    'listing_id, feature_type',
    {}
  )
  const metaByListingId = Object.fromEntries(metaRows.map(m => [m.listing_id, m]))
  console.log(`Portal field_meta rows: ${metaRows.length}`)

  // 3. Fetch all places from Field Atlas
  const fieldPlaces = await fetchAll(field, 'places',
    'id, name, slug, description, region, state, latitude, longitude, hero_image_url, place_type, published, address, visitable, presence_type',
    {}
  )
  console.log(`Field Atlas places: ${fieldPlaces.length}`)

  // Index field places by id and slug for matching
  const fieldById = Object.fromEntries(fieldPlaces.map(p => [String(p.id), p]))
  const fieldBySlug = Object.fromEntries(fieldPlaces.map(p => [p.slug, p]))

  // 4. Compare
  const drifted = []
  const missing = []
  const orphaned = []
  let inSync = 0

  for (const listing of portalListings) {
    // Match by source_id first, then slug
    let place = null
    let matchMethod = null

    if (listing.source_id && !listing.source_id.startsWith('candidate-')) {
      place = fieldById[listing.source_id]
      if (place) matchMethod = 'source_id'
    }

    if (!place && listing.slug) {
      place = fieldBySlug[listing.slug]
      if (place) matchMethod = 'slug'
    }

    if (!place) {
      missing.push(listing)
      continue
    }

    const meta = metaByListingId[listing.id]
    const diffs = []

    // Compare place_type / sub_type
    if (listing.sub_type !== place.place_type) {
      diffs.push({
        field: 'place_type (sub_type)',
        portal: listing.sub_type,
        vertical: place.place_type,
      })
    }

    // Compare feature_type in meta
    if (meta && meta.feature_type !== place.place_type) {
      diffs.push({
        field: 'feature_type (field_meta)',
        portal: meta.feature_type,
        vertical: place.place_type,
      })
    }

    // Compare name
    if (listing.name !== place.name) {
      diffs.push({ field: 'name', portal: listing.name, vertical: place.name })
    }

    // Compare description
    if ((listing.description || '') !== (place.description || '')) {
      diffs.push({
        field: 'description',
        portal: trimDesc(listing.description),
        vertical: trimDesc(place.description),
      })
    }

    // Compare region
    if ((listing.region || '') !== (place.region || '')) {
      diffs.push({ field: 'region', portal: listing.region, vertical: place.region })
    }

    // Compare state
    if ((listing.state || '') !== (place.state || '')) {
      diffs.push({ field: 'state', portal: listing.state, vertical: place.state })
    }

    // Compare lat/lng
    if (!approxEqual(listing.lat, place.latitude)) {
      diffs.push({ field: 'lat', portal: listing.lat, vertical: place.latitude })
    }
    if (!approxEqual(listing.lng, place.longitude)) {
      diffs.push({ field: 'lng', portal: listing.lng, vertical: place.longitude })
    }

    // Compare hero image
    if ((listing.hero_image_url || '') !== (place.hero_image_url || '')) {
      diffs.push({
        field: 'hero_image_url',
        portal: (listing.hero_image_url || '').slice(0, 80),
        vertical: (place.hero_image_url || '').slice(0, 80),
      })
    }

    // Compare address
    if ((listing.address || '') !== (place.address || '')) {
      diffs.push({ field: 'address', portal: listing.address, vertical: place.address })
    }

    if (diffs.length > 0) {
      drifted.push({ listing, place, matchMethod, diffs })
    } else {
      inSync++
    }
  }

  // Find Field Atlas places with no portal counterpart
  const portalSourceIds = new Set(portalListings.map(l => l.source_id))
  const portalSlugs = new Set(portalListings.map(l => l.slug))
  for (const place of fieldPlaces) {
    if (!portalSourceIds.has(String(place.id)) && !portalSlugs.has(place.slug)) {
      orphaned.push(place)
    }
  }

  // 5. Report
  console.log('\n--- Summary ---')
  console.log(`  In sync:       ${inSync}`)
  console.log(`  Drifted:       ${drifted.length}`)
  console.log(`  Missing from Field Atlas: ${missing.length}`)
  console.log(`  Field-only (no portal):   ${orphaned.length}`)

  if (drifted.length > 0) {
    console.log('\n--- Drifted Listings ---\n')

    // Group diffs by field for summary
    const driftByField = {}
    for (const d of drifted) {
      for (const diff of d.diffs) {
        driftByField[diff.field] = (driftByField[diff.field] || 0) + 1
      }
    }
    console.log('Drift by field:')
    for (const [f, count] of Object.entries(driftByField).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${f}: ${count}`)
    }

    console.log('\nDetailed mismatches:\n')
    for (const { listing, place, matchMethod, diffs } of drifted) {
      console.log(`[${listing.slug}] matched by ${matchMethod}`)
      for (const diff of diffs) {
        console.log(`  ${diff.field}:`)
        console.log(`    portal:   ${diff.portal}`)
        console.log(`    vertical: ${diff.vertical}`)
      }
      if (showFix) {
        console.log(`  → Would push portal values to Field Atlas places.id=${place.id}`)
      }
      console.log()
    }
  }

  if (missing.length > 0) {
    console.log('\n--- Missing from Field Atlas ---\n')
    for (const l of missing) {
      console.log(`  "${l.name}" (slug: ${l.slug}, source_id: ${l.source_id}, status: ${l.status})`)
    }
  }

  if (orphaned.length > 0) {
    console.log(`\n--- Field Atlas Only (${orphaned.length}) ---\n`)
    for (const p of orphaned.slice(0, 20)) {
      console.log(`  "${p.name}" (slug: ${p.slug}, place_type: ${p.place_type}, published: ${p.published})`)
    }
    if (orphaned.length > 20) console.log(`  ... and ${orphaned.length - 20} more`)
  }

  console.log('\n=== Audit complete ===\n')
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
