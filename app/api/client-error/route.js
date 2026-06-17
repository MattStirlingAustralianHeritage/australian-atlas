import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request) {
  const rl = checkRateLimit(request, { keyPrefix: 'clienterr', maxRequests: 30, windowMs: 60_000 })
  if (rl) return rl
  try {
    const body = await request.json()
    const { route, error_message, error_stack } = body

    if (!route || !error_message) {
      return NextResponse.json({ error: 'route and error_message required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const ua = request.headers.get('user-agent') || null

    await sb.from('client_errors').insert({
      route,
      error_message: error_message.slice(0, 2000),
      error_stack: error_stack ? error_stack.slice(0, 5000) : null,
      user_agent: ua,
    }).catch(() => {}) // fire and forget

    return NextResponse.json({ logged: true })
  } catch {
    return NextResponse.json({ logged: false }, { status: 500 })
  }
}
