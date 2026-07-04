#!/usr/bin/env node
/**
 * Seed commercial_groups with Australian alcohol conglomerates for the
 * character / independence gate.
 *
 * The commercial_groups table + matcher (lib/prospector/way-discovery/
 * gate-1-independence.js) IS the independence gate, but it only covered
 * tourism / hotels / cinemas / charities — zero alcohol coverage, so
 * corporate-owned "craft" brands (Little Creatures, 4 Pines, Balter, Pirate
 * Life, Bundaberg Rum …) were live on SBA. This adds the drinks giants.
 *
 * Ownership facts here are well-established, stable, public. Beer/spirits
 * conglomerates are marked confident (verify_case_by_case=false); wine groups
 * are marked verify (some have heritage cellar doors worth a human decision).
 * Either way the gate only FLAGS — the admin actions each in /admin/gate-check.
 *
 * Idempotent: deletes rows with this source tag, then re-inserts.
 * Run: node scripts/seed-alcohol-commercial-groups.mjs
 */
import fs from 'fs'
import path from 'path'
import url from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
for (const line of raw.split('\n')) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SOURCE = 'gate-check-alcohol-2026-07'
const tok = names => names.map(name => ({ name, match_mode: 'token' }))

const GROUPS = [
  {
    group_name: 'Lion', category: 'brewing', parent_entity: 'Kirin Holdings (Japan)', verify_case_by_case: false,
    notes: 'Owned by Lion (Kirin Holdings, Japan). These formerly-independent craft brands were acquired by Lion — no longer independent producers.',
    brands: ['Little Creatures', 'White Rabbit', 'James Squire', 'Furphy', 'Stone & Wood', 'Fixation', 'Byron Bay Brewery', 'Malt Shovel', 'Kosciuszko', 'Two Birds'],
    domains: ['littlecreatures.com.au', 'whiterabbitbeer.com.au', 'jamessquire.com.au', 'furphy.com.au', 'stoneandwood.com.au', 'fixationbrewing.com.au', 'byronbaybrewery.com.au', 'maltshovelbrewery.com.au', 'twobirdsbrewing.com.au'],
  },
  {
    group_name: 'Asahi (Carlton & United Breweries)', category: 'brewing', parent_entity: 'Asahi Group Holdings (Japan)', verify_case_by_case: false,
    notes: 'Owned by Asahi via Carlton & United Breweries. These craft brands were acquired by CUB/Asahi — no longer independent.',
    brands: ['4 Pines', 'Four Pines', 'Pirate Life', 'Balter', 'Green Beacon', 'Mountain Goat', 'Matilda Bay', 'Yak Ales'],
    domains: ['4pinesbeer.com.au', 'piratelife.com.au', 'piratelifeperth.com', 'balter.com.au', 'greenbeacon.com.au', 'goatbeer.com.au', 'matildabay.com.au'],
  },
  {
    group_name: 'Diageo', category: 'distilling', parent_entity: 'Diageo plc', verify_case_by_case: false,
    notes: 'Bundaberg Rum is owned by Diageo, a multinational spirits corporation — not an independent distillery.',
    brands: ['Bundaberg Rum'], domains: ['bundabergrum.com.au'],
  },
  {
    group_name: 'Treasury Wine Estates', category: 'wine', parent_entity: 'Treasury Wine Estates (ASX: TWE)', verify_case_by_case: true,
    notes: 'ASX-listed global wine corporation. Brands are corporate-owned, not independent. Verify before actioning — some have heritage cellar doors.',
    brands: ['Penfolds', 'Wolf Blass', 'Wynns', 'Seppelt', 'Pepperjack', 'Rosemount', 'Squealing Pig', 'Coldstream Hills', "Devil's Lair", "Lindeman's", 'Saltram'],
    domains: ['penfolds.com', 'wolfblass.com', 'wynns.com.au', 'seppelt.com.au', 'coldstreamhills.com.au', 'devilslair.com.au'],
  },
  {
    group_name: 'Accolade Wines', category: 'wine', parent_entity: 'Accolade Wines', verify_case_by_case: true,
    notes: 'Large corporate wine group. Not independent — verify before actioning.',
    brands: ['Hardys', 'Banrock Station', 'Grant Burge', 'St Hallett', 'Petaluma', 'House of Arras', 'Croser', 'Brookland Valley'],
    domains: ['hardys.com.au', 'banrockstation.com.au', 'grantburge.com.au', 'sthallett.com.au', 'petaluma.com.au', 'houseofarras.com.au'],
  },
  {
    group_name: 'Pernod Ricard Winemakers', category: 'wine', parent_entity: 'Pernod Ricard (France)', verify_case_by_case: true,
    notes: 'Multinational drinks corporation. Not independent — verify.',
    brands: ["Jacob's Creek", 'St Hugo', 'Wyndham Estate'], domains: ['jacobscreek.com', 'sthugo.com', 'wyndhamestate.com'],
  },
  {
    group_name: 'Casella Family Brands', category: 'wine', parent_entity: 'Casella Family Brands', verify_case_by_case: true,
    notes: 'Family-owned but very large-scale / mass-market — fails the small-batch craft character bar. Verify.',
    brands: ['Yellow Tail', 'Peter Lehmann', "Brand's Laira", 'Baileys of Glenrowan'], domains: ['yellowtailwine.com', 'peterlehmannwines.com'],
  },
  {
    group_name: 'Australian Vintage', category: 'wine', parent_entity: 'Australian Vintage Ltd (ASX: AVG)', verify_case_by_case: true,
    notes: 'ASX-listed wine group. Not independent — verify.',
    brands: ['McGuigan', 'Tempus Two', 'Nepenthe', 'Passion Pop'], domains: ['mcguiganwines.com.au', 'tempustwo.com.au', 'nepenthe.com.au'],
  },
]

async function main() {
  // Idempotent: clear this source's prior rows.
  const { error: delErr } = await sb.from('commercial_groups').delete().eq('source', SOURCE)
  if (delErr) throw new Error(`delete failed: ${delErr.message}`)

  const rows = GROUPS.map(g => ({
    group_name: g.group_name,
    category: g.category,
    brands: g.brands,
    brands_json: tok(g.brands),
    domains: g.domains || [],
    vertical_scope: ['sba'],
    verify_case_by_case: g.verify_case_by_case,
    parent_entity: g.parent_entity,
    notes: g.notes,
    source: SOURCE,
  }))

  const { data, error } = await sb.from('commercial_groups').insert(rows).select('group_name')
  if (error) throw new Error(`insert failed: ${error.message}`)
  console.log(`Seeded ${data.length} alcohol commercial groups:`)
  for (const r of data) console.log('  -', r.group_name)
  const totalBrands = GROUPS.reduce((s, g) => s + g.brands.length, 0)
  console.log(`Total brands: ${totalBrands}`)
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })
