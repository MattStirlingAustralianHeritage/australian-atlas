#!/usr/bin/env node
/**
 * Gap Analysis — Corpus coverage report across verticals, states, and regions
 *
 * Shows exactly where the listing corpus is thin so expansion efforts
 * can be targeted. Outputs to console and optionally to a JSON file.
 *
 * Usage:
 *   node --env-file=.env.local scripts/gap-analysis.mjs
 *   node --env-file=.env.local scripts/gap-analysis.mjs --json > gap-report.json
 */
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)
const jsonMode = process.argv.includes('--json')

const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}
const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

function log(...args) { if (!jsonMode) console.log(...args) }
function bar(count, max, width = 40) {
  const filled = Math.round((count / Math.max(max, 1)) * width)
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
}

async function main() {
  log('\n========================================')
  log('  AUSTRALIAN ATLAS — CORPUS GAP ANALYSIS')
  log('========================================\n')

  // ── 1. Overall totals ──
  const { count: totalActive } = await sb
    .from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')

  const { count: totalWithCoords } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').not('lat', 'is', null).not('lng', 'is', null)

  const { count: totalWithImage } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').not('hero_image_url', 'is', null)

  const { count: totalWithDesc } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').not('description', 'is', null)

  log(`Total active listings: ${totalActive}`)
  log(`  With coordinates:    ${totalWithCoords} (${pct(totalWithCoords, totalActive)})`)
  log(`  With hero image:     ${totalWithImage} (${pct(totalWithImage, totalActive)})`)
  log(`  With description:    ${totalWithDesc} (${pct(totalWithDesc, totalActive)})`)
  log('')

  // ── 2. Vertical breakdown ──
  log('── LISTINGS BY VERTICAL ──')
  const verticalCounts = {}
  let maxVerticalCount = 0

  for (const v of VERTICALS) {
    const { count } = await sb
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').eq('vertical', v)
    verticalCounts[v] = count || 0
    if (count > maxVerticalCount) maxVerticalCount = count
  }

  // Sort by count ascending (thinnest first)
  const sortedVerticals = VERTICALS.slice().sort((a, b) => verticalCounts[a] - verticalCounts[b])
  for (const v of sortedVerticals) {
    const c = verticalCounts[v]
    const label = (VERTICAL_LABELS[v] + ' Atlas').padEnd(18)
    log(`  ${label} ${String(c).padStart(5)}  ${bar(c, maxVerticalCount)}`)
  }
  log('')

  // ── 3. Vertical x State matrix ──
  log('── VERTICAL x STATE MATRIX ──')
  log(`${''.padEnd(16)} ${STATES.map(s => s.padStart(5)).join('')}  TOTAL`)
  log('  ' + '-'.repeat(16 + STATES.length * 5 + 8))

  const matrix = {}
  const stateTotals = {}
  STATES.forEach(s => { stateTotals[s] = 0 })

  for (const v of sortedVerticals) {
    matrix[v] = {}
    const counts = []
    for (const s of STATES) {
      const { count } = await sb
        .from('listings').select('*', { count: 'exact', head: true })
        .eq('status', 'active').eq('vertical', v).eq('state', s)
      matrix[v][s] = count || 0
      stateTotals[s] += (count || 0)
      counts.push(count || 0)
    }
    const label = VERTICAL_LABELS[v].padEnd(14)
    const cells = counts.map(c => {
      const str = String(c).padStart(5)
      // Flag zeros and very thin counts
      if (c === 0) return `\x1b[31m${str}\x1b[0m`  // red
      if (c <= 3) return `\x1b[33m${str}\x1b[0m`    // yellow
      return str
    }).join('')
    log(`  ${label} ${cells}  ${String(verticalCounts[v]).padStart(5)}`)
  }

  // State totals row
  log('  ' + '-'.repeat(16 + STATES.length * 5 + 8))
  const totalCells = STATES.map(s => String(stateTotals[s]).padStart(5)).join('')
  log(`  ${'TOTAL'.padEnd(14)} ${totalCells}  ${String(totalActive).padStart(5)}`)
  log('')

  // ── 4. Identify critical gaps ──
  log('── CRITICAL GAPS (zero or <=3 listings) ──')
  const gaps = []
  for (const v of VERTICALS) {
    for (const s of STATES) {
      const c = matrix[v][s]
      if (c <= 3) {
        gaps.push({ vertical: v, verticalLabel: VERTICAL_LABELS[v], state: s, count: c })
      }
    }
  }
  gaps.sort((a, b) => a.count - b.count || a.verticalLabel.localeCompare(b.verticalLabel))

  if (gaps.length === 0) {
    log('  No critical gaps found!')
  } else {
    const zeros = gaps.filter(g => g.count === 0)
    const thin = gaps.filter(g => g.count > 0 && g.count <= 3)
    if (zeros.length > 0) {
      log(`  EMPTY (0 listings): ${zeros.length} vertical-state combinations`)
      for (const g of zeros) {
        log(`    - ${g.verticalLabel} Atlas in ${g.state}`)
      }
    }
    if (thin.length > 0) {
      log(`\n  VERY THIN (1-3 listings): ${thin.length} vertical-state combinations`)
      for (const g of thin) {
        log(`    - ${g.verticalLabel} Atlas in ${g.state}: ${g.count} listing${g.count !== 1 ? 's' : ''}`)
      }
    }
  }
  log('')

  // ── 5. Region coverage ──
  log('── REGION COVERAGE ──')
  const { data: regions } = await sb
    .from('regions').select('name, slug, state, listing_count, status')
    .order('listing_count', { ascending: true })

  if (regions && regions.length > 0) {
    // Verify actual listing counts using the geo query from the region pages
    log(`  ${String(regions.length).padStart(3)} total regions defined`)
    const liveRegions = regions.filter(r => r.status === 'live')
    const draftRegions = regions.filter(r => r.status !== 'live')
    log(`  ${String(liveRegions.length).padStart(3)} live (visible on site)`)
    log(`  ${String(draftRegions.length).padStart(3)} draft (not yet visible)`)
    log('')

    const thinRegions = regions.filter(r => (r.listing_count || 0) < 15)
    if (thinRegions.length > 0) {
      log(`  Regions below threshold (< 15 listings):`)
      for (const r of thinRegions) {
        log(`    - ${r.name} (${r.state}): ${r.listing_count || 0} listings ${r.status === 'draft' ? '[draft]' : ''}`)
      }
    }

    log('')
    log(`  Top 10 regions by listing count:`)
    const topRegions = [...regions].sort((a, b) => (b.listing_count || 0) - (a.listing_count || 0)).slice(0, 10)
    const maxRegionCount = topRegions[0]?.listing_count || 1
    for (const r of topRegions) {
      const name = `${r.name} (${r.state})`.padEnd(35)
      log(`    ${name} ${String(r.listing_count || 0).padStart(4)}  ${bar(r.listing_count || 0, maxRegionCount, 30)}`)
    }
  }
  log('')

  // ── 6. Data quality flags ──
  log('── DATA QUALITY ──')

  const { count: noCoords } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').is('lat', null)
  const { count: noImage } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').is('hero_image_url', null)
  const { count: noDesc } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').is('description', null)
  const { count: noRegion } = await sb
    .from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').is('region', null)

  log(`  Missing coordinates:  ${noCoords || 0} listings (invisible on map)`)
  log(`  Missing hero image:   ${noImage || 0} listings (placeholder cards)`)
  log(`  Missing description:  ${noDesc || 0} listings (empty cards)`)
  log(`  Missing region:       ${noRegion || 0} listings (not in regional pages)`)

  // Per-vertical quality
  log('')
  log('  Quality by vertical (missing data):')
  for (const v of sortedVerticals) {
    const total = verticalCounts[v]
    if (total === 0) continue
    const { count: vNoCoords } = await sb
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').eq('vertical', v).is('lat', null)
    const { count: vNoImage } = await sb
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').eq('vertical', v).is('hero_image_url', null)
    const { count: vNoDesc } = await sb
      .from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').eq('vertical', v).is('description', null)

    const issues = []
    if (vNoCoords > 0) issues.push(`${vNoCoords} no coords`)
    if (vNoImage > 0) issues.push(`${vNoImage} no image`)
    if (vNoDesc > 0) issues.push(`${vNoDesc} no desc`)
    if (issues.length > 0) {
      log(`    ${VERTICAL_LABELS[v].padEnd(14)} ${issues.join(', ')}`)
    }
  }
  log('')

  // ── 7. Geographic distribution ──
  log('── GEOGRAPHIC DISTRIBUTION ──')
  for (const v of sortedVerticals) {
    if (verticalCounts[v] === 0) continue
    const stateDist = STATES.map(s => ({ state: s, count: matrix[v][s] }))
      .sort((a, b) => b.count - a.count)
    const topState = stateDist[0]
    const concentration = topState.count / Math.max(verticalCounts[v], 1)
    if (concentration > 0.5) {
      log(`  ${VERTICAL_LABELS[v].padEnd(14)} ${pct(topState.count, verticalCounts[v])} concentrated in ${topState.state}`)
    }
  }
  log('')

  // ── JSON output ──
  if (jsonMode) {
    const report = {
      generated_at: new Date().toISOString(),
      totals: { active: totalActive, with_coords: totalWithCoords, with_image: totalWithImage, with_description: totalWithDesc },
      verticals: Object.fromEntries(VERTICALS.map(v => [v, { label: VERTICAL_LABELS[v], total: verticalCounts[v], by_state: matrix[v] }])),
      critical_gaps: gaps,
      regions: regions?.map(r => ({ name: r.name, state: r.state, slug: r.slug, listing_count: r.listing_count || 0, status: r.status })) || [],
      data_quality: {
        missing_coordinates: noCoords || 0,
        missing_hero_image: noImage || 0,
        missing_description: noDesc || 0,
        missing_region: noRegion || 0,
      },
    }
    console.log(JSON.stringify(report, null, 2))
  }

  log('========================================')
  log('  Gap analysis complete.')
  log('========================================\n')
}

function pct(part, whole) {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
