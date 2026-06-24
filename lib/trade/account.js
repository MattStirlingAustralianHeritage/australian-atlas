/**
 * Atlas Trade — account helpers (server-side, service-role).
 *
 * The beta gate. A trade account is one row in trade_accounts keyed to a
 * Supabase-auth user. Having a row (with AUP accepted) is the only thing that
 * gates the builder — there is no payment step in beta.
 */
import { TRADE_AUP_VERSION, TRADE_FOUNDING_COHORT_CAP, nextFinancialYearStart } from './config'

/** Fetch the trade account for a Supabase-auth user id, or null. */
export async function getTradeAccountForUser(sb, userId) {
  if (!userId) return null
  const { data, error } = await sb
    .from('trade_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[trade/account] lookup failed:', error.message)
    return null
  }
  return data || null
}

/**
 * Create the trade account for a user, logging AUP + attribution acceptance.
 * Idempotent: if the user already has an account, returns it untouched (signup
 * is not re-run). Assigns a founding-cohort sequence number and locks the
 * founding rate at signup, with the first invoice aligned to the 1 July FY.
 *
 * Returns { account, created }.
 */
export async function createTradeAccount(sb, { userId, orgName, contactName, contactEmail, accountType }) {
  const existing = await getTradeAccountForUser(sb, userId)
  if (existing) return { account: existing, created: false }

  const now = new Date()
  const nowIso = now.toISOString()

  // Founding-cohort sequence: 1 + current account count. Capped framing only —
  // members beyond the cap are still free, just not "founding".
  const { count } = await sb
    .from('trade_accounts')
    .select('id', { count: 'exact', head: true })
  const seq = (count || 0) + 1

  const row = {
    user_id: userId,
    org_name: orgName,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    account_type: accountType || 'tour_operator',
    status: 'active',
    founding_member: seq <= TRADE_FOUNDING_COHORT_CAP,
    founding_cohort_seq: seq,
    aup_version: TRADE_AUP_VERSION,
    aup_accepted_at: nowIso,
    attribution_accepted_at: nowIso,
    founding_rate_locked_at: nowIso,
    first_invoice_on: nextFinancialYearStart(now),
  }

  const { data, error } = await sb
    .from('trade_accounts')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    // Unique-violation race (two concurrent signups) → return the winner.
    if (error.code === '23505') {
      const account = await getTradeAccountForUser(sb, userId)
      if (account) return { account, created: false }
    }
    throw new Error(`Failed to create trade account: ${error.message}`)
  }
  return { account: data, created: true }
}

/** Shape the account for client consumption (no internal-only churn). */
export function publicTradeAccount(a) {
  if (!a) return null
  return {
    id: a.id,
    org_name: a.org_name,
    account_type: a.account_type,
    status: a.status,
    founding_member: a.founding_member,
    founding_cohort_seq: a.founding_cohort_seq,
    aup_version: a.aup_version,
    aup_accepted_at: a.aup_accepted_at,
    first_invoice_on: a.first_invoice_on,
  }
}
