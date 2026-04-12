#!/usr/bin/env node
// ============================================================
// URL staleness checker: HEAD request every listing website
// Flags url_dead in staleness_flags, updates last_verified_at
// Usage: node --env-file=.env.local scripts/check-url-staleness.mjs [--dry-run] [--limit=500]
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || Infinity
const DELAY_MS = 500  // Rate limit: 2 requests/second
const TIMEOUT_MS = 10000

async function checkUrl(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (staleness-check)' },
    })
    clearTimeout(timeout)
    return { status: res.status, ok: res.ok, redirected: res.redirected, finalUrl: res.url }
  } catch (err) {
    clearTimeout(timeout)
    const isTimeout = err.name === 'AbortError'
    return { status: 0, ok: false, error: isTimeout ? 'timeout' : err.code || err.message }
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')
  console.log(`Rate limit: ${DELAY_MS}ms between requests\n`)

  // Fetch listings with websites, ordered by least-recently-verified first
  let listings = []
  let offset = 0
  const BATCH = 500

  while (listings.length < LIMIT) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, website, staleness_flags, last_verified_at, status')
      .eq('status', 'active')
      .not('website', 'is', null)
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .range(offset, offset + BATCH - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    listings = listings.concat(data)
    offset += data.length
    if (data.length < BATCH) break
  }

  if (LIMIT < Infinity) listings = listings.slice(0, LIMIT)
  console.log(`Checking ${listings.length} listings\n`)

  let checked = 0, alive = 0, dead = 0, timeout = 0, redirected = 0, errors = 0
  const deadList = []

  for (const listing of listings) {
    checked++
    if (checked % 100 === 0) {
      console.log(`  ... ${checked}/${listings.length} checked (${alive} alive, ${dead} dead, ${timeout} timeout)`)
    }

    const result = await checkUrl(listing.website)
    const now = new Date().toISOString()

    if (result.ok) {
      alive++
      const flags = { ...(listing.staleness_flags || {}) }
      delete flags.url_dead
      delete flags.url_dead_at
      delete flags.url_status

      if (!DRY_RUN) {
        await sb.from('listings').update({
          last_verified_at: now,
          staleness_flags: Object.keys(flags).length > 0 ? flags : null,
        }).eq('id', listing.id)
      }

      if (result.redirected) redirected++
    } else if (result.status === 404 || result.status === 410) {
      dead++
      const flags = {
        ...(listing.staleness_flags || {}),
        url_dead: true,
        url_dead_at: now,
        url_status: result.status,
      }

      if (!DRY_RUN) {
        await sb.from('listings').update({
          last_verified_at: now,
          staleness_flags: flags,
        }).eq('id', listing.id)
      }

      deadList.push({ name: listing.name, url: listing.website, status: result.status })
    } else if (result.error === 'timeout') {
      timeout++
      // Don't flag as dead — could be temporary
    } else {
      errors++
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log('\n' + '═'.repeat(50))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('═'.repeat(50))
  console.log(`Checked:     ${checked}`)
  console.log(`Alive:       ${alive}`)
  console.log(`Dead (404):  ${dead}`)
  console.log(`Timeout:     ${timeout}`)
  console.log(`Redirected:  ${redirected} (still alive)`)
  console.log(`Errors:      ${errors}`)

  if (deadList.length > 0) {
    console.log(`\n── Dead URLs ──`)
    for (const d of deadList.slice(0, 50)) {
      console.log(`  ${d.status} — ${d.name}: ${d.url}`)
    }
    if (deadList.length > 50) console.log(`  ... and ${deadList.length - 50} more`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
