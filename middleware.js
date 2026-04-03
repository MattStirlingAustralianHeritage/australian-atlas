import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(request) {
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
  if ((request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/account')) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protect council routes (cookie-based magic link auth)
  if (request.nextUrl.pathname.startsWith('/council') && !request.nextUrl.pathname.startsWith('/council/login') && !request.nextUrl.pathname.startsWith('/council/enquire')) {
    const councilCookie = request.cookies.get('council_session')
    if (!councilCookie?.value) {
      return NextResponse.redirect(new URL('/council/login', request.url))
    }
  }

  // Protect admin routes (signed JWT session)
  if (request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/admin/login')) {
    const adminToken = request.cookies.get('atlas_admin')?.value
      || request.cookies.get('admin_auth')?.value // backward compat with old cookie name

    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Verify the JWT token
    try {
      const secret = new TextEncoder().encode(
        process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
      )
      await jwtVerify(adminToken, secret)
    } catch (err) {
      // Token invalid or expired — also handle legacy raw-password cookie
      if (adminToken === process.env.ADMIN_PASSWORD) {
        // Legacy cookie with raw password — allow but it will be replaced on next login
      } else {
        // Clear invalid cookies and redirect
        const redirectResponse = NextResponse.redirect(new URL('/admin/login', request.url))
        redirectResponse.cookies.delete('atlas_admin')
        redirectResponse.cookies.delete('admin_auth')
        return redirectResponse
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
