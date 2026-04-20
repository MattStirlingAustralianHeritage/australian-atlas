// Approved email domains for council portal access.
// No longer used as a login gate — admin approval is the sole security control.
// Retained for reference and potential admin UI flagging.
export const APPROVED_DOMAINS = [
  '.gov.au',
  '.tourism.au',
  '.australia.com',
  '.com.au',
  '.org.au',
  '.net.au',
  '.asn.au',
]

// Check if an email's domain is in the approved list
export function isApprovedDomain(email) {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return APPROVED_DOMAINS.some(d => domain.endsWith(d))
}
