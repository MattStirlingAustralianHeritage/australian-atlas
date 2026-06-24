/**
 * Atlas Trade — server-side auth context for route handlers.
 *
 * Resolves the signed-in Supabase user and their trade account in one call.
 * The trade account (with AUP accepted) is the ONLY beta gate — no payment.
 */
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getTradeAccountForUser } from './account'

/**
 * Returns { sb, user, account }:
 *   sb      — service-role client (writes gate ownership in app code)
 *   user    — Supabase auth user, or null
 *   account — the user's trade_accounts row, or null
 */
export async function getTradeContext() {
  const sb = getSupabaseAdmin()
  let user = null
  try {
    const auth = await createAuthServerClient()
    const { data } = await auth.auth.getUser()
    user = data?.user || null
  } catch (e) {
    console.error('[trade/server-auth] getUser failed:', e.message)
  }
  const account = user ? await getTradeAccountForUser(sb, user.id) : null
  return { sb, user, account }
}
