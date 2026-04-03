import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { createSharedToken } from '@/lib/shared-auth'

const ALLOWED_DOMAINS = [
  'smallbatchatlas.com.au',
  'collectionatlas.com.au',
  'corneratlas.com.au',
  'craftatlas.com.au',
  'fieldatlas.com.au',
  'finegroundsatlas.com.au',
  'foundatlas.com.au',
  'restatlas.com.au',
  'tableatlas.com.au',
  'australianatlas.com.au',
  'localhost',
]

function isAllowedReturnUrl(url) {
  try {
    const parsed = new URL(url)
    return ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const returnUrl = searchParams.get('return_url')
  const vertical = searchParams.get('vertical') || ''

  if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
    return NextResponse.json({ error: 'Invalid return_url' }, { status: 400 })
  }

  // Check if user has active session
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // User is logged in — generate token and redirect back
    const token = await createSharedToken(user)
    const url = new URL(returnUrl)
    url.searchParams.set('atlas_token', token)
    return NextResponse.redirect(url.toString())
  }

  // No session — redirect to login with return info
  const origin = new URL(request.url).origin
  const loginUrl = new URL('/login', origin)
  loginUrl.searchParams.set('return_url', returnUrl)
  loginUrl.searchParams.set('vertical', vertical)
  return NextResponse.redirect(loginUrl.toString())
}
