#!/usr/bin/env node
/**
 * URL Health Check — tests website URLs across all listings in the master DB.
 *
 * For each listing with a non-null website, performs an HTTP fetch and records
 * the result as website_status ('live', 'dead', 'redirect', 'timeout').
 *
 * Processes listings ordered by website_checked_at ASC NULLS FIRST so that
 * unchecked and oldest-checked listings are prioritised.
 *
 * Usage:
 *   node scripts/check-listing-urls.mjs
 *   node scripts/check-listing-urls.mjs --limit=50
 *
 * Env vars (loaded from .env.local if present, or via --env-file):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ── Load .env.local manually ──────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env.local')

if (fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    // Only set if not already in env (--env-file takes precedence)
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

// ── Config ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Either place them in .env.local or run with: node --env-file=.env.local scripts/check-listing-urls.mjs')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Parse CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2)
const limitArg = args.find(a => a.startsWith('--limit='))
const BATCH_SIZE = limitArg ? parseInt(limitArg.split('=')[1], 10) : 200
const RATE_LIMIT_MS = 500
const FETCH_TIMEOUT_MS = 10_000

// ── Helpers ───────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract the hostname from a URL for redirect comparison.
 */
function getHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Normalise a URL to ensure it has a protocol.
 */
function normaliseUrl(raw) {
  let url = raw.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  return url
}

/**
 * Check a single URL. Returns a website_status string.
 */
async function checkUrl(rawUrl) {
  const url = normaliseUrl(rawUrl)
  const originalHost = getHost(url)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AustralianAtlas-URLChecker/1.0',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    })

    clearTimeout(timeoutId)

    const status = response.status
    const finalHost = getHost(response.url)

    // Check if we ended up on a different domain (redirect)
    if (originalHost && finalHost && originalHost !== finalHost) {
      return 'redirect'
    }

    if (status >= 200 && status < 300) {
      return 'live'
    }

    if (status >= 400) {
      return 'dead'
    }

    // 3xx that wasn't followed (shouldn't happen with redirect: follow, but handle it)
    if (status >= 300 && status < 400) {
      return 'redirect'
    }

    return 'dead'
  } catch (err) {
    if (err.name === 'AbortError') {
      return 'timeout'
    }
    // Network errors (DNS failure, connection refused, etc.)
    const msg = err.message || ''
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') ||
        msg.includes('CERT_') || msg.includes('ERR_TLS')) {
      return 'dead'
    }
    return 'timeout'
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\nURL Health Check — checking up to ${BATCH_SIZE} listings\n`)

  // Fetch listings with non-null website, oldest-checked first
  const { data: listings, error } = await sb
    .from('listings')
    .select('id, name, vertical, website, website_status, website_checked_at')
    .not('website', 'is', null)
    .order('website_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('Failed to fetch listings:', error.message)
    process.exit(1)
  }

  if (!listings || listings.length === 0) {
    console.log('No listings with website URLs found.')
    return
  }

  console.log(`Found ${listings.length} listings to check\n`)

  const summary = { live: 0, dead: 0, redirect: 0, timeout: 0 }
  let checked = 0

  for (const listing of listings) {
    checked++
    const status = await checkUrl(listing.website)
    summary[status]++

    const icon = status === 'live' ? '[OK]' :
                 status === 'dead' ? '[DEAD]' :
                 status === 'redirect' ? '[REDIR]' : '[TIMEOUT]'

    console.log(`  ${icon} ${listing.name} — ${listing.website}`)

    // Update the listing
    const { error: updateErr } = await sb
      .from('listings')
      .update({
        website_status: status,
        website_checked_at: new Date().toISOString(),
      })
      .eq('id', listing.id)

    if (updateErr) {
      console.error(`    Failed to update ${listing.name}: ${updateErr.message}`)
    }

    // Rate limit between requests
    if (checked < listings.length) {
      await sleep(RATE_LIMIT_MS)
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50))
  console.log('Summary')
  console.log('='.repeat(50))
  console.log(`  Checked:   ${checked}`)
  console.log(`  Live:      ${summary.live}`)
  console.log(`  Dead:      ${summary.dead}`)
  console.log(`  Redirect:  ${summary.redirect}`)
  console.log(`  Timeout:   ${summary.timeout}`)
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
