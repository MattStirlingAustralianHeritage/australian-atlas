#!/usr/bin/env node
/**
 * One-off enrichment script for a specific listing.
 * Fetches website, extracts og:image, calls Claude Haiku for
 * description/hours/address, then updates both vertical and master DBs.
 *
 * Usage:
 *   node --env-file=.env.local scripts/enrich-listing.mjs --slug white-whale-coffee-roasters --vertical fine_grounds --table roasters
 *   node --env-file=.env.local scripts/enrich-listing.mjs --slug <slug> --vertical <v> --table <t> --dry-run
 *   node --env-file=.env.local scripts/enrich-listing.mjs --slug <slug> --vertical <v> --table <t> --manual-json '{"description":"..."}'
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Image source whitelist — only approved domains written to hero_image_url
const APPROVED_HOSTS = ['supabase.co', 'storage.googleapis.com']
function isApprovedImageSource(url) {
  if (!url) return false
  try { return APPROVED_HOSTS.some(h => new URL(url).hostname.endsWith(h)) } catch { return false }
}

// ─── Env loading ─────────────────────────────────────────────
try {
  const envText = readFileSync('.env.local', 'utf-8')
  for (const line of envText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.substring(0, eqIdx)
    const val = trimmed.substring(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local may not exist */ }

// ─── Parse args ──────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null
}

const slug = getArg('slug')
const vertical = getArg('vertical')
const table = getArg('table')
const dryRun = args.includes('--dry-run')
const manualJsonStr = getArg('manual-json')

if (!slug || !vertical || !table) {
  console.error('Usage: node --env-file=.env.local scripts/enrich-listing.mjs --slug <slug> --vertical <vertical> --table <table>')
  process.exit(1)
}

// ─── Clients ─────────────────────────────────────────────────
const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const VERTICAL_ENV = {
  fine_grounds: { url: 'FINE_GROUNDS_SUPABASE_URL', key: 'FINE_GROUNDS_SUPABASE_SERVICE_KEY' },
  sba: { url: 'SBA_SUPABASE_URL', key: 'SBA_SUPABASE_SERVICE_KEY' },
  craft: { url: 'CRAFT_SUPABASE_URL', key: 'CRAFT_SUPABASE_SERVICE_KEY' },
  collection: { url: 'COLLECTION_SUPABASE_URL', key: 'COLLECTION_SUPABASE_SERVICE_KEY' },
  rest: { url: 'REST_SUPABASE_URL', key: 'REST_SUPABASE_SERVICE_KEY' },
  corner: { url: 'CORNER_SUPABASE_URL', key: 'CORNER_SUPABASE_SERVICE_KEY' },
  found: { url: 'FOUND_SUPABASE_URL', key: 'FOUND_SUPABASE_SERVICE_KEY' },
  table: { url: 'TABLE_SUPABASE_URL', key: 'TABLE_SUPABASE_SERVICE_KEY' },
  field: { url: 'FIELD_SUPABASE_URL', key: 'FIELD_SUPABASE_SERVICE_KEY' },
}

if (!MASTER_URL || !MASTER_KEY) { console.error('Missing master Supabase env vars'); process.exit(1) }

const vertEnv = VERTICAL_ENV[vertical]
if (!vertEnv) { console.error(`Unknown vertical: ${vertical}`); process.exit(1) }
const vertUrl = process.env[vertEnv.url]
const vertKey = process.env[vertEnv.key]
if (!vertUrl || !vertKey) { console.error(`Missing env vars for ${vertical}: ${vertEnv.url} / ${vertEnv.key}`); process.exit(1) }

const master = createClient(MASTER_URL, MASTER_KEY)
const vertClient = createClient(vertUrl, vertKey)

// ─── Fetch website ───────────────────────────────────────────

async function fetchWebsite(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (listing-enrichment)' },
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) { console.log(`  HTTP ${res.status} from ${url}`); return { text: null, ogImage: null } }

    const html = await res.text()
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    const ogImage = ogMatch?.[1] || null

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)

    return { text, ogImage }
  } catch (err) {
    console.log(`  Fetch error: ${err.message}`)
    return { text: null, ogImage: null }
  }
}

// ─── Claude enrichment ───────────────────────────────────────

async function enrichWithClaude(name, region, websiteText) {
  if (!ANTHROPIC_KEY) {
    console.log('  ⚠️  No ANTHROPIC_API_KEY — skipping Claude enrichment')
    return null
  }

  const prompt = `Extract structured venue data from this website for "${name}", a specialty coffee roaster${region ? ` in ${region}` : ''}.

Website content:
${websiteText}

Return a JSON object. Use null for any field you cannot confidently determine. Do NOT guess or invent information.

{
  "description": "2-3 sentence editorial description. Warm, concise, like a curated travel guide. Do not include the venue name.",
  "address": "Full street address",
  "suburb": "Suburb or town",
  "state": "Australian state abbreviation (NSW, VIC, QLD, SA, WA, TAS, ACT, NT)",
  "postcode": "4-digit postcode",
  "phone": "Phone number",
  "email": "Contact email",
  "opening_hours": {
    "monday": "e.g. 9:00 AM – 5:00 PM, or Closed, or null if unknown",
    "tuesday": "...", "wednesday": "...", "thursday": "...",
    "friday": "...", "saturday": "...", "sunday": "..."
  },
  "instagram_handle": "Instagram handle without @, or null"
}

Return ONLY valid JSON, no markdown fences.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.log(`  ⚠️  Claude API ${res.status}: ${errBody.slice(0, 200)}`)
      return null
    }
    const result = await res.json()
    let jsonStr = result.content?.[0]?.text?.trim() || ''
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    return JSON.parse(jsonStr)
  } catch (err) {
    console.log(`  ⚠️  Claude enrichment failed: ${err.message}`)
    return null
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Enriching: ${slug} (${vertical} → ${table})`)

  // 1. Fetch current listing from vertical DB
  const { data: listing, error: fetchErr } = await vertClient
    .from(table)
    .select('*')
    .eq('slug', slug)
    .single()

  if (fetchErr || !listing) {
    console.error(`❌ Listing not found in ${vertical}.${table}: ${fetchErr?.message || 'not found'}`)
    process.exit(1)
  }

  console.log(`  Found: "${listing.name}" (id: ${listing.id})`)
  console.log(`  Current description: ${listing.description ? listing.description.slice(0, 80) + '...' : '(none)'}`)
  console.log(`  Current hero_image: ${listing.hero_image_url || '(none)'}`)
  console.log(`  Current hours: ${listing.opening_hours ? 'yes' : '(none)'}`)
  console.log(`  Website: ${listing.website || '(none)'}`)

  if (!listing.website) {
    console.error('❌ No website URL — cannot enrich')
    process.exit(1)
  }

  // 2. Fetch website
  console.log(`\n📡 Fetching website: ${listing.website}`)
  const { text, ogImage } = await fetchWebsite(listing.website)
  console.log(`  Text: ${text ? `${text.length} chars` : 'FAILED'}`)
  console.log(`  og:image: ${ogImage || 'none found'}`)

  // 3. Get enrichment data — from Claude, manual JSON, or website scrape
  let enriched = null

  // Try manual JSON override first
  if (manualJsonStr) {
    try {
      enriched = JSON.parse(manualJsonStr)
      console.log(`\n📋 Using manual enrichment data`)
    } catch (err) {
      console.error(`❌ Invalid --manual-json: ${err.message}`)
      process.exit(1)
    }
  }

  // Try Claude if no manual data
  if (!enriched && text) {
    console.log(`\n🤖 Calling Claude Haiku...`)
    enriched = await enrichWithClaude(listing.name, listing.sub_region || listing.region, text)
    if (enriched) {
      console.log(`  Enriched fields: ${Object.keys(enriched).filter(k => enriched[k] != null).join(', ')}`)
    }
  }

  if (!enriched && !ogImage) {
    console.error('❌ No enrichment data and no og:image — nothing to update')
    process.exit(1)
  }

  enriched = enriched || {}

  // 4. Build update payload
  const verticalUpdate = {}
  if (enriched.description && !listing.description) verticalUpdate.description = enriched.description
  if (enriched.address) {
    const parts = [enriched.address]
    const locality = [enriched.suburb, [enriched.state, enriched.postcode].filter(Boolean).join(' ')].filter(Boolean)
    if (locality.length) parts.push(locality.join(' '))
    verticalUpdate.address = parts.join(', ')
  }
  if (enriched.suburb && !listing.sub_region) verticalUpdate.sub_region = enriched.suburb
  if (enriched.state && !listing.state) verticalUpdate.state = enriched.state
  if (enriched.phone && !listing.phone) verticalUpdate.phone = enriched.phone
  if (enriched.email && !listing.email) verticalUpdate.email = enriched.email
  if (enriched.opening_hours && !listing.opening_hours) verticalUpdate.opening_hours = enriched.opening_hours
  if (ogImage && !listing.hero_image_url) {
    if (isApprovedImageSource(ogImage)) {
      verticalUpdate.hero_image_url = ogImage
    } else {
      console.log(`  ⚠️  og:image from external domain (skipped for hero): ${ogImage}`)
    }
  }

  if (Object.keys(verticalUpdate).length === 0) {
    console.log('\n✅ Nothing to update — listing already enriched')
    return
  }

  console.log(`\n📝 Update payload (${Object.keys(verticalUpdate).length} fields):`)
  for (const [k, v] of Object.entries(verticalUpdate)) {
    const display = typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100)
    console.log(`  ${k}: ${display}`)
  }

  if (dryRun) {
    console.log('\n🏁 Dry run — no changes written')
    return
  }

  // 5. Update vertical DB
  console.log(`\n💾 Updating ${vertical}.${table}...`)
  const { error: vertErr } = await vertClient
    .from(table)
    .update(verticalUpdate)
    .eq('id', listing.id)

  if (vertErr) {
    console.error(`❌ Vertical update failed: ${vertErr.message}`)
  } else {
    console.log(`  ✅ Vertical updated`)
  }

  // 6. Update master listing
  console.log(`💾 Updating master listings...`)
  const masterUpdate = {}
  if (verticalUpdate.description) masterUpdate.description = verticalUpdate.description
  if (verticalUpdate.address) masterUpdate.address = verticalUpdate.address
  if (verticalUpdate.state) masterUpdate.state = verticalUpdate.state
  if (verticalUpdate.phone) masterUpdate.phone = verticalUpdate.phone
  if (verticalUpdate.hero_image_url) masterUpdate.hero_image_url = verticalUpdate.hero_image_url

  if (Object.keys(masterUpdate).length > 0) {
    const { data: masterRow, error: masterFetchErr } = await master
      .from('listings')
      .select('id')
      .eq('vertical', vertical)
      .eq('slug', slug)
      .maybeSingle()

    if (masterRow) {
      const { error: masterErr } = await master
        .from('listings')
        .update(masterUpdate)
        .eq('id', masterRow.id)

      if (masterErr) {
        console.error(`❌ Master update failed: ${masterErr.message}`)
      } else {
        console.log(`  ✅ Master listing updated (id: ${masterRow.id})`)
      }
    } else {
      console.log(`  ⚠️  No master listing found for ${vertical}/${slug}`)
    }
  }

  console.log(`\n🏁 Done — enrichment complete for ${listing.name}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
