// lib/crawler-log.js
// Edge-runtime-safe AI-crawler access logging.
//
// Used by middleware.js. When a request's User-Agent matches a known AI
// search/training crawler, we record one row in the portal
// `site_crawler_hits` table via the Supabase REST API.
//
// Deliberately has ZERO imports — pure `fetch`, no @supabase/supabase-js,
// no node APIs — so it runs unchanged on the Vercel Edge runtime. An
// edge-incompatible import here would fail the build.
//
// The write is fire-and-forget: middleware registers it with
// event.waitUntil() and never awaits it on the response path. Every error
// is swallowed — a logging failure must never affect rendering or auth.

// Exact crawler tokens we log, matched case-insensitively as a substring
// of the User-Agent. Nine, verbatim:
//   OpenAI     — GPTBot, OAI-SearchBot, ChatGPT-User
//   Anthropic  — ClaudeBot, Claude-SearchBot, Claude-User
//   Perplexity — PerplexityBot, Perplexity-User
//   Google     — Googlebot
// (Google-Extended is a robots.txt opt-out token, NOT a user-agent — it is
// intentionally absent here because it never appears in a real UA.)
const CRAWLER_TOKENS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Googlebot',
]

// Compiled once at module load. The capturing group lets us recover the
// matched token for bot_name. `i` = case-insensitive. This is the only
// thing a human request touches: a pure in-memory test with no I/O.
export const CRAWLER_RE = new RegExp(`(${CRAWLER_TOKENS.join('|')})`, 'i')

// Resolve a raw UA substring match back to its canonical token casing
// (e.g. a UA carrying "claudebot" → bot_name "ClaudeBot").
function canonicalToken(raw) {
  const lower = raw.toLowerCase()
  return CRAWLER_TOKENS.find((t) => t.toLowerCase() === lower) || raw
}

/**
 * Fire-and-forget insert of one crawler-hit row via Supabase REST.
 * Always resolves; never throws. The caller wraps this in
 * event.waitUntil() so it runs after the response is sent.
 *
 * @param {{ userAgent: string, path: string, host?: string|null, ip?: string|null }} hit
 */
export async function logCrawlerHit({ userAgent, path, host, ip }) {
  try {
    const match = CRAWLER_RE.exec(userAgent || '')
    if (!match) return // defensive: only ever log a real match

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return // nowhere/no-credential to write to — stay silent

    await fetch(`${url}/rest/v1/site_crawler_hits`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        bot_name: canonicalToken(match[1]),
        user_agent: userAgent,
        path,
        host: host || null,
        ip: ip || null,
      }),
    })
  } catch {
    // Swallow everything. Logging must never affect the request.
  }
}
