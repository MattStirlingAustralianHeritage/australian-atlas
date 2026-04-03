// Approved email domains for council portal access
// Add new domains here — do not hardcode elsewhere
export const APPROVED_DOMAINS = [
  '.gov.au',
  '.tourism.au',
  '.australia.com',
]

// Check if an email's domain is in the approved list
export function isApprovedDomain(email) {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return APPROVED_DOMAINS.some(d => domain.endsWith(d))
}
