// app/api/admin/trade-applications/route.js
// Admin surface for Atlas Trade beta sign-ups (trade_accounts). Unlike councils
// and press, trade access auto-provisions the moment an organisation accepts the
// AUP + attribution terms (there is no approval gate), so this is a roster +
// light management view rather than an approval queue:
//   GET  → every trade account, newest first, plus headline counts.
//   POST → suspend / reactivate an account, or delete a test row.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const RECENT_WINDOW_MS = 7 * 24 * 3600 * 1000

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  try {
    const { data: accounts, error } = await sb
      .from('trade_accounts')
      .select('id, org_name, contact_name, contact_email, account_type, status, founding_member, founding_cohort_seq, aup_version, aup_accepted_at, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error

    const rows = accounts || []
    const now = Date.now()
    const cutoff = now - RECENT_WINDOW_MS
    const counts = {
      total: rows.length,
      active: rows.filter((a) => a.status === 'active').length,
      suspended: rows.filter((a) => a.status === 'suspended').length,
      founding: rows.filter((a) => a.founding_member).length,
      recent: rows.filter((a) => a.created_at && new Date(a.created_at).getTime() >= cutoff).length,
    }

    return NextResponse.json({ ok: true, accounts: rows, counts })
  } catch (err) {
    console.error('[admin/trade-applications] GET error:', err.message)
    // Pre-migration / empty table must never 500 the dashboard-linked page.
    return NextResponse.json({ ok: true, accounts: [], counts: { total: 0, active: 0, suspended: 0, founding: 0, recent: 0 }, error: err.message })
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, accountId } = await request.json()
    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const { data: account, error: fetchErr } = await sb
      .from('trade_accounts')
      .select('id, org_name, status')
      .eq('id', accountId)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    switch (action) {
      case 'suspend': {
        const { error } = await sb
          .from('trade_accounts')
          .update({ status: 'suspended', updated_at: new Date().toISOString() })
          .eq('id', accountId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'reactivate': {
        const { error } = await sb
          .from('trade_accounts')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', accountId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'delete': {
        const { error } = await sb.from('trade_accounts').delete().eq('id', accountId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[admin/trade-applications] POST error:', err.message)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
