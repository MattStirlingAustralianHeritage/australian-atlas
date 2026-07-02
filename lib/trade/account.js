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
    org_website: a.org_website || null,
    org_logo_url: a.org_logo_url || null,
    focus_regions: Array.isArray(a.focus_regions) ? a.focus_regions : [],
  }
}

/**
 * Update the account's co-brand + focus settings (migration 204). Only these
 * fields are operator-editable post-signup; everything else is consent log.
 * Returns { account } or { error }.
 */
export async function updateTradeAccountSettings(sb, accountId, { orgWebsite, orgLogoUrl, focusRegions }) {
  const patch = { updated_at: new Date().toISOString() }
  if (orgWebsite !== undefined) {
    const w = orgWebsite ? String(orgWebsite).trim().slice(0, 300) : null
    if (w && !/^https?:\/\//i.test(w)) return { error: 'Website must start with http(s)://' }
    patch.org_website = w
  }
  if (orgLogoUrl !== undefined) {
    const u = orgLogoUrl ? String(orgLogoUrl).trim().slice(0, 500) : null
    if (u && !/^https:\/\//i.test(u)) return { error: 'Logo URL must be https://' }
    patch.org_logo_url = u
  }
  if (focusRegions !== undefined) {
    let regions = []
    if (Array.isArray(focusRegions)) regions = focusRegions
    else if (typeof focusRegions === 'string') regions = focusRegions.split(',')
    regions = regions
      .map((r) => String(r).replace(/\s+/g, ' ').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 12)
    patch.focus_regions = regions.length ? regions : null
  }

  const { data, error } = await sb
    .from('trade_accounts')
    .update(patch)
    .eq('id', accountId)
    .select('*')
    .single()
  if (error) {
    console.error('[trade/account] settings update failed:', error.message)
    return { error: 'Could not save your settings.' }
  }
  return { account: data }
}
