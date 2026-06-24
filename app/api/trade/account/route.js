import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createTradeAccount, getTradeAccountForUser, publicTradeAccount } from '@/lib/trade/account'
import { TRADE_AUP_VERSION } from '@/lib/trade/config'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — beta account endpoint
   ═══════════════════════════════════════════════════════════════════════
   GET  → the signed-in user's trade account (or { account: null }).
   POST → create the trade account, logging AUP + attribution acceptance.
          Acceptance is the ONLY beta gate — there is no payment step.        */

export async function GET() {
  const auth = await createAuthServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ account: null }, { status: 200 })

  const sb = getSupabaseAdmin()
  const account = await getTradeAccountForUser(sb, user.id)
  return NextResponse.json({ account: publicTradeAccount(account) })
}

export async function POST(request) {
  try {
    const auth = await createAuthServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in to join the trade beta' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { org_name, contact_name, account_type, accept_aup } = body

    if (!org_name || !String(org_name).trim()) {
      return NextResponse.json({ error: 'Organisation name is required' }, { status: 400 })
    }
    // The AUP + attribution acceptance is the gate. No box ticked → no account.
    if (accept_aup !== true) {
      return NextResponse.json(
        { error: 'You must accept the Acceptable Use terms and the "Curated via Atlas" attribution requirement' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()
    const { account, created } = await createTradeAccount(sb, {
      userId: user.id,
      orgName: String(org_name).trim().slice(0, 200),
      contactName: contact_name ? String(contact_name).trim().slice(0, 120) : (user.user_metadata?.full_name || null),
      contactEmail: user.email || null,
      accountType: account_type || 'tour_operator',
    })

    return NextResponse.json(
      { account: publicTradeAccount(account), created, aup_version: TRADE_AUP_VERSION },
      { status: created ? 201 : 200 }
    )
  } catch (err) {
    console.error('[trade/account] POST error:', err)
    return NextResponse.json({ error: 'Failed to create trade account', detail: err.message }, { status: 500 })
  }
}
