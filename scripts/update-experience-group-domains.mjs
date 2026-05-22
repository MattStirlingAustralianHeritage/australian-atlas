#!/usr/bin/env node
/**
 * One-off script: populate domains arrays for experience-tourism groups
 * in commercial_groups, add Beckons/Baillie Lodges, extend Spicers scope.
 *
 * All domains verified via fetch + DNS before this script was written.
 * See verify-experience-group-domains.mjs for the verification log.
 *
 * Run: node scripts/update-experience-group-domains.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Manual env parse
const envText = readFileSync('.env.local', 'utf-8')
for (const line of envText.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  let k = t.substring(0, eq), v = t.substring(eq + 1)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[k] = v
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Domain updates for existing experience-tourism groups.
// Every domain here was verified via HTTP fetch or DNS+curl on 2026-05-21.
//
// Exclusions logged:
//   bigredcat.com.au — redirects to stradbrokeferries.com.au (no longer Experience Co)
//   botanicaworlddiscoveries.com.au — NXDOMAIN, no standalone site
//   homevalleystation.com.au — NXDOMAIN, no standalone site
//   longitude131.com.au — on voyages.com.au site but actually Beckons-operated (moved to Beckons)
//
// SeaLink group (sealink.com.au, captaincookcruises.com.au, bridgeclimb.com, kelsian.com):
//   all return 403 (Cloudflare bot protection) but have valid DNS A records
//   pointing to Cloudflare IPs. These are operational sites; the 403 is bot
//   filtering, not defunct content. Included.

const DOMAIN_UPDATES = [
  {
    group_name: 'Experience Co',
    domains: [
      'experienceco.com',
      'skydive.com.au',
      'treetopsadventure.com.au',
      'greenisland.com.au',
      'fitzroyislandadventures.com',
      'calypsoreefcruises.com',
      'reefmagic.com.au',
      'cairnswhalewatching.com.au',
      'daintreetours.com',
      'nextlevelpark.com.au',
      'wildbushluxury.com.au',
      'reefunlimited.com.au',
    ],
  },
  {
    group_name: 'Journey Beyond',
    domains: [
      'journeybeyond.com',
      'journeybeyondrail.com.au',
      'outbackspirittours.com.au',
      'cruisewhitsundays.com',
      'rottnestexpress.com.au',
      'horizontalfallsadventures.com.au',
      'salsalis.com.au',
      'greatsouthernrail.com.au',
      'theghan.com.au',
    ],
  },
  {
    group_name: 'SeaLink Marine & Tourism',
    domains: [
      'kelsian.com',
      'sealink.com.au',
      'captaincookcruises.com.au',
      'bridgeclimb.com',
    ],
  },
  {
    group_name: 'AAT Kings / TTC Tour Brands',
    domains: [
      'aatkings.com.au',
      'aatkings.com',
      'inspiringjourneys.com',
      'inspiringjourneys.com.au',
      'downundertours.com',
      'ttc.com',
    ],
  },
  {
    group_name: 'APT Travel Group',
    domains: [
      'aptouring.com',
      'travelmarvel.com.au',
    ],
  },
  {
    group_name: 'Intrepid Group',
    domains: [
      'intrepidtravel.com',
      'peregrineadventures.com',
      'adventureworld.com.au',
      'adventureworld.com',
    ],
  },
  {
    group_name: 'G Adventures',
    domains: [
      'gadventures.com',
    ],
  },
  {
    group_name: "Discovery Holiday Parks / G'day Group",
    domains: [
      'discoveryholidayparks.com.au',
      'gdaygroup.com.au',
      'gdayrewards.com.au',
      'gdayparks.com.au',
    ],
  },
  {
    group_name: 'Voyages Indigenous Tourism Australia',
    domains: [
      'voyages.com.au',
      'ayersrockresort.com.au',
      'mossmangorge.com.au',
      // longitude131.com.au NOT included — Longitude 131 is Beckons-operated
    ],
  },
]

async function main() {
  console.log('=== Updating domains for experience-tourism groups ===\n')

  for (const update of DOMAIN_UPDATES) {
    const { data, error } = await sb
      .from('commercial_groups')
      .update({ domains: update.domains })
      .eq('group_name', update.group_name)
      .select('group_name, domains')

    if (error) {
      console.error(`FAILED: ${update.group_name} — ${error.message}`)
    } else if (!data || data.length === 0) {
      console.error(`NOT FOUND: ${update.group_name}`)
    } else {
      console.log(`${update.group_name}: ${data[0].domains.length} domains set`)
    }
  }

  // ─── Insert Beckons/Baillie Lodges ──────────────────────────────
  console.log('\n=== Inserting Beckons / Baillie Lodges ===\n')

  // Verified domains (2026-05-21):
  //   beckons.com — 403 (Cloudflare) but DNS live, parent group site
  //   baillielodges.com.au — 301 → beckons.com (legacy domain, still resolves)
  //   capellalodge.com.au — 200 LIVE
  //   silkyoakslodge.com.au — 200 LIVE
  //   southernoceanlodge.com.au — 200 LIVE
  //   thelouise.com.au — 200 LIVE
  //   longitude131.com.au — 200 LIVE (Beckons-operated per site content)

  const beckonsRow = {
    group_name: 'Beckons / Baillie Lodges',
    category: 'experience_tourism',
    brands: [
      'Beckons',
      'Baillie Lodges',
      'Capella Lodge',
      'Longitude 131',
      'Silky Oaks Lodge',
      'Southern Ocean Lodge',
      'The Louise',
    ],
    vertical_scope: ['way', 'rest'],
    verify_case_by_case: false,
    parent_entity: null,
    domains: [
      'beckons.com',
      'baillielodges.com.au',
      'capellalodge.com.au',
      'silkyoakslodge.com.au',
      'southernoceanlodge.com.au',
      'thelouise.com.au',
      'longitude131.com.au',
    ],
    notes: 'Luxury lodge group (rebranded from Baillie Lodges to Beckons 2025). Lodges run experience product (guided walks, cultural tours from property). Auto-reject — group-operated luxury brand.',
    source: 'Way Atlas Spec §II + verification 2026-05-21',
  }

  const { data: beckonsData, error: beckonsErr } = await sb
    .from('commercial_groups')
    .upsert(beckonsRow, { onConflict: 'group_name' })
    .select('group_name, brands, domains')

  if (beckonsErr) {
    console.error('FAILED inserting Beckons:', beckonsErr.message)
  } else {
    console.log(`Beckons / Baillie Lodges: inserted with ${beckonsData[0].brands.length} brands, ${beckonsData[0].domains.length} domains`)
  }

  // ─── Extend Spicers Retreats ────────────────────────────────────
  console.log('\n=== Extending Spicers Retreats scope ===\n')

  // Spicers is already in the table as hotel_accommodation with global scope.
  // The spec wants it extended to include experience-tourism scope for Way.
  // Strategy: update the existing row to add 'way' to vertical_scope,
  // update category to cover both, and add the verified domains.
  //
  // Verified domains (2026-05-21):
  //   worldsapart.club — 200 LIVE (parent brand site, Spicers lives under /spicers)
  //   spicersretreats.com — 301 → worldsapart.club/spicers (legacy domain, still resolves)
  //   Individual property .com.au domains (sangoma, balfour, hidden-vale, clovelly, canopy)
  //   have DNS but return 405 — redirect stubs, not live content. Not included.

  // Read current row first
  const { data: spicersCurrent } = await sb
    .from('commercial_groups')
    .select('*')
    .eq('group_name', 'Spicers Retreats')
    .single()

  if (!spicersCurrent) {
    console.error('NOT FOUND: Spicers Retreats')
  } else {
    // Extend the brands array with the individual retreat names
    const existingBrands = spicersCurrent.brands || []
    const newBrands = [
      ...new Set([
        ...existingBrands,
        'Spicers Peak Lodge',
        'Spicers Tamarind Retreat',
        'Spicers Sangoma Retreat',
        'Spicers Balfour',
        'Spicers Hidden Vale',
        'Spicers Clovelly Estate',
        'Spicers Canopy',
        'Spicers Vineyards Estate',
        'Spicers Guesthouse',
        'Spicers Potts Point',
      ]),
    ]

    const { data: spicersUpdated, error: spicersErr } = await sb
      .from('commercial_groups')
      .update({
        // Keep global scope (hotels on Rest etc) AND add way scope
        vertical_scope: null, // null = global, which already covers all verticals including way
        brands: newBrands,
        domains: [
          'worldsapart.club',
          'spicersretreats.com',
        ],
        notes: 'Spicers Retreats operates luxury lodge experiences (guided walks, wellness, culinary) from multiple properties. Global scope covers both accommodation (Rest) and experience product (Way).',
      })
      .eq('group_name', 'Spicers Retreats')
      .select('group_name, brands, domains, vertical_scope')

    if (spicersErr) {
      console.error('FAILED updating Spicers:', spicersErr.message)
    } else {
      console.log(`Spicers Retreats: updated with ${spicersUpdated[0].brands.length} brands, ${spicersUpdated[0].domains.length} domains, scope=${spicersUpdated[0].vertical_scope || 'global'}`)
    }
  }

  // ─── Verification query ─────────────────────────────────────────
  console.log('\n=== Verification: all experience-tourism-scoped groups ===\n')

  // Groups with way in scope: either vertical_scope contains 'way' OR vertical_scope is null (global)
  const { data: allGroups } = await sb
    .from('commercial_groups')
    .select('group_name, category, brands, domains, vertical_scope, verify_case_by_case')
    .or('vertical_scope.cs.{way},vertical_scope.is.null')
    .order('group_name')

  for (const g of allGroups) {
    const scope = g.vertical_scope ? g.vertical_scope.join(',') : 'global'
    console.log(`${g.group_name}`)
    console.log(`  category: ${g.category} | scope: ${scope} | verify: ${g.verify_case_by_case}`)
    console.log(`  brands (${(g.brands || []).length}): ${(g.brands || []).join(', ')}`)
    console.log(`  domains (${(g.domains || []).length}): ${(g.domains || []).join(', ')}`)
    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
