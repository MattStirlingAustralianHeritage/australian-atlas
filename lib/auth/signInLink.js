// Minting a fresh, single-use account-access URL for an existing operator.
//
// Extracted from app/api/cron/claim-recovery so the remediation console and the
// nudge cron cannot drift apart. Both hand an operator a way back in, and a
// second implementation of that is a second thing to get subtly wrong.
//
// These are NOT passwordless sign-in links — Atlas accounts sign in with email
// + password (or Google). Both link types land on /auth/callback, which
// verifies the token_hash (settling any claim waiting on that address since
// migration 265) and then routes to /auth/update-password, so the operator
// finishes with a working password:
//
//   'recovery'  the normal case — the account exists and is confirmed.
//   'invite'    fallback for an account that never accepted its original
//               invite: still unconfirmed, and GoTrue refuses recovery links
//               for an unconfirmed address.
//
// A minted URL is a BEARER CREDENTIAL: whoever holds it becomes that operator.
// Mint at the moment of sending, to one recipient, and never write one into a
// log, a report, or an API response that isn't the email itself.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

/**
 * @param {object} sb    master service-role client (getSupabaseAdmin())
 * @param {string} email the operator's address
 * @param {string} [next] path to land on after the password is set
 * @returns {Promise<string>} a single-use account-access URL
 * @throws if no link could be minted
 */
export async function mintSignInUrl(sb, email, next = '/dashboard') {
  const redirectTo = `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`

  for (const type of ['recovery', 'invite']) {
    const { data, error } = await sb.auth.admin.generateLink({ type, email, options: { redirectTo } })
    const tokenHash = data?.properties?.hashed_token
    if (!error && tokenHash) {
      return `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent(next)}`
    }
  }
  throw new Error(`could not mint an account-access link for ${email}`)
}
