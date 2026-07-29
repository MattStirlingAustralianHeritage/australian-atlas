// Minting a fresh, single-use sign-in URL for an existing operator account.
//
// Extracted from app/api/cron/claim-recovery so the remediation console and the
// nudge cron cannot drift apart. Both hand an operator a way back in, and a
// second implementation of that is a second thing to get subtly wrong.
//
// A minted URL is a BEARER CREDENTIAL: whoever holds it becomes that operator.
// Mint at the moment of sending, to one recipient, and never write one into a
// log, a report, or an API response that isn't the email itself.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

/**
 * @param {object} sb    master service-role client (getSupabaseAdmin())
 * @param {string} email the operator's address
 * @param {string} [next] path to land on after sign-in
 * @returns {Promise<string>} a single-use sign-in URL
 * @throws if no link could be minted
 */
export async function mintSignInUrl(sb, email, next = '/dashboard') {
  const redirectTo = `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`

  // Prefer a magic link. Fall back to re-issuing the invite, which is how these
  // accounts were created: an operator who never accepted is still unconfirmed,
  // and some GoTrue versions refuse magiclink for an unconfirmed address. Both
  // land on /auth/callback, which verifies the token_hash — and, since migration
  // 265, settles any claim waiting on that address.
  for (const type of ['magiclink', 'invite']) {
    const { data, error } = await sb.auth.admin.generateLink({ type, email, options: { redirectTo } })
    const tokenHash = data?.properties?.hashed_token
    if (!error && tokenHash) {
      return `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent(next)}`
    }
  }
  throw new Error(`could not mint a sign-in link for ${email}`)
}
