import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { CRAWLER_RE, logCrawlerHit } from '@/lib/crawler-log'
import { splitLocale, localizePath, defaultLocale, LOCALE_HEADER } from '@/lib/i18n/config'

// hreflang alternates delivered as HTTP Link headers — a Google-supported,
// route-agnostic way to advertise en/ko/x-default on every HTML page without
// touching 200+ per-route metadata exports. `basePath` is the unprefixed path.
function hreflangLinkHeader(origin, basePath) {
  const en = `${origin}${localizePath(basePath, 'en')}`
  const ko = `${origin}${localizePath(basePath, 'ko')}`
  return [
    `<${en}>; rel="alternate"; hreflang="en"`,
    `<${ko}>; rel="alternate"; hreflang="ko"`,
    `<${en}>; rel="alternate"; hreflang="x-default"`,
  ].join(', ')
}

export async function middleware(request, event) {
  // ── AI-crawler access logging — FIRST, before any auth/Supabase work ──
  // Pure in-memory regex gate: a human / non-crawler UA misses here and falls
  // straight through with zero added network or latency. Only a crawler match
  // registers a fire-and-forget REST insert via event.waitUntil(), so it runs
  // after the response is sent and can never block rendering or auth. The whole
  // write is error-isolated inside logCrawlerHit() — a logging failure is silent.
  const ua = request.headers.get('user-agent') || ''
  if (event && CRAWLER_RE.test(ua)) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || request.ip
      || null
    event.waitUntil(
      logCrawlerHit({
        userAgent: ua,
        path: request.nextUrl.pathname,
        host: request.headers.get('host'),
        ip,
      })
    )
  }

  const { pathname } = request.nextUrl

  // ── Locale prefix (Korean) ──
  // English URLs are never touched (locale='en', basePath===pathname → no
  // rewrite). A `/ko/...` request keeps its visible URL but is served by the
  // underlying route with an `x-atlas-locale: ko` request header that
  // i18n/request.js reads. All auth checks below run against `basePath` (the
  // unprefixed path) so gating behaves identically under `/ko`.
  const { locale, basePath } = splitLocale(pathname)
  const isKo = locale !== defaultLocale
  const rewriteUrl = isKo
    ? new URL(`${basePath}${request.nextUrl.search}`, request.url)
    : null
  // Build a passthrough response that carries the locale header and, for Korean,
  // rewrites to the underlying route. The forwarded request headers are rebuilt
  // from request.headers at CALL time (not a one-time snapshot): when Supabase's
  // setAll mutates the request cookies on a token-refresh boundary, that refresh
  // must be forwarded to the same-request downstream render — matching the
  // original `NextResponse.next({ request })` behaviour. Reused by setAll below.
  const makeResponse = () => {
    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)
    return isKo
      ? NextResponse.rewrite(rewriteUrl, { request: { headers } })
      : NextResponse.next({ request: { headers } })
  }

  // ── /embed/*: publicly iframeable surfaces (operator Atlas card) ──
  // next.config.mjs sets X-Frame-Options: SAMEORIGIN globally, which would
  // block operators from iframing their Atlas card on their own websites. Per
  // the CSP spec, a `frame-ancestors` directive overrides X-Frame-Options
  // wherever both are present (all modern browsers honour this), so setting it
  // here exempts ONLY these routes without loosening the global header. Embeds
  // are anonymous, cache-friendly documents — return before any auth/session
  // work so no Supabase cookies are ever set on an embed response.
  if (basePath.startsWith('/embed/')) {
    const embedResponse = makeResponse()
    embedResponse.headers.set('Content-Security-Policy', 'frame-ancestors *')
    return embedResponse
  }

  // ── Admin routes: check FIRST, before Supabase touches cookies ──
  if (basePath.startsWith('/admin') && !basePath.startsWith('/admin/login')) {
    const adminToken = request.cookies.get('atlas_admin')?.value
      || request.cookies.get('admin_auth')?.value

    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    try {
      const secret = new TextEncoder().encode(
        process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
      )
      await jwtVerify(adminToken, secret)
      // Valid JWT — let the request through. makeResponse() (not a bare next())
      // so a /ko/admin request is still rewritten to /admin and carries the
      // locale header; a bare next() would serve the unmatched /ko/admin → 404.
      return makeResponse()
    } catch (err) {
      // Invalid token — clear and redirect. Legacy raw-password cookies are no
      // longer accepted; re-login at /admin/login mints a fresh signed JWT.
      const res = NextResponse.redirect(new URL('/admin/login', request.url))
      res.cookies.delete('atlas_admin')
      res.cookies.delete('admin_auth')
      return res
    }
  }

  // ── Council routes: validate HMAC-signed session cookie ──
  // Public council surfaces are exempt: login, enquire, the example report, and
  // the print-optimised region report (/council/{slug}/report) — a white-label
  // deliverable meant to be shared/printed, exposing only aggregate region data.
  const isPublicCouncilRoute =
    basePath.startsWith('/council/login') ||
    basePath.startsWith('/council/enquire') ||
    basePath === '/council/example' ||
    /^\/council\/[^/]+\/report$/.test(basePath)
  if (basePath.startsWith('/council') && !isPublicCouncilRoute) {
    const councilCookie = request.cookies.get('council_session')
    const valid = await validateCouncilHmac(councilCookie?.value)
    if (!valid) {
      const res = NextResponse.redirect(new URL('/council/login', request.url))
      if (councilCookie) res.cookies.delete('council_session')
      return res
    }
  }

  // ── Supabase auth: only for non-admin routes that need it ──
  let response = makeResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = makeResponse()
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect authenticated routes (account + dashboard)
  if ((basePath.startsWith('/dashboard') || basePath.startsWith('/account')) && !user) {
    return NextResponse.redirect(new URL(localizePath('/login', locale), request.url))
  }

  // hreflang alternates on HTML pages (SEO). Skip the non-document routes the
  // matcher still lets through (API JSON, OG images, sitemap.xml, robots.txt) —
  // language alternates are meaningless on those.
  const nonDocument =
    /^\/(api|og)\//.test(basePath) || basePath === '/sitemap.xml' || basePath === '/robots.txt'
  if (!nonDocument) {
    response.headers.set('Link', hreflangLinkHeader(request.nextUrl.origin, basePath))
  }

  return response
}

// Edge-compatible HMAC validation for council sessions (Web Crypto API)
async function validateCouncilHmac(cookieValue) {
  if (!cookieValue) return false

  const parts = cookieValue.split(':')
  if (parts.length !== 4) return false

  const [, , timestamp, hmac] = parts
  const secret = process.env.COUNCIL_SESSION_SECRET
  if (!secret) return false

  // Check session age (30 days)
  if (Date.now() - parseInt(timestamp) > 30 * 24 * 60 * 60 * 1000) return false

  const payload = parts.slice(0, 3).join(':')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return hmac === expected
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
