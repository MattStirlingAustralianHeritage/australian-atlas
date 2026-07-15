import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { isSendableEmail } from '@/lib/outreach/sendEngine'

export const dynamic = 'force-dynamic'

/**
 * Suppression-list management (the do-not-email list).
 *   GET    ?q=<substring>       → { suppressions }  (latest 500)
 *   POST   { email, detail? }   → add a manual suppression
 *   DELETE { email }            → remove one (e.g. added by mistake)
 * Bounce/complaint/unsubscribe entries keep arriving via the Resend webhook
 * and the one-click unsubscribe route.
 */
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase()
  const sb = getSupabaseAdmin()
  let query = sb
    .from('outreach_suppressions')
    .select('email, reason, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (q) query = query.ilike('email', `%${q.replace(/[%_]/g, '')}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, suppressions: data || [] })
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!isSendableEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('outreach_suppressions').upsert(
    { email, reason: 'manual', detail: String(body.detail || '').slice(0, 200) || 'added in admin' },
    { onConflict: 'email' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, email })
}

export async function DELETE(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('outreach_suppressions').delete().eq('email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, email })
}
