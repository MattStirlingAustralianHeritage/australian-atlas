// Unit tests for the Phase 3 Stage 1 website fetcher.
//
// All tests use a mocked `fetch` injected via opts.fetch. No real network
// calls. Tests cover: page chain order, 404 silent-skip, network-error
// recovery, delay-between-requests application, HTML stripping, URL
// normalisation, invalid-input handling.
//
// Run with:  node --test lib/pitch/stage1/fetch.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchFirstPartyPages,
  stripHtml,
  STAGE_1_PAGE_CHAIN,
  FETCH_TIMEOUT_MS,
  USER_AGENT,
} from './fetch.mjs'

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock fetch whose response varies by URL.
 *   urlResponses: { [pathOrUrlSuffix]: 'html-string' | {status: number} | {throw: Error} }
 * The default for any URL not in the map is a 404.
 */
function makeMockFetch(urlResponses, captureCalls = []) {
  return async (url, options) => {
    captureCalls.push({ url, headers: options?.headers || {}, signal: options?.signal })
    // Match by suffix to make tests less brittle
    let response = null
    for (const [suffix, val] of Object.entries(urlResponses)) {
      if (url.endsWith(suffix)) {
        response = val
        break
      }
    }
    if (!response) {
      return { ok: false, status: 404, text: async () => '' }
    }
    if (typeof response === 'string') {
      return { ok: true, status: 200, text: async () => response }
    }
    if (response.throw) {
      throw response.throw
    }
    if (response.status) {
      return { ok: response.status < 400, status: response.status, text: async () => '' }
    }
    throw new Error('makeMockFetch: bad response spec')
  }
}

/** No-op delay so tests don't actually wait. */
const noDelay = async () => {}

// ── Page chain shape ────────────────────────────────────────────────────────

test('STAGE_1_PAGE_CHAIN is frozen + matches spec', () => {
  assert.equal(Object.isFrozen(STAGE_1_PAGE_CHAIN), true)
  // Spec-locked order: homepage first, About variants next, then process/
  // team/people, then contact/journal/blog. Tail order matters less but
  // homepage MUST be first (anchors the model on canonical content).
  assert.equal(STAGE_1_PAGE_CHAIN[0], '/')
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/about'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/about-us'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/our-story'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/the-story'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/team'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/journal'))
  assert.ok(STAGE_1_PAGE_CHAIN.includes('/blog'))
})

// ── Input validation ────────────────────────────────────────────────────────

test('throws on missing websiteUrl', async () => {
  await assert.rejects(() => fetchFirstPartyPages(null), /websiteUrl is required/)
  await assert.rejects(() => fetchFirstPartyPages(''), /websiteUrl is required/)
})

test('throws on unparseable websiteUrl', async () => {
  await assert.rejects(() => fetchFirstPartyPages('http://[badurl'), /invalid websiteUrl/)
})

test('handles bare hostname (no protocol) by defaulting to https', async () => {
  const captured = []
  const mockFetch = makeMockFetch({ '/': '<html><body>Home</body></html>' }, captured)
  await fetchFirstPartyPages('example.com', {
    fetch: mockFetch,
    delay: noDelay,
    chain: ['/'],
  })
  assert.equal(captured.length, 1)
  assert.ok(captured[0].url.startsWith('https://example.com/'), `got ${captured[0].url}`)
})

test('strips trailing paths/queries from websiteUrl base', async () => {
  const captured = []
  const mockFetch = makeMockFetch({ '/': '<p>home</p>' }, captured)
  await fetchFirstPartyPages('https://example.com/some/page?query=x', {
    fetch: mockFetch,
    delay: noDelay,
    chain: ['/'],
  })
  assert.equal(captured[0].url, 'https://example.com/')
})

// ── Page chain execution ────────────────────────────────────────────────────

test('fetches every URL in the page chain, in order', async () => {
  const captured = []
  const mockFetch = makeMockFetch(
    {
      '/': '<p>home</p>',
      '/about': '<p>about</p>',
      '/team': '<p>team</p>',
    },
    captured
  )
  const chain = ['/', '/about', '/team']
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain,
  })
  // All three URLs attempted in chain order
  assert.deepEqual(
    captured.map(c => c.url),
    [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/team',
    ]
  )
  // All three returned successfully
  assert.equal(result.pages.length, 3)
  assert.equal(result.attempted.length, 3)
  assert.equal(result.errors.length, 0)
})

test('404 responses are silently skipped, not logged as errors', async () => {
  const captured = []
  const logs = []
  const mockFetch = makeMockFetch(
    {
      '/': '<p>home</p>',
      '/about': { status: 404 },
      '/team': '<p>team</p>',
    },
    captured
  )
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: noDelay,
    chain: ['/', '/about', '/team'],
    log: (level, msg) => logs.push({ level, msg }),
  })
  // Only the 200s come back as pages
  assert.equal(result.pages.length, 2)
  assert.deepEqual(result.pages.map(p => p.url), [
    'https://example.com/',
    'https://example.com/team',
  ])
  // 404 not in errors per spec ("404s are skipped silently")
  assert.equal(result.errors.length, 0)
  // 404 not logged as a warning either
  const warnings = logs.filter(l => l.level === 'warn')
  assert.equal(warnings.length, 0, 'spec: 404 should be silent')
})

test('non-404 HTTP errors are logged and recorded, chain continues', async () => {
  const captured = []
  const logs = []
  const mockFetch = makeMockFetch(
    {
      '/': '<p>home</p>',
      '/about': { status: 500 },
      '/team': '<p>team</p>',
    },
    captured
  )
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: noDelay,
    chain: ['/', '/about', '/team'],
    log: (level, msg) => logs.push({ level, msg }),
  })
  assert.equal(result.pages.length, 2) // / and /team
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].status, 500)
  assert.ok(result.errors[0].url.endsWith('/about'))
  // Chain continues past the 500
  assert.ok(result.pages.some(p => p.url.endsWith('/team')))
})

test('network errors are recovered: chain continues past thrown fetch', async () => {
  const captured = []
  const logs = []
  const mockFetch = makeMockFetch(
    {
      '/': '<p>home</p>',
      '/about': { throw: new Error('ECONNREFUSED') },
      '/team': '<p>team</p>',
    },
    captured
  )
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: noDelay,
    chain: ['/', '/about', '/team'],
    log: (level, msg) => logs.push({ level, msg }),
  })
  assert.equal(result.pages.length, 2)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].error, 'ECONNREFUSED')
  // The chain DID continue
  assert.ok(result.pages.some(p => p.url.endsWith('/team')))
})

test('AbortError is recorded as "timeout" rather than the underlying message', async () => {
  const abortErr = new Error('aborted')
  abortErr.name = 'AbortError'
  const mockFetch = makeMockFetch({
    '/': { throw: abortErr },
  })
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/'],
  })
  assert.equal(result.pages.length, 0)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].error, 'timeout')
})

// ── Delay between requests ──────────────────────────────────────────────────

test('delay is called once between each pair of requests', async () => {
  let delayCalls = 0
  const mockFetch = makeMockFetch({
    '/': '<p>1</p>',
    '/about': '<p>2</p>',
    '/team': '<p>3</p>',
  })
  await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: async () => { delayCalls++ },
    chain: ['/', '/about', '/team'],
  })
  // 3 requests → 2 delays (no delay before the first request)
  assert.equal(delayCalls, 2)
})

test('delay is NOT called before the first request', async () => {
  const order = []
  const mockFetch = async (url) => {
    order.push('fetch:' + url)
    return { ok: true, status: 200, text: async () => '<p>x</p>' }
  }
  await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: async () => { order.push('delay') },
    chain: ['/'],
  })
  assert.deepEqual(order, ['fetch:https://example.com/'])
})

test('delay receives a millisecond value in the spec range (1000-2000)', async () => {
  const delays = []
  const mockFetch = makeMockFetch({ '/': '<p>1</p>', '/about': '<p>2</p>' })
  await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch,
    delay: async (ms) => { delays.push(ms) },
    chain: ['/', '/about'],
  })
  assert.equal(delays.length, 1)
  assert.ok(delays[0] >= 1000 && delays[0] <= 2000, `delay was ${delays[0]}`)
})

// ── HTML → text stripping ───────────────────────────────────────────────────

test('stripHtml returns plain text from a typical HTML page', () => {
  const html = `
    <html>
      <head><title>X</title><style>body{color:red;}</style></head>
      <body>
        <nav>menu menu menu</nav>
        <main>
          <h1>Bream Creek Vineyard</h1>
          <p>Founded in 1990 by Fred Peacock on Tasmania's east coast.</p>
        </main>
        <footer>copyright 2026</footer>
      </body>
    </html>
  `
  const out = stripHtml(html)
  assert.ok(out.includes('Bream Creek Vineyard'))
  assert.ok(out.includes('Founded in 1990 by Fred Peacock'))
  // Script/style/nav/footer stripped
  assert.equal(out.includes('color:red'), false, 'style block must be stripped')
  assert.equal(out.includes('menu menu menu'), false, 'nav must be stripped')
  assert.equal(out.includes('copyright 2026'), false, 'footer must be stripped')
})

test('stripHtml handles empty/null/non-string input', () => {
  assert.equal(stripHtml(''), '')
  assert.equal(stripHtml(null), '')
  assert.equal(stripHtml(undefined), '')
  assert.equal(stripHtml(123), '')
})

test('fetched page text is the stripped form, not raw HTML', async () => {
  const html = '<html><body><h1>Title</h1><p>Body content here.</p></body></html>'
  const mockFetch = makeMockFetch({ '/': html })
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/'],
  })
  assert.equal(result.pages.length, 1)
  // Stripped form contains the text
  assert.ok(result.pages[0].text.includes('Title'))
  assert.ok(result.pages[0].text.includes('Body content here'))
  // Not the raw HTML
  assert.equal(result.pages[0].text.includes('<html>'), false)
  assert.equal(result.pages[0].text.includes('<p>'), false)
})

// ── Request headers ─────────────────────────────────────────────────────────

test('every request sends the spec-locked User-Agent', async () => {
  const captured = []
  const mockFetch = makeMockFetch({
    '/': '<p>1</p>',
    '/about': '<p>2</p>',
  }, captured)
  await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/', '/about'],
  })
  assert.equal(captured.length, 2)
  for (const call of captured) {
    assert.equal(
      call.headers['User-Agent'],
      USER_AGENT,
      'User-Agent header must match spec'
    )
    assert.match(
      call.headers['User-Agent'],
      /australianatlas\.com\.au/,
      'User-Agent must include contact URL'
    )
  }
})

test('every request carries an AbortController signal for timeout enforcement', async () => {
  const captured = []
  const mockFetch = makeMockFetch({ '/': '<p>x</p>' }, captured)
  await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/'],
  })
  assert.ok(captured[0].signal, 'no signal passed to fetch')
  assert.equal(typeof captured[0].signal.aborted, 'boolean')
})

// ── Page object shape ───────────────────────────────────────────────────────

test('every returned page has url, text, and fetched_at', async () => {
  const mockFetch = makeMockFetch({ '/': '<p>x</p>' })
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/'],
  })
  const page = result.pages[0]
  assert.ok(typeof page.url === 'string')
  assert.ok(typeof page.text === 'string')
  assert.ok(typeof page.fetched_at === 'string')
  // fetched_at is parseable as ISO timestamp
  assert.ok(!Number.isNaN(Date.parse(page.fetched_at)))
})

// ── Aggregate ──────────────────────────────────────────────────────────────

test('attempted array contains every URL tried, in chain order', async () => {
  const mockFetch = makeMockFetch({
    '/': '<p>1</p>',
    '/about': { status: 404 },
    '/team': '<p>3</p>',
  })
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/', '/about', '/team'],
  })
  // attempted records all tried URLs even ones that 404'd
  assert.deepEqual(result.attempted, [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/team',
  ])
  // pages only contains successes
  assert.equal(result.pages.length, 2)
})

test('venue with zero successful pages returns empty pages array (no throw)', async () => {
  // Every URL 404s
  const mockFetch = makeMockFetch({})
  const result = await fetchFirstPartyPages('https://example.com', {
    fetch: mockFetch, delay: noDelay, chain: ['/', '/about'],
  })
  assert.equal(result.pages.length, 0)
  assert.equal(result.attempted.length, 2)
  // 404s remain silent (no errors recorded)
  assert.equal(result.errors.length, 0)
})

// ── Configuration constants ────────────────────────────────────────────────

test('FETCH_TIMEOUT_MS is 10 seconds per spec', () => {
  assert.equal(FETCH_TIMEOUT_MS, 10_000)
})
