#!/usr/bin/env node
/**
 * One-off script: verify and collect domains for experience-tourism
 * groups in commercial_groups. Outputs a structured log of every
 * fetch attempt and the domains to add per group.
 *
 * Rate limit: 2s between fetches.
 * Does NOT write to the database — outputs JSON for review.
 */

import { readFileSync } from 'fs'

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function checkDomain(domain) {
  const url = `https://${domain}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const finalUrl = res.url
    const finalHost = new URL(finalUrl).hostname
    const text = await res.text()
    const isParked = text.length < 500 ||
      /domain.*for sale|parked|buy this domain|under construction/i.test(text.substring(0, 2000))
    return {
      domain,
      status: res.status,
      ok: res.ok,
      finalHost,
      redirected: finalHost !== domain && finalHost !== `www.${domain}`,
      redirectTarget: finalHost !== domain ? finalHost : null,
      parked: isParked && res.ok,
      contentLength: text.length,
      verdict: res.ok && !isParked ? 'LIVE' : res.ok && isParked ? 'PARKED' : 'FAIL',
    }
  } catch (e) {
    return {
      domain,
      status: 0,
      ok: false,
      error: e.message || String(e),
      verdict: 'UNREACHABLE',
    }
  }
}

// Candidate domains to verify per group.
// Sources: group main sites (fetched above) + known brand naming patterns.
// Each entry: [groupName, candidateDomain, source]
const CANDIDATES = [
  // Experience Co — from experienceco.com brand listing
  ['Experience Co', 'experienceco.com', 'parent group site'],
  ['Experience Co', 'skydive.com.au', 'experienceco.com brand listing'],
  ['Experience Co', 'treetopsadventure.com.au', 'experienceco.com brand listing'],
  ['Experience Co', 'greenisland.com.au', 'experienceco.com brand listing'],
  ['Experience Co', 'fitzroyislandadventures.com', 'experienceco.com brand listing'],
  ['Experience Co', 'calypsoreefcruises.com', 'experienceco.com brand listing'],
  ['Experience Co', 'reefmagic.com.au', 'experienceco.com brand listing'],
  ['Experience Co', 'cairnswhalewatching.com.au', 'experienceco.com brand listing'],
  ['Experience Co', 'daintreetours.com', 'experienceco.com brand listing'],
  ['Experience Co', 'nextlevelpark.com.au', 'experienceco.com brand listing'],
  // Big Red Cat and Wild Bush Luxury and Reef Unlimited — check common patterns
  ['Experience Co', 'bigredcat.com.au', 'brand name pattern for Big Red Cat'],
  ['Experience Co', 'wildbushluxury.com.au', 'brand name pattern for Wild Bush Luxury'],
  ['Experience Co', 'reefunlimited.com.au', 'brand name pattern for Reef Unlimited'],

  // Journey Beyond — from journeybeyond.com brand listing
  ['Journey Beyond', 'journeybeyond.com', 'parent group site'],
  ['Journey Beyond', 'journeybeyondrail.com.au', 'journeybeyond.com brand listing'],
  ['Journey Beyond', 'outbackspirittours.com.au', 'journeybeyond.com brand listing'],
  ['Journey Beyond', 'cruisewhitsundays.com', 'journeybeyond.com brand listing'],
  ['Journey Beyond', 'rottnestexpress.com.au', 'journeybeyond.com brand listing'],
  ['Journey Beyond', 'horizontalfallsadventures.com.au', 'journeybeyond.com brand listing'],
  ['Journey Beyond', 'salsalis.com.au', 'journeybeyond.com brand listing'],
  // Ghan, Indian Pacific, Great Southern are on journeybeyondrail.com.au
  // Check if they have standalone domains
  ['Journey Beyond', 'greatsouthernrail.com.au', 'brand name pattern for Great Southern'],
  ['Journey Beyond', 'theghan.com.au', 'brand name pattern for Ghan'],

  // SeaLink Marine & Tourism (Kelsian)
  ['SeaLink Marine & Tourism', 'kelsian.com', 'parent company site'],
  ['SeaLink Marine & Tourism', 'sealink.com.au', 'brand name pattern for SeaLink'],
  ['SeaLink Marine & Tourism', 'captaincookcruises.com.au', 'brand name pattern for Captain Cook Cruises'],
  ['SeaLink Marine & Tourism', 'bridgeclimb.com', 'brand name pattern for Bridgeclimb Sydney'],
  ['SeaLink Marine & Tourism', 'bridgeclimb.com.au', 'brand name pattern for Bridgeclimb Sydney AU'],

  // AAT Kings / TTC Tour Brands
  ['AAT Kings / TTC Tour Brands', 'aatkings.com.au', 'brand name pattern'],
  ['AAT Kings / TTC Tour Brands', 'aatkings.com', 'brand name pattern alt'],
  ['AAT Kings / TTC Tour Brands', 'inspiringjourneys.com', 'brand name pattern for Inspiring Journeys'],
  ['AAT Kings / TTC Tour Brands', 'inspiringjourneys.com.au', 'brand name pattern for Inspiring Journeys AU'],
  ['AAT Kings / TTC Tour Brands', 'downundertours.com', 'brand name pattern for Down Under Tours'],
  ['AAT Kings / TTC Tour Brands', 'ttc.com', 'parent company TTC'],

  // APT Travel Group
  ['APT Travel Group', 'aptouring.com', 'verified redirect from aptouring.com.au'],
  ['APT Travel Group', 'travelmarvel.com.au', 'brand name pattern for Travelmarvel'],
  ['APT Travel Group', 'botanicaworlddiscoveries.com.au', 'brand name pattern for Botanica'],

  // Intrepid Group
  ['Intrepid Group', 'intrepidtravel.com', 'intrepidtravel.com brand listing'],
  ['Intrepid Group', 'peregrineadventures.com', 'brand name pattern for Peregrine'],
  ['Intrepid Group', 'adventureworld.com.au', 'brand name pattern for Adventure World'],
  ['Intrepid Group', 'adventureworld.com', 'brand name pattern for Adventure World alt'],

  // G Adventures
  ['G Adventures', 'gadventures.com', 'verified from gadventures.com'],

  // Discovery Holiday Parks / G'day Group
  ["Discovery Holiday Parks / G'day Group", 'discoveryholidayparks.com.au', 'discoveryholidayparks.com.au main site'],
  ["Discovery Holiday Parks / G'day Group", 'gdaygroup.com.au', 'parent group domain'],
  ["Discovery Holiday Parks / G'day Group", 'gdayrewards.com.au', 'discoveryholidayparks.com.au brand listing'],
  ["Discovery Holiday Parks / G'day Group", 'gdayparks.com.au', 'brand name pattern for G\'day Parks'],

  // Voyages Indigenous Tourism Australia
  ['Voyages Indigenous Tourism Australia', 'voyages.com.au', 'voyages.com.au main site'],
  ['Voyages Indigenous Tourism Australia', 'ayersrockresort.com.au', 'voyages.com.au brand listing'],
  ['Voyages Indigenous Tourism Australia', 'mossmangorge.com.au', 'voyages.com.au brand listing'],
  ['Voyages Indigenous Tourism Australia', 'longitude131.com.au', 'voyages.com.au brand listing'],
  ['Voyages Indigenous Tourism Australia', 'homevalleystation.com.au', 'brand name pattern for Home Valley Station'],
]

async function main() {
  const results = []
  const groupDomains = {}

  for (let i = 0; i < CANDIDATES.length; i++) {
    const [group, domain, source] = CANDIDATES[i]
    if (i > 0) await sleep(2000)

    const result = await checkDomain(domain)
    result.group = group
    result.source = source
    results.push(result)

    const tag = result.verdict === 'LIVE' ? '✓' :
                result.verdict === 'PARKED' ? '⊘' :
                result.verdict === 'UNREACHABLE' ? '✗' : '✗'
    console.log(`[${String(i+1).padStart(2)}/${CANDIDATES.length}] ${tag} ${domain} → ${result.verdict} (${result.status}) ${result.redirectTarget ? `→ ${result.redirectTarget}` : ''} ${result.error || ''}`)

    if (result.verdict === 'LIVE') {
      if (!groupDomains[group]) groupDomains[group] = []
      // Use the root domain (strip www.)
      const rootDomain = domain.replace(/^www\./, '')
      if (!groupDomains[group].includes(rootDomain)) {
        groupDomains[group].push(rootDomain)
      }
    }
  }

  console.log('\n\n=== SUMMARY: Verified domains per group ===\n')
  for (const [group, domains] of Object.entries(groupDomains)) {
    console.log(`${group}:`)
    for (const d of domains) {
      console.log(`  ${d}`)
    }
    console.log()
  }

  console.log('\n=== FAILED / PARKED / UNREACHABLE ===\n')
  for (const r of results) {
    if (r.verdict !== 'LIVE') {
      console.log(`${r.group} | ${r.domain} | ${r.verdict} | status=${r.status} | ${r.error || ''} | source: ${r.source}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
