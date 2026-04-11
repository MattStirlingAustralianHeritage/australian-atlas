import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // ── Admin routes: check FIRST, before Supabase touches cookies ──
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
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
      // Valid JWT — let the request through
      return NextResponse.next()
    } catch (err) {
      // Legacy raw-password cookie — allow
      if (adminToken === process.env.ADMIN_PASSWORD) {
        return NextResponse.next()
      }
      // Invalid token — clear and redirect
      const res = NextResponse.redirect(new URL('/admin/login', request.url))
      res.cookies.delete('atlas_admin')
      res.cookies.delete('admin_auth')
      return res
    }
  }

  // ── Council routes: validate HMAC-signed session cookie ──
  if (pathname.startsWith('/council') && !pathname.startsWith('/council/login') && !pathname.startsWith('/council/enquire')) {
    const councilCookie = request.cookies.get('council_session')
    const valid = await validateCouncilHmac(councilCookie?.value)
    if (!valid) {
      const res = NextResponse.redirect(new URL('/council/login', request.url))
      if (councilCookie) res.cookies.delete('council_session')
      return res
    }
  }

  // ── Supabase auth: only for non-admin routes that need it ──
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect authenticated routes (account + dashboard)
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/account')) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
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
