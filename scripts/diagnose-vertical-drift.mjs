#!/usr/bin/env node
/**
 * Diagnose vertical drift: find listings where umbrella data diverges
 * from the vertical's own database.
 *
 * Usage:
 *   node scripts/diagnose-vertical-drift.mjs
 *   node scripts/diagnose-vertical-drift.mjs --slug arcadia-cottages-dandenong-ranges
 *
 * Requires: .env.local with all vertical Supabase URLs and service keys.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const VERTICAL_CONFIG = {
  sba:          { url: process.env.SBA_SUPABASE_URL,          key: process.env.SBA_SUPABASE_SERVICE_KEY,          table: 'venues',     descCol: 'description' },
  collection:   { url: process.env.COLLECTION_SUPABASE_URL,   key: process.env.COLLECTION_SUPABASE_SERVICE_KEY,   table: 'venues',     descCol: 'description' },
  craft:        { url: process.env.CRAFT_SUPABASE_URL,        key: process.env.CRAFT_SUPABASE_SERVICE_KEY,        table: 'venues',     descCol: 'description' },
  fine_grounds: { url: process.env.FINE_GROUNDS_SUPABASE_URL, key: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY, table: 'roasters',   descCol: 'description' },
  rest:         { url: process.env.REST_SUPABASE_URL,         key: process.env.REST_SUPABASE_SERVICE_KEY,         table: 'properties', descCol: 'description' },
  field:        { url: process.env.FIELD_SUPABASE_URL,        key: process.env.FIELD_SUPABASE_SERVICE_KEY,        table: 'places',     descCol: 'description' },
  corner:       { url: process.env.CORNER_SUPABASE_URL,       key: process.env.CORNER_SUPABASE_SERVICE_KEY,       table: 'shops',      descCol: 'description' },
  found:        { url: process.env.FOUND_SUPABASE_URL,        key: process.env.FOUND_SUPABASE_SERVICE_KEY,        table: 'shops',      descCol: 'description' },
  table:        { url: process.env.TABLE_SUPABASE_URL,        key: process.env.TABLE_SUPABASE_SERVICE_KEY,        table: 'listings',   descCol: 'description' },
}

const portal = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const slugFilter = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1]
  || (process.argv.indexOf('--slug') > -1 ? process.argv[process.argv.indexOf('--slug') + 1] : null)

async function main() {
  console.log('\n=== Vertical Drift Diagnosis ===\n')

  // 1. Find orphans (candidate- source_ids)
  const { data: orphans, error: orphanErr } = await portal
    .from('listings')
    .select('id, name, slug, vertical, source_id, status, created_at')
    .like('source_id', 'candidate-%')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (orphanErr) {
    console.error('Orphan query failed:', orphanErr.message)
  } else {
    console.log(`Orphaned listings (candidate- source_id): ${orphans.length}`)
    if (orphans.length > 0) {
      const byVertical = {}
      for (const o of orphans) {
        byVertical[o.vertical] = (byVertical[o.vertical] || 0) + 1
      }
      for (const [v, count] of Object.entries(byVertical).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${v}: ${count}`)
      }
      console.log(`  Latest: "${orphans[0].name}" (${orphans[0].vertical}, ${orphans[0].created_at})`)
    }
  }

  // 2. Spot-check specific slug or sample listings
  const query = portal.from('listings').select('id, name, slug, vertical, source_id, description, status')
    .eq('status', 'active')

  if (slugFilter) {
    query.eq('slug', slugFilter)
  } else {
    query.limit(5).order('updated_at', { ascending: false })
  }

  const { data: listings, error: listErr } = await query
  if (listErr) {
    console.error('Listing query failed:', listErr.message)
    return
  }

  if (listings.length === 0) {
    console.log(slugFilter ? `No listing found with slug: ${slugFilter}` : 'No active listings found')
    return
  }

  console.log(`\n--- Comparing ${listings.length} listing(s) ---\n`)

  let driftCount = 0
  for (const listing of listings) {
    const vc = VERTICAL_CONFIG[listing.vertical]
    if (!vc || !vc.url || !vc.key) {
      console.log(`[${listing.vertical}] ${listing.name}: SKIP (no vertical config)`)
      continue
    }

    const vertClient = createClient(vc.url, vc.key)
    let vertRow = null

    // Try by source_id first
    if (listing.source_id && !listing.source_id.startsWith('candidate-')) {
      const { data } = await vertClient.from(vc.table).select(`id, name, slug, ${vc.descCol}`).eq('id', listing.source_id).maybeSingle()
      vertRow = data
    }

    // Fallback: try by slug
    if (!vertRow) {
      const { data } = await vertClient.from(vc.table).select(`id, name, slug, ${vc.descCol}`).eq('slug', listing.slug).maybeSingle()
      vertRow = data
    }

    if (!vertRow) {
      console.log(`[${listing.vertical}] "${listing.name}" (slug: ${listing.slug})`)
      console.log(`  MISSING from vertical DB (source_id: ${listing.source_id})`)
      console.log(`  This listing exists on umbrella but NOT on the home vertical.\n`)
      driftCount++
      continue
    }

    const umbrellaDesc = (listing.description || '').trim().slice(0, 80)
    const verticalDesc = (vertRow[vc.descCol] || '').trim().slice(0, 80)
    const descMatch = listing.description === vertRow[vc.descCol]
    const nameMatch = listing.name === vertRow.name

    if (descMatch && nameMatch) {
      console.log(`[${listing.vertical}] "${listing.name}": IN SYNC`)
    } else {
      driftCount++
      console.log(`[${listing.vertical}] "${listing.name}" (slug: ${listing.slug})`)
      if (!nameMatch) {
        console.log(`  NAME DRIFT:`)
        console.log(`    umbrella: "${listing.name}"`)
        console.log(`    vertical: "${vertRow.name}"`)
      }
      if (!descMatch) {
        console.log(`  DESCRIPTION DRIFT:`)
        console.log(`    umbrella: "${umbrellaDesc}..."`)
        console.log(`    vertical: "${verticalDesc}..."`)
      }
      console.log(`  source_id: ${listing.source_id}, vertical_id: ${vertRow.id}`)
      console.log(`  source_id matches: ${listing.source_id === String(vertRow.id)}`)
    }
    console.log()
  }

  console.log(`--- Result: ${driftCount} drifted, ${listings.length - driftCount} in sync ---\n`)
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
