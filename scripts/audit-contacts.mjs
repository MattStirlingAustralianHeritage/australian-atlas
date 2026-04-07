#!/usr/bin/env node
/**
 * Contact Detail Audit — verifies website URLs and phone numbers across all verticals.
 *
 * Checks every active listing for:
 *   - Website URL reachability (HTTP HEAD with fallback to GET)
 *   - Redirect chain analysis (flags unrelated domain redirects)
 *   - Phone number format validation (Australian formats)
 *   - Cross-references domain name against listing name
 *
 * Modes:
 *   --report   (default) Print report only, change nothing
 *   --fix      Null out URLs that fail verification, flag for review
 *   --json     Output machine-readable JSON report
 *   --vertical=sba  Audit a single vertical only
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-contacts.mjs
 *   node --env-file=.env.local scripts/audit-contacts.mjs --fix
 *   node --env-file=.env.local scripts/audit-contacts.mjs --vertical=sba --json
 */
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

const args = process.argv.slice(2)
const fixMode = args.includes('--fix')
const jsonMode = args.includes('--json')
const verticalArg = args.find(a => a.startsWith('--vertical='))?.split('=')[1]

const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

// Australian phone number patterns
const AU_PHONE_PATTERNS = [
  /^(?:\+?61|0)[2-478]\d{8}$/,    // landline: 02-04, 07, 08 + 8 digits
  /^(?:\+?61|0)4\d{8}$/,           // mobile: 04 + 8 digits
  /^(?:\+?61|0)1[389]\d{6,8}$/,    // special numbers
  /^13\d{4}$/,                       // 13-number (business)
  /^1[38]00\d{6}$/,                  // 1300/1800 numbers
]

function isValidAuPhone(phone) {
  if (!phone) return { valid: false, reason: 'empty' }
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '')
  if (cleaned.length < 8 || cleaned.length > 13) {
    return { valid: false, reason: `unusual length (${cleaned.length} digits)` }
  }
  const matches = AU_PHONE_PATTERNS.some(p => p.test(cleaned))
  if (!matches) {
    return { valid: false, reason: 'does not match Australian phone format' }
  }
  return { valid: true }
}

// Normalize URL for comparison
function getDomain(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// Check if two domains are related (same root domain or known redirect)
function domainsRelated(original, redirect) {
  if (!original || !redirect) return false
  if (original === redirect) return true

  // Extract root domain (last two parts)
  const rootOf = (d) => d.split('.').slice(-2).join('.')
  if (rootOf(original) === rootOf(redirect)) return true

  // Common platform redirects that are OK
  const platformDomains = ['facebook.com', 'instagram.com', 'linktr.ee', 'linktree.com', 'square.site', 'squarespace.com', 'wixsite.com', 'shopify.com', 'weebly.com']
  if (platformDomains.some(p => redirect.includes(p))) return true

  return false
}

// Check if the domain name relates to the listing name
function domainMatchesName(domain, listingName) {
  if (!domain || !listingName) return null // inconclusive
  const nameWords = listingName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  const domainLower = domain.toLowerCase()
  return nameWords.some(word => domainLower.includes(word))
}

async function checkUrl(url, timeout = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    // Try HEAD first (faster)
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'AustralianAtlas-Audit/1.0 (contact audit)' },
    })

    // Some servers reject HEAD, retry with GET
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'AustralianAtlas-Audit/1.0 (contact audit)' },
      })
    }

    clearTimeout(timer)

    const finalUrl = response.url
    const finalDomain = getDomain(finalUrl)
    const originalDomain = getDomain(url)

    return {
      reachable: true,
      status: response.status,
      ok: response.ok,
      redirected: response.redirected,
      finalUrl,
      domainChanged: originalDomain !== finalDomain,
      domainsRelated: domainsRelated(originalDomain, finalDomain),
      originalDomain,
      finalDomain,
    }
  } catch (err) {
    clearTimeout(timer)
    const isTimeout = err.name === 'AbortError'
    const isDns = err.cause?.code === 'ENOTFOUND' || err.message?.includes('ENOTFOUND')
    const isRefused = err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')
    const isCert = err.message?.includes('certificate') || err.message?.includes('SSL') || err.code === 'ERR_TLS_CERT_ALTNAME_INVALID'

    return {
      reachable: false,
      status: null,
      ok: false,
      error: isTimeout ? 'timeout' : isDns ? 'dns_failure' : isRefused ? 'connection_refused' : isCert ? 'ssl_error' : err.message?.substring(0, 80) || 'unknown',
    }
  }
}

function log(...args) { if (!jsonMode) console.log(...args) }
function bar(count, max, width = 30) {
  const filled = Math.round((count / Math.max(max, 1)) * width)
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
}

async function main() {
  log('\n================================================')
  log('  AUSTRALIAN ATLAS — CONTACT DETAIL AUDIT')
  log(`  Mode: ${fixMode ? '\x1b[33mFIX (will update database)\x1b[0m' : 'REPORT ONLY'}`)
  log('================================================\n')

  const verticalsToAudit = verticalArg ? [verticalArg] : VERTICALS
  const fullReport = {}
  let totalListings = 0
  let totalWithUrl = 0
  let totalWithPhone = 0
  let totalUrlErrors = 0
  let totalPhoneErrors = 0
  let totalFixed = 0

  for (const vertical of verticalsToAudit) {
    log(`\n── ${VERTICAL_LABELS[vertical] || vertical} Atlas ──`)

    // Fetch all active listings for this vertical
    let allListings = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await sb
        .from('listings')
        .select('id, name, slug, website, phone, address, state, region, source_id')
        .eq('status', 'active')
        .eq('vertical', vertical)
        .range(from, from + pageSize - 1)
      if (error) { log(`  Error fetching: ${error.message}`); break }
      if (!data || data.length === 0) break
      allListings = allListings.concat(data)
      if (data.length < pageSize) break
      from += pageSize
    }

    log(`  ${allListings.length} active listings`)
    totalListings += allListings.length

    const withUrl = allListings.filter(l => l.website)
    const withPhone = allListings.filter(l => l.phone)
    totalWithUrl += withUrl.length
    totalWithPhone += withPhone.length

    log(`  ${withUrl.length} with website URL, ${withPhone.length} with phone number`)

    // ── URL Audit ──
    const urlResults = {
      total: withUrl.length,
      ok: 0,
      redirect_ok: 0,
      redirect_suspicious: 0,
      not_found: 0,
      server_error: 0,
      dns_failure: 0,
      timeout: 0,
      ssl_error: 0,
      connection_refused: 0,
      other_error: 0,
      domain_mismatch: 0,
      invalid_format: 0,
      flagged: [],
    }

    if (withUrl.length > 0) {
      log(`  Checking ${withUrl.length} URLs...`)

      // Process in batches of 10 to avoid overwhelming
      const batchSize = 10
      for (let i = 0; i < withUrl.length; i += batchSize) {
        const batch = withUrl.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(async (listing) => {
            // Validate URL format first
            try {
              new URL(listing.website)
            } catch {
              return { listing, result: { reachable: false, error: 'invalid_url_format' } }
            }
            const result = await checkUrl(listing.website)
            return { listing, result }
          })
        )

        for (const { listing, result } of results) {
          if (result.error === 'invalid_url_format') {
            urlResults.invalid_format++
            urlResults.flagged.push({
              id: listing.id, name: listing.name, url: listing.website,
              issue: 'invalid_url_format', detail: 'URL does not parse',
              severity: 'error',
            })
            continue
          }

          if (!result.reachable) {
            const errorType = result.error
            if (errorType === 'timeout') urlResults.timeout++
            else if (errorType === 'dns_failure') urlResults.dns_failure++
            else if (errorType === 'connection_refused') urlResults.connection_refused++
            else if (errorType === 'ssl_error') urlResults.ssl_error++
            else urlResults.other_error++

            urlResults.flagged.push({
              id: listing.id, name: listing.name, url: listing.website,
              issue: errorType, detail: result.error,
              severity: errorType === 'dns_failure' ? 'error' : 'warning',
            })
          } else if (result.status === 404) {
            urlResults.not_found++
            urlResults.flagged.push({
              id: listing.id, name: listing.name, url: listing.website,
              issue: '404_not_found', detail: `HTTP ${result.status}`,
              severity: 'error',
            })
          } else if (result.status >= 500) {
            urlResults.server_error++
            urlResults.flagged.push({
              id: listing.id, name: listing.name, url: listing.website,
              issue: 'server_error', detail: `HTTP ${result.status}`,
              severity: 'warning',
            })
          } else if (result.domainChanged && !result.domainsRelated) {
            urlResults.redirect_suspicious++
            urlResults.domain_mismatch++
            urlResults.flagged.push({
              id: listing.id, name: listing.name, url: listing.website,
              issue: 'suspicious_redirect', detail: `${result.originalDomain} → ${result.finalDomain}`,
              severity: 'warning',
            })
          } else if (result.redirected) {
            urlResults.redirect_ok++
          } else {
            urlResults.ok++
          }

          // Check domain-name correlation
          if (result.reachable && result.ok) {
            const domain = result.finalDomain || getDomain(listing.website)
            const matches = domainMatchesName(domain, listing.name)
            if (matches === false) {
              // Domain doesn't seem to relate to the listing name — informational
              urlResults.flagged.push({
                id: listing.id, name: listing.name, url: listing.website,
                issue: 'domain_name_mismatch', detail: `Domain "${domain}" does not contain any words from listing name`,
                severity: 'info',
              })
            }
          }
        }

        // Progress indicator
        const progress = Math.min(i + batchSize, withUrl.length)
        if (!jsonMode) process.stdout.write(`\r  Checked ${progress}/${withUrl.length} URLs`)
      }
      if (!jsonMode) process.stdout.write('\n')
    }

    // ── Phone Audit ──
    const phoneResults = {
      total: withPhone.length,
      valid: 0,
      invalid: 0,
      flagged: [],
    }

    for (const listing of withPhone) {
      const check = isValidAuPhone(listing.phone)
      if (check.valid) {
        phoneResults.valid++
      } else {
        phoneResults.invalid++
        phoneResults.flagged.push({
          id: listing.id, name: listing.name, phone: listing.phone,
          issue: 'invalid_phone', detail: check.reason,
          severity: 'warning',
        })
      }
    }

    // ── Report for this vertical ──
    const urlErrors = urlResults.flagged.filter(f => f.severity === 'error')
    const urlWarnings = urlResults.flagged.filter(f => f.severity === 'warning')
    const urlInfo = urlResults.flagged.filter(f => f.severity === 'info')
    totalUrlErrors += urlErrors.length
    totalPhoneErrors += phoneResults.invalid

    log(`\n  URL Results:`)
    log(`    Reachable (OK):        ${urlResults.ok}`)
    log(`    Redirected (OK):       ${urlResults.redirect_ok}`)
    if (urlResults.redirect_suspicious > 0) log(`    \x1b[33mSuspicious redirect:   ${urlResults.redirect_suspicious}\x1b[0m`)
    if (urlResults.not_found > 0) log(`    \x1b[31m404 Not Found:         ${urlResults.not_found}\x1b[0m`)
    if (urlResults.server_error > 0) log(`    \x1b[33mServer Error (5xx):    ${urlResults.server_error}\x1b[0m`)
    if (urlResults.dns_failure > 0) log(`    \x1b[31mDNS Failure:           ${urlResults.dns_failure}\x1b[0m`)
    if (urlResults.timeout > 0) log(`    \x1b[33mTimeout:               ${urlResults.timeout}\x1b[0m`)
    if (urlResults.ssl_error > 0) log(`    \x1b[33mSSL Error:             ${urlResults.ssl_error}\x1b[0m`)
    if (urlResults.connection_refused > 0) log(`    \x1b[33mConnection Refused:    ${urlResults.connection_refused}\x1b[0m`)
    if (urlResults.invalid_format > 0) log(`    \x1b[31mInvalid Format:        ${urlResults.invalid_format}\x1b[0m`)

    log(`\n  Phone Results:`)
    log(`    Valid format:          ${phoneResults.valid}`)
    if (phoneResults.invalid > 0) log(`    \x1b[33mInvalid format:        ${phoneResults.invalid}\x1b[0m`)

    // Show flagged items
    if (urlErrors.length > 0) {
      log(`\n  \x1b[31mURL ERRORS (${urlErrors.length}) — should null:\x1b[0m`)
      for (const f of urlErrors.slice(0, 20)) {
        log(`    \x1b[31m\u2718\x1b[0m ${f.name}: ${f.url} → ${f.issue} (${f.detail})`)
      }
      if (urlErrors.length > 20) log(`    ... and ${urlErrors.length - 20} more`)
    }

    if (urlWarnings.length > 0) {
      log(`\n  \x1b[33mURL WARNINGS (${urlWarnings.length}) — review:\x1b[0m`)
      for (const f of urlWarnings.slice(0, 15)) {
        log(`    \x1b[33m\u26A0\x1b[0m ${f.name}: ${f.url} → ${f.issue} (${f.detail})`)
      }
      if (urlWarnings.length > 15) log(`    ... and ${urlWarnings.length - 15} more`)
    }

    if (phoneResults.flagged.length > 0) {
      log(`\n  \x1b[33mPHONE ISSUES (${phoneResults.flagged.length}):\x1b[0m`)
      for (const f of phoneResults.flagged.slice(0, 10)) {
        log(`    \x1b[33m\u26A0\x1b[0m ${f.name}: "${f.phone}" → ${f.detail}`)
      }
      if (phoneResults.flagged.length > 10) log(`    ... and ${phoneResults.flagged.length - 10} more`)
    }

    // ── Fix mode: null out error-severity URLs ──
    if (fixMode && urlErrors.length > 0) {
      log(`\n  \x1b[33mFIXING: Nulling ${urlErrors.length} broken URLs...\x1b[0m`)
      for (const f of urlErrors) {
        const { error } = await sb
          .from('listings')
          .update({ website: null, updated_at: new Date().toISOString() })
          .eq('id', f.id)
        if (error) {
          log(`    Failed to null ${f.name}: ${error.message}`)
        } else {
          totalFixed++
        }
      }
      log(`    Fixed ${urlErrors.length} listings`)
    }

    fullReport[vertical] = {
      label: VERTICAL_LABELS[vertical],
      total_listings: allListings.length,
      urls: { ...urlResults, flagged_count: urlResults.flagged.length },
      phones: phoneResults,
    }
  }

  // ── Overall Summary ──
  log('\n================================================')
  log('  AUDIT SUMMARY')
  log('================================================')
  log(`  Total listings audited:   ${totalListings}`)
  log(`  With website URL:         ${totalWithUrl}`)
  log(`  With phone number:        ${totalWithPhone}`)
  log(`  URL errors (should null): \x1b[31m${totalUrlErrors}\x1b[0m`)
  log(`  Phone format issues:      \x1b[33m${totalPhoneErrors}\x1b[0m`)
  if (fixMode) {
    log(`  URLs fixed (nulled):      ${totalFixed}`)
  }

  // Per-vertical summary bar chart
  log('\n  URLs by vertical (errors / total):')
  for (const v of (verticalArg ? [verticalArg] : VERTICALS)) {
    const r = fullReport[v]
    if (!r) continue
    const errors = r.urls.flagged.filter(f => f.severity === 'error').length
    const total = r.urls.total
    const label = (r.label + ' Atlas').padEnd(18)
    const errStr = String(errors).padStart(3)
    const totalStr = String(total).padStart(4)
    const errPct = total > 0 ? `${Math.round((errors / total) * 100)}%` : 'n/a'
    const color = errors === 0 ? '\x1b[32m' : errors > 5 ? '\x1b[31m' : '\x1b[33m'
    log(`  ${label} ${color}${errStr}\x1b[0m / ${totalStr}  (${errPct} error rate)  ${bar(total - errors, total)}`)
  }

  if (!fixMode && totalUrlErrors > 0) {
    log(`\n  \x1b[33mRun with --fix to null ${totalUrlErrors} broken URLs\x1b[0m`)
  }
  log('')

  // ── JSON output ──
  if (jsonMode) {
    const report = {
      generated_at: new Date().toISOString(),
      mode: fixMode ? 'fix' : 'report',
      summary: {
        total_listings: totalListings,
        with_url: totalWithUrl,
        with_phone: totalWithPhone,
        url_errors: totalUrlErrors,
        phone_errors: totalPhoneErrors,
        urls_fixed: fixMode ? totalFixed : 0,
      },
      verticals: fullReport,
    }
    console.log(JSON.stringify(report, null, 2))
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
