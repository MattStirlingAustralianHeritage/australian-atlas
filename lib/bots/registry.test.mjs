// Run: node --test lib/bots/registry.test.mjs
//
// The classifier feeds every number on the crawler dashboard. A false positive
// (a human counted as a bot) is worse than a miss, because it is invisible —
// so the browser cases below are the ones that matter most.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyUserAgent,
  extractUnknownName,
  BOT_CATALOGUE,
  BOT_CATEGORIES,
  BOT_TOKENS,
} from './registry.js'

// ── Real UA strings observed in site_crawler_hits ────────────────────────────
const REAL = {
  claudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  chatgptUser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  googlebotMobile: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.186 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotDesktop: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  oaiSearch: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  perplexity: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot',
}

test('classifies the nine bots the site already logs', () => {
  assert.equal(classifyUserAgent(REAL.claudeBot).name, 'ClaudeBot')
  assert.equal(classifyUserAgent(REAL.claudeBot).category, 'ai_training')
  assert.equal(classifyUserAgent(REAL.claudeBot).operator, 'Anthropic')

  assert.equal(classifyUserAgent(REAL.chatgptUser).name, 'ChatGPT-User')
  assert.equal(classifyUserAgent(REAL.chatgptUser).category, 'ai_assistant')

  assert.equal(classifyUserAgent(REAL.googlebotMobile).name, 'Googlebot')
  assert.equal(classifyUserAgent(REAL.googlebotDesktop).name, 'Googlebot')
  assert.equal(classifyUserAgent(REAL.googlebotMobile).category, 'search_engine')

  assert.equal(classifyUserAgent(REAL.oaiSearch).name, 'OAI-SearchBot')
  assert.equal(classifyUserAgent(REAL.oaiSearch).category, 'ai_search')

  assert.equal(classifyUserAgent(REAL.gptbot).name, 'GPTBot')
  assert.equal(classifyUserAgent(REAL.perplexity).name, 'PerplexityBot')
})

test('catches the bots the old nine-token list missed entirely', () => {
  const cases = [
    ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Bingbot', 'Microsoft'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)', 'Applebot', 'Apple'],
    ['Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)', 'Amazonbot', 'Amazon'],
    ['Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', 'Bytespider', 'ByteDance'],
    ['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'Meta External Agent', 'Meta'],
    ['CCBot/2.0 (https://commoncrawl.org/faq/)', 'CCBot (Common Crawl)', 'Common Crawl'],
    ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'AhrefsBot', 'Ahrefs'],
    ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Facebook Link Preview', 'Meta'],
    ['Mozilla/5.0 (compatible; DuckDuckBot/1.1; +http://duckduckgo.com/duckduckbot.html)', 'DuckDuckBot', 'DuckDuckGo'],
    ['Twitterbot/1.0', 'Twitterbot', 'X'],
  ]
  for (const [ua, name, operator] of cases) {
    const got = classifyUserAgent(ua)
    assert.ok(got, `expected a classification for ${name}`)
    assert.equal(got.name, name)
    assert.equal(got.operator, operator)
    assert.equal(got.known, true)
  }
})

test('longest token wins so specific variants beat their generic prefix', () => {
  assert.equal(
    classifyUserAgent('Mozilla/5.0 (compatible; Googlebot-Image/1.0; +http://www.google.com/bot.html)').name,
    'Googlebot Image',
  )
  assert.equal(classifyUserAgent('Applebot-Extended/1.0').name, 'Applebot-Extended')
  assert.equal(classifyUserAgent('Applebot/0.1').name, 'Applebot')
  assert.equal(classifyUserAgent('Claude-SearchBot/1.0').name, 'Claude-SearchBot')
  assert.equal(classifyUserAgent('ClaudeBot/1.0').name, 'ClaudeBot')
  assert.equal(classifyUserAgent('Claude-User/1.0').name, 'Claude-User')
})

// ── The critical direction: humans must never be logged as bots ─────────────
test('real browser user-agents are never classified as bots', () => {
  const browsers = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ]
  for (const ua of browsers) {
    assert.equal(classifyUserAgent(ua), null, `false positive on: ${ua}`)
  }
})

test('the CUBOT phone trap does not fire — a bare "bot" substring is not a bot', () => {
  // Genuine Android UAs from CUBOT handsets contain the string "bot". A naive
  // /bot/i test logs these real people as crawlers forever.
  const phones = [
    'Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.74 Mobile Safari/537.36',
  ]
  for (const ua of phones) {
    assert.equal(classifyUserAgent(ua), null, `false positive on CUBOT phone: ${ua}`)
  }
})

test('an empty or missing user-agent is not a bot', () => {
  assert.equal(classifyUserAgent(''), null)
  assert.equal(classifyUserAgent(null), null)
  assert.equal(classifyUserAgent(undefined), null)
})

// ── Unknown tail ────────────────────────────────────────────────────────────
test('unrecognised non-browser clients are still captured, named, and marked unknown', () => {
  const cases = [
    ['Mozilla/5.0 (compatible; SomeFutureBot/2.1; +http://example.com/bot)', 'SomeFutureBot'],
    ['curl/8.4.0', 'curl'],
    ['python-requests/2.31.0', 'python-requests'],
    ['Go-http-client/2.0', 'Go-http-client'],
    ['Scrapy/2.11.0 (+https://scrapy.org)', 'Scrapy'],
  ]
  for (const [ua, expectedName] of cases) {
    const got = classifyUserAgent(ua)
    assert.ok(got, `expected capture for: ${ua}`)
    assert.equal(got.known, false)
    assert.equal(got.category, 'other')
    assert.equal(got.name, expectedName)
  }
})

test('extractUnknownName pulls the product token, not the whole string', () => {
  assert.equal(extractUnknownName('Mozilla/5.0 (compatible; NewCrawler/1.0)'), 'NewCrawler')
  assert.equal(extractUnknownName('wget/1.21.4'), 'wget')
  assert.equal(extractUnknownName('total gibberish'), 'Unknown')
})

// ── Catalogue integrity ─────────────────────────────────────────────────────
test('every catalogue entry is well formed and uses a declared category', () => {
  for (const bot of BOT_CATALOGUE) {
    assert.ok(bot.token && bot.token.length >= 4, `token too short/absent: ${bot.name}`)
    assert.ok(bot.name, `missing name for token ${bot.token}`)
    assert.ok(bot.operator, `missing operator for ${bot.name}`)
    assert.ok(BOT_CATEGORIES[bot.category], `unknown category "${bot.category}" on ${bot.name}`)
    assert.ok(bot.purpose, `missing purpose for ${bot.name}`)
  }
})

test('catalogue tokens and names are unique', () => {
  const tokens = BOT_CATALOGUE.map((b) => b.token.toLowerCase())
  assert.equal(new Set(tokens).size, tokens.length, 'duplicate token in catalogue')
  const names = BOT_CATALOGUE.map((b) => b.name)
  assert.equal(new Set(names).size, names.length, 'duplicate name in catalogue')
})

test('BOT_TOKENS is sorted longest-first — the guarantee specific matching relies on', () => {
  for (let i = 1; i < BOT_TOKENS.length; i++) {
    assert.ok(
      BOT_TOKENS[i - 1].token.length >= BOT_TOKENS[i].token.length,
      'BOT_TOKENS not sorted by descending token length',
    )
  }
})

test('every classification resolves to a category the UI can render', () => {
  const sample = [...Object.values(REAL), 'curl/8.4.0', 'CCBot/2.0']
  for (const ua of sample) {
    const got = classifyUserAgent(ua)
    assert.ok(BOT_CATEGORIES[got.category], `category ${got.category} has no display metadata`)
  }
})
