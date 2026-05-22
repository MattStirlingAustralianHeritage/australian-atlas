/**
 * Seed scraper: Ecotourism Australia ECO Certified operators.
 *
 * Source: greentravelguide.org (WordPress site, 729 listings in sitemap)
 * Rendering: individual listing pages are server-rendered WordPress.
 * Rate: fetches sitemap first, then individual pages with polite-fetch
 *       (1.5s between requests to the same host).
 *
 * Each listing page contains:
 *   - Operator name (from <title> / og:title)
 *   - Website URL (external <a> link)
 *   - Certification level (from <img alt="ECO Certified, ... level">)
 *   - Location/region (from page content)
 */

import { politeFetch } from '../polite-fetch.js'

const SITEMAP_URL = 'https://greentravelguide.org/listing-sitemap1.xml'

/**
 * @param {object} [options]
 * @param {number} [options.limit] — max listings to fetch (for sampling)
 * @param {function} [options.onProgress] — callback(fetched, total)
 * @returns {Promise<Array<{
 *   name: string,
 *   website_url: string|null,
 *   certification_level: string|null,
 *   location: string|null,
 *   listing_url: string,
 *   source: string,
 * }>>}
 */
export async function scrapeEcoCertified(options = {}) {
  const limit = options.limit || Infinity
  const onProgress = options.onProgress || (() => {})

  const sitemapRes = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'AustralianAtlas-SeedScraper/1.0 (+https://australianatlas.com.au)' },
  })
  if (!sitemapRes.ok) throw new Error(`Sitemap fetch failed: ${sitemapRes.status}`)
  const sitemapXml = await sitemapRes.text()

  const urls = []
  const locRe = /<loc>([^<]+)<\/loc>/g
  let m
  while ((m = locRe.exec(sitemapXml)) !== null) {
    urls.push(m[1])
  }
  console.log(`  sitemap: ${urls.length} listing URLs`)

  const toFetch = urls.slice(0, limit)
  const results = []
  let fetched = 0

  for (const url of toFetch) {
    try {
      const res = await politeFetch(url, {
        delayMs: 1500,
        headers: { 'User-Agent': 'AustralianAtlas-SeedScraper/1.0 (+https://australianatlas.com.au)' },
      })
      if (!res.ok) {
        console.error(`  SKIP ${url}: ${res.status}`)
        continue
      }
      const html = await res.text()
      const parsed = parseListingPage(html, url)
      if (parsed) results.push(parsed)
    } catch (err) {
      console.error(`  ERROR ${url}: ${err.message}`)
    }
    fetched++
    onProgress(fetched, toFetch.length)
  }

  return results
}

function parseListingPage(html, listingUrl) {
  // Name from og:title: "Operator Name | Green Travel Guide"
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)
  let name = titleMatch ? titleMatch[1].replace(/\s*\|\s*Green Travel Guide$/, '').trim() : null
  if (!name) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
    name = h1Match ? h1Match[1].trim() : null
  }
  if (!name) return null
  name = decodeHTMLEntities(name)

  // Certification level from cert-logo img alt text
  let certLevel = null
  const certMatch = html.match(/alt="ECO Certified,\s*([^"]+)\s*level"/)
  if (certMatch) {
    certLevel = certMatch[1].trim()
  } else {
    const certAlt = html.match(/alt="([^"]*ECO Certified[^"]*)"/)
    if (certAlt) certLevel = certAlt[1].trim()
  }

  // Additional certifications
  const roc = /Respecting our culture certified/.test(html)
  const gtl = /Green travel leader/.test(html)

  // Website URL: external href not to greentravelguide.org, ecotourism.org.au, or common non-operator sites
  let websiteUrl = null
  const hrefRe = /href="(https?:\/\/(?:www\.)?[^"]+)"/g
  const skipDomains = ['greentravelguide.org', 'ecotourism.org.au', 'winningmedia.com.au', 'fonts.googleapis.com', 'fonts.gstatic.com', 'schema.org', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'linkedin.com', 'wpmucdn.com', 'gstatic.com', 'w3.org', 'wordpress.org', 'google.com', 'googletagmanager.com']
  let hm
  while ((hm = hrefRe.exec(html)) !== null) {
    const href = hm[1]
    try {
      const host = new URL(href).hostname.toLowerCase()
      if (skipDomains.some(d => host === d || host.endsWith('.' + d))) continue
      websiteUrl = href
      break
    } catch {}
  }

  // Location from og:description or page content
  let location = null
  const regionMatch = html.match(/state_region_category\/([^/"]+)/)
  if (regionMatch) {
    location = regionMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return {
    name,
    website_url: websiteUrl,
    certification_level: certLevel,
    additional_certs: [roc && 'ROC', gtl && 'GTL'].filter(Boolean),
    location,
    listing_url: listingUrl,
    source: 'eco_certified',
  }
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

// Direct execution: fetch 10-row sample
if (process.argv[1] && process.argv[1].includes('scrape-eco-certified')) {
  console.log('\n=== ECO Certified (Green Travel Guide): 10-row sample ===\n')
  const entries = await scrapeEcoCertified({
    limit: 15,
    onProgress: (n, total) => process.stdout.write(`\r  fetching ${n}/${total}...`),
  })
  console.log(`\n\n  parsed: ${entries.length} operators from 15 fetched\n`)
  for (const e of entries.slice(0, 10)) {
    console.log(`  ${e.name}`)
    console.log(`    website:  ${e.website_url || '(none)'}`)
    console.log(`    cert:     ${e.certification_level || '(unknown)'}`)
    console.log(`    extra:    ${e.additional_certs.length ? e.additional_certs.join(', ') : '(none)'}`)
    console.log(`    location: ${e.location || '(unknown)'}`)
    console.log(`    listing:  ${e.listing_url}`)
    console.log()
  }
}
