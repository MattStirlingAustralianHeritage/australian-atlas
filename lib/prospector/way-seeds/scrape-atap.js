/**
 * Seed scraper: ATAP / Trust the Tick accredited operators.
 *
 * Source: trustthetick{state}.com.au (per-state subdomains)
 * Rendering: Angular.js SPA — NO server-rendered operator data.
 *
 * Status: DEFERRED to round 2. All Trust the Tick state sites are
 * Angular SPAs that load operator listings via client-side JS.
 * No sitemap, no visible REST API, no server-rendered content.
 *
 * Best path forward: ATDW (Australian Tourism Data Warehouse) API.
 * Trust the Tick is backed by ATDW data. ATDW offers a 30-day free
 * trial, then paid tiers. ATIC-accredited businesses get a 60%
 * discount on ATDW listings, and accreditation status flows through
 * ATDW data to consumer sites.
 *
 * ATDW access:
 *   Register: https://www.atdw.com.au/distributors/registering-with-atdw/
 *   API docs: https://developer.atdw.com.au/ATDWO-atlas.html
 *   Email:    distributors@atdw.com.au
 *   Phone:    1300 137 225
 *   DB size:  40,000-50,000+ tourism products
 *
 * If ATDW key obtained, the scraper would query:
 *   GET /api/atlas/products?cats=TOUR&st={state}&size=100
 *
 * Alternative: Playwright headless rendering of the Angular SPA.
 * Not recommended — ATDW API is cleaner and more maintainable.
 */

const STATE_SUBDOMAINS = [
  'trusttheticknsw.com.au',
  'trustthetickqld.com.au',
  'trustthetickvic.com.au',
  'trusttheticksa.com.au',
  'trustthetickwa.com.au',
  'trusttheticktas.com.au',
  'trusttheticknt.com.au',
  'trustthetickact.com.au',
]

/**
 * @returns {Promise<Array>} — empty; scraper deferred to round 2
 */
export async function scrapeATAP() {
  console.log('  ATAP/Trust the Tick: deferred to round 2 (ATDW API)')
  console.log('  Apply for ATDW key: https://www.atdw.com.au/distributors/registering-with-atdw/')
  console.log('  API docs: https://developer.atdw.com.au/ATDWO-atlas.html')
  return []
}

// Direct execution
if (process.argv[1] && process.argv[1].includes('scrape-atap')) {
  console.log('\n=== ATAP / Trust the Tick: status report ===\n')
  await scrapeATAP()
  console.log('\n  No data extracted. Apply for ATDW API key for round 2.')
}
