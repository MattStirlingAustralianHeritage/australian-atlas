// lib/crawler-log.js
// Edge-runtime-safe crawler access logging.
//
// Used by middleware.js. When a request's User-Agent is not a human browser,
// we record one row in the portal `site_crawler_hits` table via the Supabase
// REST API.
//
// Classification lives in lib/bots/registry.js — that file is the catalogue,
// this one is the transport. Both have ZERO runtime imports beyond each other:
// pure `fetch`, no @supabase/supabase-js, no node APIs, so they run unchanged
// on the Vercel Edge runtime. An edge-incompatible import here fails the build.
//
// The write is fire-and-forget: middleware registers it with event.waitUntil()
// and never awaits it on the response path. Every error is swallowed — a
// logging failure must never affect rendering or auth.

import { classifyUserAgent } from './bots/registry.js'

export { classifyUserAgent }

/**
 * The middleware gate. Pure in-memory regex work, no I/O — a human request
 * costs a handful of failed regex tests and nothing else.
 *
 * @returns {null | object} null for human browsers; otherwise the bot descriptor.
 */
export function classifyRequest(userAgent) {
  return classifyUserAgent(userAgent)
}

// Vercel injects geo headers at the edge. They are absent locally and on
// non-Vercel hosts, which is why every one of them is optional downstream.
function geoFrom(headers) {
  return {
    country: headers.get('x-vercel-ip-country') || null,
    city: safeDecode(headers.get('x-vercel-ip-city')),
  }
}

// Vercel percent-encodes city names ("Sao%20Paulo"). Decoding can throw on
// malformed input, and a bad header must not cost us the row.
function safeDecode(value) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Postgres text columns are unbounded, but a hostile client can send a
// megabyte User-Agent. Cap every free-text field so one request cannot bloat
// the table or the insert payload.
function cap(value, max) {
  if (!value) return null
  const s = String(value)
  return s.length > max ? s.slice(0, max) : s
}

/**
 * Fire-and-forget insert of one crawler-hit row via Supabase REST.
 * Always resolves; never throws. The caller wraps this in event.waitUntil()
 * so it runs after the response is sent.
 *
 * @param {object} hit
 * @param {string} hit.userAgent   raw User-Agent header
 * @param {string} hit.path        request.nextUrl.pathname
 * @param {object} [hit.bot]       pre-computed descriptor from classifyRequest
 * @param {string} [hit.host]
 * @param {string} [hit.ip]
 * @param {string} [hit.method]
 * @param {string} [hit.referer]
 * @param {Headers} [hit.headers]  request headers, for edge geo enrichment
 */
export async function logCrawlerHit({ userAgent, path, bot, host, ip, method, referer, headers }) {
  try {
    // Re-classify only if the caller did not: middleware already has the
    // descriptor from its gate, so the common path does no extra work.
    const descriptor = bot || classifyUserAgent(userAgent || '')
    if (!descriptor) return // defensive: only ever log a real non-browser client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return // nowhere/no-credential to write to — stay silent

    const geo = headers ? geoFrom(headers) : { country: null, city: null }

    await fetch(`${url}/rest/v1/site_crawler_hits`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        bot_name: cap(descriptor.name, 120),
        bot_category: descriptor.category,
        bot_operator: cap(descriptor.operator, 80),
        bot_known: descriptor.known,
        user_agent: cap(userAgent, 1000),
        path: cap(path, 2000),
        host: cap(host, 255),
        ip: cap(ip, 64),
        method: cap(method, 10),
        referer: cap(referer, 1000),
        country: cap(geo.country, 8),
        city: cap(geo.city, 120),
      }),
    })
  } catch {
    // Swallow everything. Logging must never affect the request.
  }
}
