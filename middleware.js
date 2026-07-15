import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { CRAWLER_RE, logCrawlerHit } from '@/lib/crawler-log'
import { splitLocale, localizePath, defaultLocale, LOCALE_HEADER, isLocale, PREFIXED_LOCALES } from '@/lib/i18n/config'

// hreflang alternates delivered as HTTP Link headers — a Google-supported,
// route-agnostic way to advertise en + every prefixed locale + x-default on
// each HTML page without touching 200+ per-route metadata exports. `basePath`
// is the unprefixed path. Generic over PREFIXED_LOCALES (ko, zh, …).
function hreflangLinkHeader(origin, basePath) {
  const en = `${origin}${localizePath(basePath, defaultLocale)}`
  const parts = [`<${en}>; rel="alternate"; hreflang="en"`]
  for (const loc of PREFIXED_LOCALES) {
    parts.push(`<${origin}${localizePath(basePath, loc)}>; rel="alternate"; hreflang="${loc}"`)
  }
  parts.push(`<${en}>; rel="alternate"; hreflang="x-default"`)
  return parts.join(', ')
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
  // Sticky locale: an explicit `/ko` prefix always wins; otherwise a prior
  // Korean choice (the `atlas_locale` cookie, set when the reader entered /ko or
  // used the language switcher) keeps the reader in Korean across UNPREFIXED
  // navigation too — so clicking any plain next/link no longer drops them back
  // to English. Anonymous/crawler traffic (no cookie) still gets English on
  // unprefixed URLs and Korean only under /ko, so SEO is unchanged.
  const { locale: urlLocale, basePath } = splitLocale(pathname)
  const cookieLocale = request.cookies.get('atlas_locale')?.value
  const isPrefixed = urlLocale !== defaultLocale
  // An explicit prefix always wins; otherwise a prior non-English choice (the
  // sticky `atlas_locale` cookie) keeps the reader in that language across
  // UNPREFIXED navigation too. Any supported non-default locale sticks (ko, zh).
  const locale = isPrefixed
    ? urlLocale
    : (isLocale(cookieLocale) && cookieLocale !== defaultLocale ? cookieLocale : defaultLocale)
  const rewriteUrl = isPrefixed
    ? new URL(`${basePath}${request.nextUrl.search}`, request.url)
    : null
  // Build a passthrough response that carries the locale header and, for a
  // prefixed request, rewrites to the underlying route. Headers are rebuilt from
  // request.headers at CALL time (not a snapshot) so a Supabase token-refresh
  // cookie mutation still forwards to the same-request render. Also persists the
  // resolved locale so unprefixed navigation stays sticky.
  const makeResponse = () => {
    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)
    const res = isPrefixed
      ? NextResponse.rewrite(rewriteUrl, { request: { headers } })
      : NextResponse.next({ request: { headers } })
    res.cookies.set('atlas_locale', locale, {
      path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
    })
    return res
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
    // One-click magic-link login: /council/auth/{token} consumes a single-use
    // token and sets the session itself, so it must run WITHOUT a prior session.
    basePath.startsWith('/council/auth/') ||
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

  // ── Newsroom (press) routes: validate HMAC-signed session cookie ──
  // Public press surfaces are exempt: login, enquire, and the public example
  // fact sheet. The secret falls back through keys that already exist on
  // deployed environments — mirrored in lib/press-session.js getPressSecret()
  // and lib/press/tokens.js.
  const isPublicPressRoute =
    basePath.startsWith('/newsroom/login') ||
    basePath.startsWith('/newsroom/enquire') ||
    basePath === '/newsroom/example'
  if (basePath.startsWith('/newsroom') && !isPublicPressRoute) {
    const pressCookie = request.cookies.get('press_session')
    const pressSecret =
      process.env.PRESS_SESSION_SECRET ||
      process.env.COUNCIL_SESSION_SECRET ||
      process.env.ADMIN_SESSION_SECRET
    const valid = await validateHmacSession(pressCookie?.value, pressSecret)
    if (!valid) {
      const res = NextResponse.redirect(new URL('/newsroom/login', request.url))
      if (pressCookie) res.cookies.delete('press_session')
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
  return validateHmacSession(cookieValue, process.env.COUNCIL_SESSION_SECRET)
}

// Generic edge HMAC session validation — shared by the council and press
// (newsroom) gates. Cookie format: id:slug:timestamp:hmac, 30-day max age,
// HMAC-SHA256 over the first three parts.
async function validateHmacSession(cookieValue, secret) {
  if (!cookieValue) return false

  const parts = cookieValue.split(':')
  if (parts.length !== 4) return false

  const [, , timestamp, hmac] = parts
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
