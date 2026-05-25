#!/usr/bin/env node
/**
 * backfill-way-stranded.mjs
 *
 * Pushes Way listings that exist on the portal (with way_meta) but lack
 * a corresponding operators row in the Way Atlas Supabase project.
 *
 * Constructs the push payload from listings + way_meta, matching the
 * shape that pushToVerticalWithRetry expects from a fresh approval.
 * Idempotent — listings already present in operators (by slug) are skipped.
 *
 * Usage:
 *   node scripts/backfill-way-stranded.mjs                    # push all eligible
 *   node scripts/backfill-way-stranded.mjs --slug wooleen-station  # push one
 *   node scripts/backfill-way-stranded.mjs --dry-run          # report only, no writes
 *
 * Part of the Way Atlas integration repair (Component 7 of 8).
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

// ── Args ──────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SLUG_FILTER = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null

// ── Clients ───────────────────────────────────────────────────
const portalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const portalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const wayUrl = process.env.WAY_SUPABASE_URL
const wayKey = process.env.WAY_SUPABASE_SERVICE_KEY

if (!portalUrl || !portalKey) { console.error('Missing portal env vars'); process.exit(1) }
if (!wayUrl || !wayKey) { console.error('Missing Way env vars'); process.exit(1) }

const portal = createClient(portalUrl, portalKey)
const way = createClient(wayUrl, wayKey)

// ── Presence type mapping (portal → Way) ──────────────────────
function mapPortalPresenceTypeToWay(presenceType) {
  switch (presenceType) {
    case 'permanent':      return 'year_round'
    case 'by_appointment': return 'by_appointment'
    case 'seasonal':       return 'seasonal'
    case 'markets':        return 'year_round'
    case 'online':         return 'year_round'
    case 'mobile':         return 'year_round'
    case 'year_round':     return 'year_round'
    case 'weather_dependent':  return 'weather_dependent'
    case 'charter_only':       return 'charter_only'
    case 'tide_dependent':     return 'tide_dependent'
    default:               return 'year_round'
  }
}

// ── Build operators row from listing + way_meta ───────────────
function buildOperatorsRow(listing, wayMeta) {
  return {
    name: listing.name,
    slug: listing.slug,
    description: listing.description || null,
    state: listing.state || null,
    phone: listing.phone || null,
    departure_point_lat: listing.lat || null,
    departure_point_lng: listing.lng || null,
    departure_point_name: wayMeta.departure_point_name || listing.address || listing.suburb || null,
    website_url: listing.website || null,
    hero_image_url: null, // typographic card default; owner uploads on claim
    primary_type: wayMeta.primary_type || listing.sub_type,
    operator_type: wayMeta.operator_type || 'independent',
    operator_legal_name: wayMeta.operator_legal_name || null,
    aboriginal_community: wayMeta.aboriginal_community || null,
    secondary_types: wayMeta.secondary_types || [],
    accreditations: wayMeta.accreditations || [],
    primary_region_id: wayMeta.primary_region_id || null,
    operating_region_ids: wayMeta.operating_region_ids || [],
    established_year: wayMeta.established_year || null,
    presence_type: mapPortalPresenceTypeToWay(wayMeta.presence_type || listing.presence_type),
    operating_season_months: wayMeta.operating_season_months || [],
    multiple_departure_points: wayMeta.multiple_departure_points ?? false,
    visitable: listing.visitable ?? true,
    status: 'published',
    booking_url: wayMeta.booking_url || null,
    contact_email: wayMeta.contact_email || null,
    contact_name: wayMeta.contact_name || null,
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('Component 7 — Way Atlas Backfill')
  console.log('================================')
  if (DRY_RUN) console.log('  DRY RUN — no writes will be made\n')
  if (SLUG_FILTER) console.log(`  Filtering to slug: ${SLUG_FILTER}\n`)

  // 1. Get all Way listings with way_meta that have operator_type set
  let query = portal
    .from('listings')
    .select('id, slug, name, description, sub_type, lat, lng, state, phone, website, address, suburb, presence_type, visitable, status')
    .eq('vertical', 'way')

  if (SLUG_FILTER) {
    query = query.eq('slug', SLUG_FILTER)
  }

  const { data: listings, error: listErr } = await query.order('created_at', { ascending: true })
  if (listErr) { console.error('Failed to query listings:', listErr.message); process.exit(1) }

  // 2. Get existing operators slugs to skip
  const { data: existingOps } = await way.from('operators').select('slug')
  const existingSlugs = new Set((existingOps || []).map(o => o.slug))
  console.log(`Existing operators rows: ${existingSlugs.size}`)

  // 3. Process each listing
  const results = { pushed: [], skipped_existing: [], skipped_incomplete: [], failed: [] }

  for (const listing of listings) {
    // Skip if already in operators
    if (existingSlugs.has(listing.slug)) {
      results.skipped_existing.push(listing.slug)
      continue
    }

    // Fetch way_meta
    const { data: wayMeta } = await portal
      .from('way_meta')
      .select('*')
      .eq('listing_id', listing.id)
      .maybeSingle()

    // Skip if no operator_type (Path B — needs re-approval)
    if (!wayMeta?.operator_type) {
      results.skipped_incomplete.push({ slug: listing.slug, name: listing.name })
      continue
    }

    // Build the operators row
    const row = buildOperatorsRow(listing, wayMeta)

    if (DRY_RUN) {
      console.log(`  [DRY] Would push: ${listing.name} (${row.primary_type}, ${row.operator_type})`)
      console.log(`        lat/lng: ${row.departure_point_lat}, ${row.departure_point_lng}`)
      console.log(`        departure: ${row.departure_point_name}`)
      results.pushed.push(listing.slug)
      continue
    }

    // Push to operators via upsert (slug is unique)
    const { data: upserted, error: pushErr } = await way
      .from('operators')
      .upsert(row, { onConflict: 'slug' })
      .select('id')
      .single()

    if (pushErr) {
      console.error(`  ❌ FAIL: ${listing.name} — ${pushErr.message}`)
      results.failed.push({ slug: listing.slug, name: listing.name, error: pushErr.message })
      continue
    }

    const operatorId = upserted.id
    console.log(`  ✅ ${listing.name} → operators.id=${operatorId}`)

    // Update portal source_id to link the two
    const { error: linkErr } = await portal
      .from('listings')
      .update({ source_id: operatorId })
      .eq('id', listing.id)

    if (linkErr) {
      console.warn(`     ⚠️  source_id update failed: ${linkErr.message}`)
    } else {
      console.log(`     source_id linked: ${listing.id} → ${operatorId}`)
    }

    results.pushed.push(listing.slug)
  }

  // 4. Summary
  console.log('\n================================')
  console.log('SUMMARY')
  console.log('================================')
  console.log(`Pushed:            ${results.pushed.length}`)
  console.log(`Skipped (existing): ${results.skipped_existing.length}`)
  console.log(`Skipped (incomplete): ${results.skipped_incomplete.length}`)
  console.log(`Failed:            ${results.failed.length}`)

  if (results.failed.length > 0) {
    console.log('\nFailed listings:')
    for (const f of results.failed) {
      console.log(`  ${f.name}: ${f.error}`)
    }
  }

  if (results.skipped_incomplete.length > 0) {
    console.log('\nIncomplete listings (need re-approval via Candidate Review):')
    for (const s of results.skipped_incomplete) {
      console.log(`  - ${s.name} (${s.slug})`)
    }
  }

  process.exit(results.failed.length > 0 ? 1 : 0)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
