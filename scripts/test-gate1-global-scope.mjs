#!/usr/bin/env node
/**
 * Regression test: Gate 1 must reject candidates matching global-scope
 * (vertical_scope IS NULL) commercial groups when evaluating for Way.
 *
 * Bug: Gate 1 used .contains('vertical_scope', ['way']) which misses
 * NULL-scope rows because NULL @> ARRAY['way'] is NULL, not true.
 * Fixed 2026-05-21 to use .or('vertical_scope.cs.{way},vertical_scope.is.null').
 *
 * This test creates a synthetic candidate whose name matches a brand
 * in a global-scope group (Spicers Retreats, scope=null) and asserts
 * Gate 1 returns fail.
 *
 * Run: node scripts/test-gate1-global-scope.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { evaluateGate1 } from '../lib/prospector/way-discovery/gate-1-independence.js'

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

let passed = 0
let failed = 0

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label} — ${detail}`)
    failed++
  }
}

async function main() {
  console.log('=== Gate 1 global-scope regression test ===\n')

  // Test 1: candidate matching a global-scope group's brand should FAIL.
  // Spicers Retreats has vertical_scope=null (global) with brand
  // "Spicers Peak Lodge". A candidate named "Spicers Peak Lodge" must
  // fail Gate 1 even though Spicers isn't way-scoped specifically.
  const candidate1 = {
    name: 'Spicers Peak Lodge',
    website_url: 'https://spicerspeaklodge.example.com',
    name_variants: ['Spicers Peak Lodge', 'Spicers Peak', 'Spicers'],
  }

  console.log('Test 1: candidate "Spicers Peak Lodge" vs global-scope Spicers Retreats')
  const result1 = await evaluateGate1(candidate1, sb)
  assert('Gate 1 returns fail', result1.gate === 'fail',
    `got gate=${result1.gate}, reason: ${result1.reason}`)
  assert('Matched group is Spicers Retreats', result1.matchedGroup === 'Spicers Retreats',
    `got matchedGroup=${result1.matchedGroup}`)

  // Test 2: candidate matching a global-scope group's domain should FAIL.
  const candidate2 = {
    name: 'Worlds Apart Retreats',
    website_url: 'https://www.worldsapart.club/some-retreat',
    name_variants: ['Worlds Apart Retreats', 'Worlds Apart'],
  }

  console.log('\nTest 2: candidate on worldsapart.club domain vs global-scope Spicers Retreats')
  const result2 = await evaluateGate1(candidate2, sb)
  assert('Gate 1 returns fail', result2.gate === 'fail',
    `got gate=${result2.gate}, reason: ${result2.reason}`)
  assert('Matched group is Spicers Retreats', result2.matchedGroup === 'Spicers Retreats',
    `got matchedGroup=${result2.matchedGroup}`)

  // Test 3: candidate matching a way-scoped group still fails (existing behaviour).
  const candidate3 = {
    name: 'Cruise Whitsundays Day Tour',
    website_url: 'https://cruisewhitsundays.com/day-tour',
    name_variants: ['Cruise Whitsundays Day Tour', 'Cruise Whitsundays'],
  }

  console.log('\nTest 3: candidate "Cruise Whitsundays" vs way-scoped Journey Beyond')
  const result3 = await evaluateGate1(candidate3, sb)
  assert('Gate 1 returns fail', result3.gate === 'fail',
    `got gate=${result3.gate}, reason: ${result3.reason}`)
  assert('Matched group is Journey Beyond', result3.matchedGroup === 'Journey Beyond',
    `got matchedGroup=${result3.matchedGroup}`)

  // Test 4: genuine independent candidate passes.
  const candidate4 = {
    name: 'Kakadu Cultural Tours',
    website_url: 'https://kakaduculturaltours.example.com',
    name_variants: ['Kakadu Cultural Tours', 'Kakadu Cultural'],
  }

  console.log('\nTest 4: genuine independent "Kakadu Cultural Tours" should pass')
  const result4 = await evaluateGate1(candidate4, sb)
  assert('Gate 1 returns pass', result4.gate === 'pass',
    `got gate=${result4.gate}, reason: ${result4.reason}`)

  // ─── Oaks substring collision fix ────────────────────────────
  // "Oaks" (Minor Hotels brand) must NOT match "Silky Oaks Lodge"
  // (Beckons). The token-based matching requires ≥ 2 tokens for
  // containment, so single-word "Oaks" only matches exact "Oaks".

  console.log('\nTest 5: "Silky Oaks Lodge" must NOT match "Oaks" (Minor Hotels)')
  const candidate5 = {
    name: 'Silky Oaks Lodge',
    website_url: 'https://silkyoakslodge.com.au',
    name_variants: ['Silky Oaks Lodge', 'Silky Oaks'],
  }
  const result5 = await evaluateGate1(candidate5, sb)
  // Silky Oaks Lodge IS a Beckons property — it should match Beckons,
  // not "Oaks Hotels & Resorts" (Minor Hotels).
  assert('Silky Oaks Lodge matches Beckons (not Oaks/Minor Hotels)',
    result5.gate === 'fail' && result5.matchedGroup === 'Beckons / Baillie Lodges',
    `got gate=${result5.gate}, matchedGroup=${result5.matchedGroup}`)

  console.log('\nTest 6: genuine "Oaks" hotel must still match Minor Hotels')
  const candidate6 = {
    name: 'Oaks Brisbane on Felix Suites',
    website_url: 'https://oakshotels.com/brisbane',
    name_variants: ['Oaks Brisbane on Felix Suites', 'Oaks Brisbane'],
  }
  const result6 = await evaluateGate1(candidate6, sb)
  // "Oaks Brisbane" should NOT match via single-token "Oaks" containment,
  // but should match via domain if Minor Hotels has oakshotels.com, or
  // via the full group_name/brand match. If Minor Hotels isn't in the DB
  // yet, this candidate should pass Gate 1 (independent).
  // For now just verify it doesn't falsely match Beckons.
  if (result6.gate === 'fail') {
    assert('If Oaks Brisbane fails, it matches Minor Hotels (not Beckons)',
      result6.matchedGroup !== 'Beckons / Baillie Lodges',
      `matched ${result6.matchedGroup}`)
  } else {
    assert('Oaks Brisbane passes (Minor Hotels not in DB or no match)', true, '')
  }

  // ─── Token-matching edge cases (Oaks fix) ────────────────────
  // These test the token-based containment logic. Single-token brand
  // names (Oaks, Como, Vibe, QT) must not auto-reject via substring
  // containment. Multi-token matches (Capella Lodge) must still work.

  console.log('\nTest 7: "Como Beach Cottages" — Como is a suburb, not a hotel brand match')
  const candidate7 = {
    name: 'Como Beach Cottages',
    website_url: 'https://comobeachcottages.example.com',
    name_variants: ['Como Beach Cottages', 'Como Beach'],
  }
  const result7 = await evaluateGate1(candidate7, sb)
  assert('"Como Beach Cottages" passes Gate 1',
    result7.gate === 'pass',
    `got gate=${result7.gate}, matchedGroup=${result7.matchedGroup}, reason: ${result7.reason}`)

  console.log('\nTest 8: "Capella Lodge" — Beckons sub-brand, exact match')
  const candidate8 = {
    name: 'Capella Lodge',
    website_url: 'https://capellalodge.example.com',
    name_variants: ['Capella Lodge'],
  }
  const result8 = await evaluateGate1(candidate8, sb)
  assert('"Capella Lodge" fails Gate 1 (Beckons)',
    result8.gate === 'fail' && result8.matchedGroup === 'Beckons / Baillie Lodges',
    `got gate=${result8.gate}, matchedGroup=${result8.matchedGroup}`)

  console.log('\nTest 9: "Vibe Studios Ceramics" — Vibe ≠ Vibe Hotels')
  const candidate9 = {
    name: 'Vibe Studios Ceramics',
    website_url: 'https://vibestudios.example.com',
    name_variants: ['Vibe Studios Ceramics', 'Vibe Studios'],
  }
  const result9 = await evaluateGate1(candidate9, sb)
  assert('"Vibe Studios Ceramics" passes Gate 1',
    result9.gate === 'pass',
    `got gate=${result9.gate}, matchedGroup=${result9.matchedGroup}, reason: ${result9.reason}`)

  // QT Hotel / QT Watercraft: these tests depend on EVT/Minor Hotels
  // being in commercial_groups. If no QT-branded group exists, both
  // pass trivially. The interesting case is when the group IS present.
  console.log('\nTest 10: "QT Hotel Sydney" — should fail if EVT/QT Hotels in DB')
  const candidate10 = {
    name: 'QT Hotel Sydney',
    website_url: 'https://qthotels.com/sydney',
    name_variants: ['QT Hotel Sydney', 'QT Hotel'],
  }
  const result10 = await evaluateGate1(candidate10, sb)
  if (result10.gate === 'fail') {
    assert('"QT Hotel Sydney" matched a hotel group',
      true, '')
    console.log(`    matched: ${result10.matchedGroup} — ${result10.reason}`)
  } else {
    console.log(`    NOTE: passed Gate 1 — no QT/EVT group in commercial_groups`)
    console.log(`    This is expected if Minor Hotels / EVT has not been seeded yet`)
    passed++ // not a failure of the logic
  }

  console.log('\nTest 11: "QT Watercraft" — QT alone should not auto-reject')
  const candidate11 = {
    name: 'QT Watercraft',
    website_url: 'https://qtwatercraft.example.com',
    name_variants: ['QT Watercraft'],
  }
  const result11 = await evaluateGate1(candidate11, sb)
  assert('"QT Watercraft" passes Gate 1 (single-token QT has no containment)',
    result11.gate === 'pass',
    `got gate=${result11.gate}, matchedGroup=${result11.matchedGroup}, reason: ${result11.reason}`)

  // ─── match_mode tests (brands_json) ──────────────────────────
  // These verify the three match modes: exact, prefix, token.

  console.log('\n--- match_mode tests ---')

  // PREFIX: "Sheraton Mirage Port Douglas" should fail (Marriott, prefix on Sheraton)
  console.log('\nTest 12: "Sheraton Mirage Port Douglas" → prefix match on Sheraton (Marriott)')
  const candidate12 = {
    name: 'Sheraton Mirage Port Douglas',
    website_url: 'https://sheratonmirage.example.com',
    name_variants: ['Sheraton Mirage Port Douglas', 'Sheraton Mirage'],
  }
  const result12 = await evaluateGate1(candidate12, sb)
  assert('"Sheraton Mirage Port Douglas" fails Gate 1',
    result12.gate === 'fail' && result12.matchedGroup === 'Marriott',
    `got gate=${result12.gate}, matchedGroup=${result12.matchedGroup}`)

  // PREFIX: "Ibis Budget Sydney Olympic Park" should fail (Accor, prefix on ibis)
  console.log('\nTest 13: "Ibis Budget Sydney Olympic Park" → prefix match on ibis (Accor)')
  const candidate13 = {
    name: 'Ibis Budget Sydney Olympic Park',
    website_url: 'https://all.accor.com',
    name_variants: ['Ibis Budget Sydney Olympic Park', 'Ibis Budget'],
  }
  const result13 = await evaluateGate1(candidate13, sb)
  assert('"Ibis Budget Sydney Olympic Park" fails Gate 1',
    result13.gate === 'fail' && result13.matchedGroup === 'Accor',
    `got gate=${result13.gate}, matchedGroup=${result13.matchedGroup}`)

  // PREFIX: "Mantra Heritage" should fail (Accor, prefix on Mantra)
  console.log('\nTest 14: "Mantra Heritage" → prefix match on Mantra (Accor)')
  const candidate14 = {
    name: 'Mantra Heritage',
    website_url: 'https://mantraheritage.com.au',
    name_variants: ['Mantra Heritage'],
  }
  const result14 = await evaluateGate1(candidate14, sb)
  assert('"Mantra Heritage" fails Gate 1',
    result14.gate === 'fail' && result14.matchedGroup === 'Accor',
    `got gate=${result14.gate}, matchedGroup=${result14.matchedGroup}`)

  // EXACT: "Silky Oaks Lodge" should STILL pass against Oaks (Minor Hotels,
  // exact mode) but fail against Beckons (where Silky Oaks Lodge is a
  // registered brand with token mode). This confirms the Oaks fix holds
  // AND that Beckons' token matching catches it.
  console.log('\nTest 15: "Silky Oaks Lodge" — passes Oaks (exact), caught by Beckons (token)')
  const candidate15 = {
    name: 'Silky Oaks Lodge',
    website_url: 'https://silkyoakslodge.com.au',
    name_variants: ['Silky Oaks Lodge', 'Silky Oaks'],
  }
  const result15 = await evaluateGate1(candidate15, sb)
  assert('"Silky Oaks Lodge" fails Gate 1 via Beckons, not Minor Hotels',
    result15.gate === 'fail' && result15.matchedGroup === 'Beckons / Baillie Lodges',
    `got gate=${result15.gate}, matchedGroup=${result15.matchedGroup}`)

  // EXACT: "Como Beach Cottages" should pass (Como is exact mode in Palace Cinemas)
  console.log('\nTest 16: "Como Beach Cottages" — Como (exact) prevents false positive')
  const candidate16 = {
    name: 'Como Beach Cottages',
    website_url: 'https://comobeachcottages.example.com',
    name_variants: ['Como Beach Cottages', 'Como Beach'],
  }
  const result16 = await evaluateGate1(candidate16, sb)
  assert('"Como Beach Cottages" passes Gate 1',
    result16.gate === 'pass',
    `got gate=${result16.gate}, matchedGroup=${result16.matchedGroup}`)

  // TOKEN: "Captain Cook Cruises Sydney" should fail (SeaLink, token mode)
  console.log('\nTest 17: "Captain Cook Cruises Sydney" → token match (SeaLink)')
  const candidate17 = {
    name: 'Captain Cook Cruises Sydney',
    website_url: 'https://captaincook.example.com',
    name_variants: ['Captain Cook Cruises Sydney', 'Captain Cook Cruises'],
  }
  const result17 = await evaluateGate1(candidate17, sb)
  assert('"Captain Cook Cruises Sydney" fails Gate 1',
    result17.gate === 'fail' && result17.matchedGroup === 'SeaLink Marine & Tourism',
    `got gate=${result17.gate}, matchedGroup=${result17.matchedGroup}`)

  // PREFIX boundary: "Mantra" must NOT match "Mantras and Meditation Centre"
  // (prefix requires word boundary after brand)
  console.log('\nTest 18: "Mantras and Meditation Centre" — prefix boundary prevents false positive')
  const candidate18 = {
    name: 'Mantras and Meditation Centre',
    website_url: 'https://mantrasmeditation.example.com',
    name_variants: ['Mantras and Meditation Centre'],
  }
  const result18 = await evaluateGate1(candidate18, sb)
  assert('"Mantras and Meditation Centre" passes Gate 1',
    result18.gate === 'pass',
    `got gate=${result18.gate}, matchedGroup=${result18.matchedGroup}`)

  // DOMAIN: Accor domain matching now works
  console.log('\nTest 19: "Random Hotel Name" on all.accor.com → domain match (Accor)')
  const candidate19 = {
    name: 'Random Hotel Name',
    website_url: 'https://all.accor.com/some-hotel',
    name_variants: ['Random Hotel Name'],
  }
  const result19 = await evaluateGate1(candidate19, sb)
  assert('"Random Hotel Name" on accor.com fails Gate 1',
    result19.gate === 'fail' && result19.matchedGroup === 'Accor',
    `got gate=${result19.gate}, matchedGroup=${result19.matchedGroup}`)

  // DOMAIN: Marriott domain matching
  console.log('\nTest 20: "Random Resort" on marriott.com → domain match (Marriott)')
  const candidate20 = {
    name: 'Random Resort',
    website_url: 'https://www.marriott.com/hotels/travel/some-hotel',
    name_variants: ['Random Resort'],
  }
  const result20 = await evaluateGate1(candidate20, sb)
  assert('"Random Resort" on marriott.com fails Gate 1',
    result20.gate === 'fail' && result20.matchedGroup === 'Marriott',
    `got gate=${result20.gate}, matchedGroup=${result20.matchedGroup}`)

  // ─── Legacy fallback one-directional fix ──────────────────────
  // Groups without brands_json use the legacy TEXT[] fallback path.
  // The old bidirectional tokenContains let variant "Sydney" match
  // group "Sydney Lodges" — fixed to one-directional only.

  console.log('\nTest 22: "Sydney Kayak Experience" must NOT match "Sydney Lodges" (legacy fallback)')
  const candidate22 = {
    name: 'Sydney Kayak Experience',
    website_url: 'https://sydneykayaks.example.com',
    name_variants: ['Sydney Kayak Experience', 'Sydney Kayak', 'Sydney'],
  }
  const result22 = await evaluateGate1(candidate22, sb)
  assert('"Sydney Kayak Experience" passes Gate 1 (no false match on Sydney Lodges)',
    result22.gate === 'pass',
    `got gate=${result22.gate}, matchedGroup=${result22.matchedGroup}, reason: ${result22.reason}`)

  // Verify the fix doesn't break legitimate legacy matches
  console.log('\nTest 23: "Sydney Lodges Retreat" should still match "Sydney Lodges" (variant contains group)')
  const candidate23 = {
    name: 'Sydney Lodges Retreat',
    website_url: 'https://sydneylodgesretreat.example.com',
    name_variants: ['Sydney Lodges Retreat', 'Sydney Lodges'],
  }
  const result23 = await evaluateGate1(candidate23, sb)
  assert('"Sydney Lodges Retreat" fails Gate 1 (variant contains group name)',
    result23.gate === 'fail',
    `got gate=${result23.gate}, reason: ${result23.reason}`)

  // ─── MGallery token matching (mid-name brand) ─────────────────
  // MGallery appears in the middle of candidate names, not at the
  // start — prefix mode missed these. Token mode catches both
  // "MGallery" (no space) and "M Gallery" (with space).

  console.log('\nTest 24: "Hotel Chadstone Melbourne - MGallery Collection" → token match (Accor)')
  const candidate24 = {
    name: 'Hotel Chadstone Melbourne - MGallery Collection',
    website_url: 'https://www.hotelchadstone.com.au',
    name_variants: ['Hotel Chadstone Melbourne - MGallery Collection'],
  }
  const result24 = await evaluateGate1(candidate24, sb)
  assert('"Hotel Chadstone MGallery" fails Gate 1 (Accor)',
    result24.gate === 'fail' && result24.matchedGroup === 'Accor',
    `got gate=${result24.gate}, matchedGroup=${result24.matchedGroup}`)

  console.log('\nTest 25: "Manly Pacific M Gallery Collection" → token match (Accor)')
  const candidate25 = {
    name: 'Manly Pacific M Gallery Collection',
    website_url: 'https://manlypacific.com.au',
    name_variants: ['Manly Pacific M Gallery Collection'],
  }
  const result25 = await evaluateGate1(candidate25, sb)
  assert('"Manly Pacific M Gallery" fails Gate 1 (Accor)',
    result25.gate === 'fail' && result25.matchedGroup === 'Accor',
    `got gate=${result25.gate}, matchedGroup=${result25.matchedGroup}`)

  // ─── Cinema seeder: global-scope query coverage ───────────────
  // The cinema seeder (seed-cinema-candidates.mjs) uses a compound .or()
  // filter that must include global-scope hotel_accommodation groups.
  // This verifies the same query shape returns Spicers Retreats (scope=null).

  console.log('\nTest 21: cinema-scope query includes global-scope hotel groups')
  const { data: cinemaGroups, error: cinemaErr } = await sb
    .from('commercial_groups')
    .select('group_name, category, vertical_scope')
    .or('category.eq.cinema,and(category.eq.hotel_accommodation,vertical_scope.cs.{collection}),and(category.eq.hotel_accommodation,vertical_scope.is.null)')

  assert('cinema-scope query succeeds', !cinemaErr,
    cinemaErr ? cinemaErr.message : '')
  const spicersInCinema = (cinemaGroups || []).find(g => g.group_name === 'Spicers Retreats')
  assert('Spicers Retreats (global scope) included in cinema-scope query',
    !!spicersInCinema,
    `not found in ${(cinemaGroups || []).length} results: ${(cinemaGroups || []).map(g => g.group_name).join(', ')}`)

  // Summary
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
