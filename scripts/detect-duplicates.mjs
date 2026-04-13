#!/usr/bin/env node
// ============================================================
// Duplicate detection: find potential duplicate listings
// Three signals: same name+suburb, same website, trigram >85%
// Usage: node --env-file=.env.local scripts/detect-duplicates.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 1000

function normalize(str) {
  return (str || '').toLowerCase().replace(/[''`]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
}

function trigrams(str) {
  const s = `  ${str} `
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

function trigramSimilarity(a, b) {
  if (!a || !b) return 0
  const ta = trigrams(normalize(a))
  const tb = trigrams(normalize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) { if (tb.has(t)) intersection++ }
  return (2 * intersection) / (ta.size + tb.size)
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')

  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, website, state, region, suburb, address, vertical, quality_score')
      .eq('status', 'active')
      .order('name')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} active listings\n`)

  // Build lookup maps
  const byNormName = new Map()
  const byWebsite = new Map()

  for (const l of allListings) {
    const key = normalize(l.name) + '|' + normalize(l.suburb || l.region || '')
    if (!byNormName.has(key)) byNormName.set(key, [])
    byNormName.get(key).push(l)

    if (l.website) {
      const wKey = l.website.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
      if (!byWebsite.has(wKey)) byWebsite.set(wKey, [])
      byWebsite.get(wKey).push(l)
    }
  }

  const pairs = new Map()

  function addPair(a, b, reason, confidence) {
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
    const key = `${lo}-${hi}`
    if (!pairs.has(key)) {
      pairs.set(key, {
        listing_a_id: lo,
        listing_b_id: hi,
        match_reason: reason,
        confidence,
      })
    }
  }

  // Check 1: Same name + same suburb/region
  for (const [, group] of byNormName) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addPair(group[i], group[j], 'same_name_suburb', 'high')
      }
    }
  }

  // Check 2: Same website URL
  for (const [, group] of byWebsite) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addPair(group[i], group[j], 'same_website', 'high')
      }
    }
  }

  // Check 3: Trigram similarity >85% + same state
  const byState = new Map()
  for (const l of allListings) {
    const st = l.state || 'unknown'
    if (!byState.has(st)) byState.set(st, [])
    byState.get(st).push(l)
  }

  let trigramChecked = 0
  for (const [state, group] of byState) {
    if (group.length > 2000) {
      console.log(`  Skipping trigram for ${state} (${group.length} too large)`)
      continue
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const sim = trigramSimilarity(group[i].name, group[j].name)
        if (sim > 0.85) {
          addPair(group[i], group[j], `trigram_${(sim * 100).toFixed(0)}pct`, 'medium')
        }
      }
      trigramChecked++
    }
  }

  console.log(`Found ${pairs.size} duplicate pairs\n`)

  let inserted = 0, errors = 0
  for (const pair of pairs.values()) {
    if (!DRY_RUN) {
      const { error: err } = await sb
        .from('duplicate_pairs')
        .upsert(pair, { onConflict: 'listing_a_id,listing_b_id', ignoreDuplicates: true })
      if (err) { errors++; continue }
    }
    inserted++
  }

  const highConf = [...pairs.values()].filter(p => p.confidence === 'high').length
  console.log('═'.repeat(50))
  console.log(`Pairs: ${pairs.size} (${highConf} high, ${pairs.size - highConf} medium)`)
  console.log(`Inserted: ${inserted} | Errors: ${errors}`)

  // Show samples
  const highPairs = [...pairs.values()].filter(p => p.confidence === 'high').slice(0, 20)
  if (highPairs.length > 0) {
    console.log(`\nHigh-confidence samples:`)
    for (const p of highPairs) {
      const a = allListings.find(l => l.id === p.listing_a_id)
      const b = allListings.find(l => l.id === p.listing_b_id)
      console.log(`  "${a?.name}" [${a?.vertical}] ↔ "${b?.name}" [${b?.vertical}] — ${p.match_reason}`)
    }
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
