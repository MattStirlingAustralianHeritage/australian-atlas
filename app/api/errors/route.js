import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/errors — client-side error reporting (no auth required)
 *
 * Body: { route, error_message, error_stack, user_agent }
 * Rate limit: skip insert if >10 errors from same user_agent in last minute.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { route, error_message, error_stack, user_agent } = body

  if (!error_message) {
    return NextResponse.json({ error: 'error_message is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Simple rate limit: check recent errors from same user_agent
  if (user_agent) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()

    const { count } = await sb
      .from('client_errors')
      .select('id', { count: 'exact', head: true })
      .eq('user_agent', user_agent)
      .gte('created_at', oneMinuteAgo)

    if (count && count >= 10) {
      // Rate limited — silently accept but don't store
      return NextResponse.json({ ok: true, rate_limited: true })
    }
  }

  const { error } = await sb
    .from('client_errors')
    .insert({
      route: route || null,
      error_message,
      error_stack: error_stack || null,
      user_agent: user_agent || null,
    })

  if (error) {
    // Don't expose DB errors to clients; log and return generic
    console.error('Error inserting client error:', error.message)
    return NextResponse.json({ error: 'Failed to log error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
