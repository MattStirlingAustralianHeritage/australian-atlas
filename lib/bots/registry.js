// lib/bots/registry.js
// The Atlas bot catalogue — the single source of truth for "what is this
// non-human client, who runs it, and why should we care".
//
// Imported by middleware (Vercel Edge runtime) via lib/crawler-log.js, so this
// file has ZERO imports and uses no node APIs. Anything added here must stay
// pure — an edge-incompatible import fails the build.
//
// Why a catalogue and not a token list: the original implementation matched
// nine hard-coded tokens (GPTBot, ClaudeBot, Googlebot, …). Everything else —
// Bingbot, Applebot, Amazonbot, Bytespider, Meta's crawlers, Common Crawl,
// every SEO backlink crawler — hit the site completely unobserved. You cannot
// report on a bot you never wrote down. This catalogue classifies rather than
// filters: known bots resolve to a named entry, and anything else that is
// plainly not a browser is still recorded, as `Unknown` in category `other`,
// so the unknown tail is visible instead of silently dropped.

// ── Categories ───────────────────────────────────────────────────────────────
// Ordered by how much they matter commercially, most valuable first. The UI
// reads label/blurb/color straight off this map, so a new category needs no
// front-end change.
export const BOT_CATEGORIES = {
  ai_assistant: {
    label: 'AI assistant (user-prompted)',
    short: 'AI assistant',
    blurb: 'A real person asked an AI about you and it fetched this page live. The highest-intent bot traffic there is.',
    color: '#B8862B',
    ai: true,
  },
  ai_search: {
    label: 'AI search index',
    short: 'AI search',
    blurb: 'Builds the retrieval index an AI answers from. Determines whether you can be cited at all.',
    color: '#6B7F5E',
    ai: true,
  },
  ai_training: {
    label: 'AI training corpus',
    short: 'AI training',
    blurb: 'Collects pages as model training data. No referral traffic, but it is how a model learns you exist.',
    color: '#8A6520',
    ai: true,
  },
  search_engine: {
    label: 'Search engine',
    short: 'Search',
    blurb: 'Classic web search indexing — the traditional SEO surface.',
    color: '#3D5A6E',
    ai: false,
  },
  seo_tool: {
    label: 'SEO / market intelligence',
    short: 'SEO tool',
    blurb: 'Backlink and competitor crawlers. Pure cost: they consume bandwidth and send nothing back.',
    color: '#8B8578',
    ai: false,
  },
  social: {
    label: 'Social unfurler',
    short: 'Social',
    blurb: 'Fetches a page because somebody shared the link, to build the preview card.',
    color: '#7A5C8E',
    ai: false,
  },
  archive: {
    label: 'Archive',
    short: 'Archive',
    blurb: 'Preservation crawlers such as the Internet Archive.',
    color: '#5E7F7A',
    ai: false,
  },
  monitoring: {
    label: 'Uptime / monitoring',
    short: 'Monitoring',
    blurb: 'Health checks and synthetic monitoring, ours or a third party’s.',
    color: '#7F8E9E',
    ai: false,
  },
  security: {
    label: 'Scanner / probe',
    short: 'Scanner',
    blurb: 'Internet-wide scanners and vulnerability probes. Worth watching for abuse.',
    color: '#A85A4A',
    ai: false,
  },
  other: {
    label: 'Other / unidentified',
    short: 'Other',
    blurb: 'Scripted clients that are plainly not browsers but match no known crawler.',
    color: '#6E6A63',
    ai: false,
  },
}

export const CATEGORY_ORDER = Object.keys(BOT_CATEGORIES)

// ── The catalogue ────────────────────────────────────────────────────────────
// `token` is matched case-insensitively as a substring of the User-Agent.
// Longest token wins (see compare in BOT_TOKENS below), so `Applebot-Extended`
// resolves before `Applebot` and `Googlebot-Image` before `Googlebot` without
// any ordering discipline required here.
//
// `respects` records the robots.txt user-agent string an operator honours,
// where it differs from the crawler token — that is the string you would put in
// robots.txt to control it, and it is frequently NOT the UA token. Google-Extended
// and Applebot-Extended are the canonical examples: opt-out tokens that never
// appear in a real User-Agent header.
export const BOT_CATALOGUE = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  { token: 'GPTBot', name: 'GPTBot', operator: 'OpenAI', category: 'ai_training',
    purpose: 'Crawls pages as candidate OpenAI model training data.', respects: 'GPTBot' },
  { token: 'OAI-SearchBot', name: 'OAI-SearchBot', operator: 'OpenAI', category: 'ai_search',
    purpose: 'Builds the ChatGPT search index. Blocking it removes you from ChatGPT search results.', respects: 'OAI-SearchBot' },
  { token: 'ChatGPT-User', name: 'ChatGPT-User', operator: 'OpenAI', category: 'ai_assistant',
    purpose: 'A live fetch triggered by a ChatGPT user opening or browsing your link.', respects: 'ChatGPT-User' },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  { token: 'ClaudeBot', name: 'ClaudeBot', operator: 'Anthropic', category: 'ai_training',
    purpose: 'Crawls pages as candidate Claude training data.', respects: 'ClaudeBot' },
  { token: 'Claude-SearchBot', name: 'Claude-SearchBot', operator: 'Anthropic', category: 'ai_search',
    purpose: 'Indexes pages so Claude can cite them in search results.', respects: 'Claude-SearchBot' },
  { token: 'Claude-User', name: 'Claude-User', operator: 'Anthropic', category: 'ai_assistant',
    purpose: 'A live fetch triggered by a Claude user following your link.', respects: 'Claude-User' },
  { token: 'anthropic-ai', name: 'anthropic-ai (legacy)', operator: 'Anthropic', category: 'ai_training',
    purpose: 'Superseded legacy Anthropic crawler token.', respects: 'anthropic-ai' },

  // ── Perplexity ────────────────────────────────────────────────────────────
  { token: 'PerplexityBot', name: 'PerplexityBot', operator: 'Perplexity', category: 'ai_search',
    purpose: 'Builds the Perplexity answer index.', respects: 'PerplexityBot' },
  { token: 'Perplexity-User', name: 'Perplexity-User', operator: 'Perplexity', category: 'ai_assistant',
    purpose: 'A live fetch triggered by a Perplexity user following a citation.', respects: 'Perplexity-User' },

  // ── Google ────────────────────────────────────────────────────────────────
  // Google-Extended is deliberately absent: it is a robots.txt opt-out token
  // for Gemini/Vertex training and never appears in a User-Agent header.
  { token: 'Googlebot-Image', name: 'Googlebot Image', operator: 'Google', category: 'search_engine',
    purpose: 'Indexes images for Google Images.', respects: 'Googlebot-Image' },
  { token: 'Googlebot-Video', name: 'Googlebot Video', operator: 'Google', category: 'search_engine',
    purpose: 'Indexes video content.', respects: 'Googlebot-Video' },
  { token: 'Googlebot-News', name: 'Googlebot News', operator: 'Google', category: 'search_engine',
    purpose: 'Indexes for Google News.', respects: 'Googlebot-News' },
  { token: 'Storebot-Google', name: 'Google StoreBot', operator: 'Google', category: 'search_engine',
    purpose: 'Checks shopping and checkout experiences.', respects: 'Storebot-Google' },
  { token: 'Google-InspectionTool', name: 'Google Inspection Tool', operator: 'Google', category: 'search_engine',
    purpose: 'Search Console live URL inspection and rich-result testing.', respects: 'Google-InspectionTool' },
  { token: 'GoogleOther', name: 'GoogleOther', operator: 'Google', category: 'search_engine',
    purpose: 'Internal Google research and one-off product crawls.', respects: 'GoogleOther' },
  { token: 'Google-CloudVertexBot', name: 'Google CloudVertexBot', operator: 'Google', category: 'ai_training',
    purpose: 'Fetches pages for Vertex AI agents built by Google Cloud customers.', respects: 'Google-CloudVertexBot' },
  { token: 'Google-Safety', name: 'Google Safety', operator: 'Google', category: 'security',
    purpose: 'Malware and abuse review. Ignores robots.txt by design.', respects: null },
  { token: 'AdsBot-Google', name: 'AdsBot Google', operator: 'Google', category: 'search_engine',
    purpose: 'Checks ad landing-page quality.', respects: 'AdsBot-Google' },
  { token: 'Mediapartners-Google', name: 'Google AdSense', operator: 'Google', category: 'search_engine',
    purpose: 'Crawls for AdSense contextual ad matching.', respects: 'Mediapartners-Google' },
  { token: 'Googlebot', name: 'Googlebot', operator: 'Google', category: 'search_engine',
    purpose: 'The main Google Search crawler. Your organic search visibility depends on it.', respects: 'Googlebot' },
  { token: 'Google-Extended', name: 'Google-Extended', operator: 'Google', category: 'ai_training',
    purpose: 'Gemini training opt-out token. Should never appear as a real UA — if it does, treat it as spoofed.', respects: 'Google-Extended' },

  // ── Microsoft / Bing ──────────────────────────────────────────────────────
  { token: 'BingPreview', name: 'BingPreview', operator: 'Microsoft', category: 'search_engine',
    purpose: 'Generates Bing page snapshots.', respects: 'bingbot' },
  { token: 'bingbot', name: 'Bingbot', operator: 'Microsoft', category: 'search_engine',
    purpose: 'Bing Search crawler — and the index behind Copilot answers.', respects: 'bingbot' },
  { token: 'msnbot', name: 'msnbot (legacy)', operator: 'Microsoft', category: 'search_engine',
    purpose: 'Legacy MSN crawler token.', respects: 'msnbot' },

  // ── Apple ─────────────────────────────────────────────────────────────────
  { token: 'Applebot-Extended', name: 'Applebot-Extended', operator: 'Apple', category: 'ai_training',
    purpose: 'Apple Intelligence training opt-out token. Rarely a real UA.', respects: 'Applebot-Extended' },
  { token: 'Applebot', name: 'Applebot', operator: 'Apple', category: 'ai_search',
    purpose: 'Powers Siri, Spotlight and Apple Intelligence lookups.', respects: 'Applebot' },

  // ── Amazon ────────────────────────────────────────────────────────────────
  { token: 'Amazonbot', name: 'Amazonbot', operator: 'Amazon', category: 'ai_training',
    purpose: 'Feeds Alexa and Amazon’s Rufus assistant.', respects: 'Amazonbot' },

  // ── Meta ──────────────────────────────────────────────────────────────────
  { token: 'meta-externalagent', name: 'Meta External Agent', operator: 'Meta', category: 'ai_training',
    purpose: 'Crawls for Meta AI / Llama training data.', respects: 'meta-externalagent' },
  { token: 'meta-externalfetcher', name: 'Meta External Fetcher', operator: 'Meta', category: 'ai_assistant',
    purpose: 'A live fetch triggered by a Meta AI user request.', respects: 'meta-externalfetcher' },
  { token: 'facebookexternalhit', name: 'Facebook Link Preview', operator: 'Meta', category: 'social',
    purpose: 'Builds the preview card when your link is shared on Facebook or WhatsApp.', respects: 'facebookexternalhit' },
  { token: 'FacebookBot', name: 'FacebookBot', operator: 'Meta', category: 'ai_training',
    purpose: 'Crawls for Meta speech and language model training.', respects: 'FacebookBot' },

  // ── ByteDance ─────────────────────────────────────────────────────────────
  { token: 'Bytespider', name: 'Bytespider', operator: 'ByteDance', category: 'ai_training',
    purpose: 'ByteDance/TikTok LLM training crawler. Notoriously aggressive and a frequent robots.txt violator.', respects: 'Bytespider' },
  { token: 'TikTokSpider', name: 'TikTokSpider', operator: 'ByteDance', category: 'ai_training',
    purpose: 'ByteDance content crawler.', respects: 'TikTokSpider' },

  // ── Other AI labs and answer engines ──────────────────────────────────────
  { token: 'CCBot', name: 'CCBot (Common Crawl)', operator: 'Common Crawl', category: 'ai_training',
    purpose: 'Builds the Common Crawl corpus — the single most reused LLM training dataset on the web.', respects: 'CCBot' },
  { token: 'cohere-ai', name: 'cohere-ai', operator: 'Cohere', category: 'ai_training',
    purpose: 'Cohere model training crawler.', respects: 'cohere-ai' },
  { token: 'cohere-training-data-crawler', name: 'Cohere Training Crawler', operator: 'Cohere', category: 'ai_training',
    purpose: 'Cohere training-data collection.', respects: 'cohere-training-data-crawler' },
  { token: 'MistralAI-User', name: 'MistralAI-User', operator: 'Mistral', category: 'ai_assistant',
    purpose: 'A live fetch triggered by a Le Chat user.', respects: 'MistralAI-User' },
  { token: 'DuckAssistBot', name: 'DuckAssistBot', operator: 'DuckDuckGo', category: 'ai_search',
    purpose: 'Powers DuckDuckGo’s AI answer summaries.', respects: 'DuckAssistBot' },
  { token: 'YouBot', name: 'YouBot', operator: 'You.com', category: 'ai_search',
    purpose: 'Indexes for the You.com answer engine.', respects: 'YouBot' },
  { token: 'AI2Bot', name: 'AI2Bot', operator: 'Allen Institute', category: 'ai_training',
    purpose: 'Collects open training data for AI2 research models.', respects: 'AI2Bot' },
  { token: 'Diffbot', name: 'Diffbot', operator: 'Diffbot', category: 'ai_training',
    purpose: 'Builds a commercial structured knowledge graph sold to AI firms.', respects: 'Diffbot' },
  { token: 'omgili', name: 'Omgili / Webz.io', operator: 'Webz.io', category: 'ai_training',
    purpose: 'Resells crawled web data as LLM training corpora.', respects: 'omgili' },
  { token: 'Webzio-Extended', name: 'Webzio-Extended', operator: 'Webz.io', category: 'ai_training',
    purpose: 'Webz.io training-data collection.', respects: 'Webzio-Extended' },
  { token: 'ImagesiftBot', name: 'ImagesiftBot', operator: 'Hive', category: 'ai_training',
    purpose: 'Harvests images for computer-vision training sets.', respects: 'ImagesiftBot' },
  { token: 'Timpibot', name: 'Timpibot', operator: 'Timpi', category: 'ai_training',
    purpose: 'Decentralised search and AI dataset crawler.', respects: 'Timpibot' },
  { token: 'PanguBot', name: 'PanguBot', operator: 'Huawei', category: 'ai_training',
    purpose: 'Crawls for Huawei’s PanGu models.', respects: 'PanguBot' },
  { token: 'Kangaroo Bot', name: 'Kangaroo Bot', operator: 'Kangaroo LLM', category: 'ai_training',
    purpose: 'Open Australian LLM training crawler.', respects: 'Kangaroo Bot' },
  { token: 'firecrawl', name: 'Firecrawl', operator: 'Firecrawl', category: 'ai_training',
    purpose: 'Developer scraping service that converts sites into LLM-ready text.', respects: 'FirecrawlAgent' },

  // ── Other search engines ──────────────────────────────────────────────────
  { token: 'DuckDuckBot', name: 'DuckDuckBot', operator: 'DuckDuckGo', category: 'search_engine',
    purpose: 'DuckDuckGo web crawler.', respects: 'DuckDuckBot' },
  { token: 'YandexBot', name: 'YandexBot', operator: 'Yandex', category: 'search_engine',
    purpose: 'Yandex Search crawler.', respects: 'Yandex' },
  { token: 'Baiduspider', name: 'Baiduspider', operator: 'Baidu', category: 'search_engine',
    purpose: 'Baidu Search crawler.', respects: 'Baiduspider' },
  { token: 'Slurp', name: 'Yahoo Slurp', operator: 'Yahoo', category: 'search_engine',
    purpose: 'Yahoo Search crawler.', respects: 'Slurp' },
  { token: 'SeznamBot', name: 'SeznamBot', operator: 'Seznam', category: 'search_engine',
    purpose: 'Czech search engine crawler.', respects: 'SeznamBot' },
  { token: 'Qwantbot', name: 'Qwantbot', operator: 'Qwant', category: 'search_engine',
    purpose: 'Qwant (EU privacy search) crawler.', respects: 'Qwantbot' },
  { token: 'Neevabot', name: 'Neevabot', operator: 'Neeva', category: 'search_engine',
    purpose: 'Legacy Neeva crawler.', respects: 'Neevabot' },
  { token: 'PetalBot', name: 'PetalBot', operator: 'Huawei', category: 'search_engine',
    purpose: 'Huawei Petal Search crawler.', respects: 'PetalBot' },

  // ── SEO / market intelligence ─────────────────────────────────────────────
  { token: 'AhrefsBot', name: 'AhrefsBot', operator: 'Ahrefs', category: 'seo_tool',
    purpose: 'Backlink index for the Ahrefs SEO product.', respects: 'AhrefsBot' },
  { token: 'SemrushBot', name: 'SemrushBot', operator: 'Semrush', category: 'seo_tool',
    purpose: 'Backlink and keyword index for Semrush.', respects: 'SemrushBot' },
  { token: 'DataForSeoBot', name: 'DataForSeoBot', operator: 'DataForSEO', category: 'seo_tool',
    purpose: 'Resold SEO data crawler.', respects: 'DataForSeoBot' },
  { token: 'MJ12bot', name: 'MJ12bot', operator: 'Majestic', category: 'seo_tool',
    purpose: 'Majestic distributed backlink crawler.', respects: 'MJ12bot' },
  { token: 'DotBot', name: 'DotBot', operator: 'Moz', category: 'seo_tool',
    purpose: 'Moz link index crawler.', respects: 'DotBot' },
  { token: 'rogerbot', name: 'rogerbot', operator: 'Moz', category: 'seo_tool',
    purpose: 'Moz site-audit crawler.', respects: 'rogerbot' },
  { token: 'BLEXBot', name: 'BLEXBot', operator: 'WebMeUp', category: 'seo_tool',
    purpose: 'Backlink index crawler.', respects: 'BLEXBot' },
  { token: 'Barkrowler', name: 'Barkrowler', operator: 'Babbar', category: 'seo_tool',
    purpose: 'Babbar.tech link-graph crawler.', respects: 'Barkrowler' },
  { token: 'SEOkicks', name: 'SEOkicks', operator: 'SEOkicks', category: 'seo_tool',
    purpose: 'Backlink index crawler.', respects: 'SEOkicks' },
  { token: 'Screaming Frog', name: 'Screaming Frog', operator: 'Screaming Frog', category: 'seo_tool',
    purpose: 'Desktop SEO auditing spider — usually somebody deliberately auditing the site.', respects: 'Screaming Frog SEO Spider' },
  { token: 'ZoominfoBot', name: 'ZoominfoBot', operator: 'ZoomInfo', category: 'seo_tool',
    purpose: 'Harvests business contact data for a sales database.', respects: 'ZoominfoBot' },
  { token: 'serpstatbot', name: 'serpstatbot', operator: 'Serpstat', category: 'seo_tool',
    purpose: 'SEO backlink crawler.', respects: 'serpstatbot' },

  // ── Social unfurlers ──────────────────────────────────────────────────────
  { token: 'Twitterbot', name: 'Twitterbot', operator: 'X', category: 'social',
    purpose: 'Builds the X/Twitter link preview card.', respects: 'Twitterbot' },
  { token: 'LinkedInBot', name: 'LinkedInBot', operator: 'LinkedIn', category: 'social',
    purpose: 'Builds the LinkedIn link preview card.', respects: 'LinkedInBot' },
  { token: 'Pinterestbot', name: 'Pinterestbot', operator: 'Pinterest', category: 'social',
    purpose: 'Fetches pages when something is pinned.', respects: 'Pinterestbot' },
  { token: 'redditbot', name: 'redditbot', operator: 'Reddit', category: 'social',
    purpose: 'Builds the Reddit link preview.', respects: 'redditbot' },
  { token: 'Slackbot', name: 'Slackbot', operator: 'Slack', category: 'social',
    purpose: 'Unfurls links pasted into Slack.', respects: 'Slackbot' },
  { token: 'Discordbot', name: 'Discordbot', operator: 'Discord', category: 'social',
    purpose: 'Unfurls links pasted into Discord.', respects: 'Discordbot' },
  { token: 'TelegramBot', name: 'TelegramBot', operator: 'Telegram', category: 'social',
    purpose: 'Unfurls links shared in Telegram.', respects: 'TelegramBot' },
  { token: 'WhatsApp', name: 'WhatsApp', operator: 'Meta', category: 'social',
    purpose: 'Builds the WhatsApp link preview.', respects: 'WhatsApp' },
  { token: 'Embedly', name: 'Embedly', operator: 'Embedly', category: 'social',
    purpose: 'Third-party link-preview service.', respects: 'Embedly' },

  // ── Archive ───────────────────────────────────────────────────────────────
  { token: 'archive.org_bot', name: 'Internet Archive', operator: 'Internet Archive', category: 'archive',
    purpose: 'Wayback Machine preservation crawler.', respects: 'archive.org_bot' },
  { token: 'ia_archiver', name: 'ia_archiver (legacy)', operator: 'Internet Archive', category: 'archive',
    purpose: 'Legacy Internet Archive crawler token.', respects: 'ia_archiver' },
  { token: 'Wayback Save Page', name: 'Wayback Save Page', operator: 'Internet Archive', category: 'archive',
    purpose: 'Somebody manually saved this page to the Wayback Machine.', respects: null },

  // ── Monitoring ────────────────────────────────────────────────────────────
  { token: 'UptimeRobot', name: 'UptimeRobot', operator: 'UptimeRobot', category: 'monitoring',
    purpose: 'Uptime health check.', respects: 'UptimeRobot' },
  { token: 'Pingdom', name: 'Pingdom', operator: 'SolarWinds', category: 'monitoring',
    purpose: 'Synthetic uptime and performance monitoring.', respects: 'Pingdom' },
  { token: 'Better Uptime', name: 'Better Uptime', operator: 'Better Stack', category: 'monitoring',
    purpose: 'Uptime health check.', respects: null },
  { token: 'StatusCake', name: 'StatusCake', operator: 'StatusCake', category: 'monitoring',
    purpose: 'Uptime health check.', respects: 'StatusCake' },
  { token: 'Vercelbot', name: 'Vercelbot', operator: 'Vercel', category: 'monitoring',
    purpose: 'Vercel platform checks and screenshot generation — our own hosting.', respects: null },
  { token: 'Chrome-Lighthouse', name: 'Lighthouse', operator: 'Google', category: 'monitoring',
    purpose: 'Performance and SEO audit run against the page.', respects: null },
  { token: 'GTmetrix', name: 'GTmetrix', operator: 'GTmetrix', category: 'monitoring',
    purpose: 'Page-speed audit.', respects: null },

  // ── Scanners and probes ───────────────────────────────────────────────────
  { token: 'CensysInspect', name: 'Censys', operator: 'Censys', category: 'security',
    purpose: 'Internet-wide asset scanner.', respects: null },
  { token: 'Expanse', name: 'Expanse', operator: 'Palo Alto', category: 'security',
    purpose: 'Attack-surface scanner.', respects: null },
  { token: 'InternetMeasurement', name: 'InternetMeasurement', operator: 'Driftnet', category: 'security',
    purpose: 'Internet measurement scanner.', respects: null },
  { token: 'zgrab', name: 'zgrab', operator: 'ZMap', category: 'security',
    purpose: 'Banner-grabbing scanner, common in opportunistic probing.', respects: null },
  { token: 'masscan', name: 'masscan', operator: 'unknown', category: 'security',
    purpose: 'Mass port scanner.', respects: null },
  { token: 'Nuclei', name: 'Nuclei', operator: 'ProjectDiscovery', category: 'security',
    purpose: 'Vulnerability template scanner. Frequently hostile.', respects: null },
  { token: 'sqlmap', name: 'sqlmap', operator: 'unknown', category: 'security',
    purpose: 'Automated SQL-injection tool. Always hostile.', respects: null },
]

// Longest token first, so a specific token always beats the generic one it
// contains (Applebot-Extended > Applebot, Googlebot-Image > Googlebot).
export const BOT_TOKENS = [...BOT_CATALOGUE].sort((a, b) => b.token.length - a.token.length)

// Fast lookup for the backfill / display paths that already know a bot_name.
export const BOT_BY_NAME = new Map(BOT_CATALOGUE.map((b) => [b.name, b]))

// One regex over every catalogue token. This is the cheap first gate.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
export const KNOWN_BOT_RE = new RegExp(`(${BOT_TOKENS.map((b) => escapeRe(b.token)).join('|')})`, 'i')

// ── Generic (unknown) bot detection ──────────────────────────────────────────
// Deliberately conservative. Anything matching here that is NOT in the
// catalogue is still worth recording, but a false positive silently pollutes
// every number on the dashboard, so the patterns must not fire on real
// browsers. Two traps this avoids:
//   • `\bbot\b` alone matches the Android phone brand "CUBOT" in genuine mobile
//     UAs, hence the `[-_ /]?bot[-_ /0-9.]` shape rather than a bare substring.
//   • Real browsers never send an empty UA; an empty UA is not evidence of a
//     bot either way, so it is left to the browser check below.
const GENERIC_BOT_PATTERNS = [
  /(?:^|[^a-z])(?:bot|crawler|spider|scraper)(?:[^a-z]|$)/i,
  /(?:crawl|spider)(?:er|ing)?[-_/ ]?\d/i,
  /python-requests|python-urllib|aiohttp|httpx/i,
  /\bcurl\/|\bwget\b|libwww-perl|lwp::|java\/\d|okhttp|go-http-client|node-fetch|axios\/|guzzlehttp|ruby\b.*rest-client|\.net httpclient|apache-httpclient/i,
  /headlesschrome|phantomjs|puppeteer|playwright|selenium|scrapy|httrack|wordpress\/|feedfetcher|rss|universal feed parser/i,
]

// If a UA carries a real browser engine signature AND none of the generic
// markers, it is a human. Bots that impersonate browsers wholesale are
// indistinguishable at this layer by design — that is what IP verification is
// for, not user-agent sniffing.
const BROWSER_RE = /Mozilla\/|AppleWebKit\/|Gecko\/|Chrome\/|Safari\/|Firefox\/|Edg\/|OPR\//i

/**
 * Pull a plausible product token out of an unrecognised bot UA, so the
 * "unidentified" bucket is still broken down by client instead of collapsing
 * into one opaque row. Returns e.g. "SomeNewBot" from
 * "Mozilla/5.0 (compatible; SomeNewBot/2.1; +http://example.com/bot)".
 */
export function extractUnknownName(ua) {
  const raw = String(ua || '')
  // A product token adjacent to a bot-ish word is the most reliable signal.
  const m = raw.match(/([A-Za-z][A-Za-z0-9._-]{1,40}?(?:bot|crawler|spider|scraper))(?:[/ ;)]|$)/i)
  if (m) return m[1]
  // Otherwise the leading product token of a non-Mozilla UA (curl/8.4.0 → curl).
  const lead = raw.match(/^([A-Za-z][A-Za-z0-9._-]{1,40})\//)
  if (lead && !/^Mozilla$/i.test(lead[1])) return lead[1]
  return 'Unknown'
}

/**
 * Classify a User-Agent.
 *
 * @param {string} ua raw User-Agent header
 * @returns {null | {name, operator, category, purpose, respects, known, token}}
 *          null when the UA is a human browser (or absent).
 */
export function classifyUserAgent(ua) {
  const raw = String(ua || '')
  if (!raw) return null

  const known = KNOWN_BOT_RE.exec(raw)
  if (known) {
    const lower = known[1].toLowerCase()
    const entry = BOT_TOKENS.find((b) => b.token.toLowerCase() === lower) || null
    if (entry) {
      return {
        name: entry.name,
        operator: entry.operator,
        category: entry.category,
        purpose: entry.purpose,
        respects: entry.respects,
        token: entry.token,
        known: true,
      }
    }
  }

  const generic = GENERIC_BOT_PATTERNS.some((re) => re.test(raw))
  if (!generic) return null
  // A UA that looks like a browser and only trips the loosest markers is more
  // likely a human on an oddly-named device than a crawler. Requiring an
  // explicit bot word here keeps CUBOT-style phones out of the dataset.
  if (BROWSER_RE.test(raw) && !/(?:^|[^a-z])(?:bot|crawler|spider|scraper)(?:[^a-z]|$)/i.test(raw)) return null

  return {
    name: extractUnknownName(raw),
    operator: 'Unidentified',
    category: 'other',
    purpose: 'Unrecognised non-browser client. Not in the Atlas bot catalogue.',
    respects: null,
    token: null,
    known: false,
  }
}

/** True when a category represents an AI system rather than classic web infrastructure. */
export function isAiCategory(category) {
  return Boolean(BOT_CATEGORIES[category]?.ai)
}

/** Display metadata for a category, with a safe fallback for unseen values. */
export function categoryMeta(category) {
  return BOT_CATEGORIES[category] || BOT_CATEGORIES.other
}
