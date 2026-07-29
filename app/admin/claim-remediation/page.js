import ClaimRemediationClient from './ClaimRemediationClient'

export const metadata = { title: 'Claim Remediation — Admin' }
export const dynamic = 'force-dynamic'

// The operators whose listings we marked as owned before checking the email
// address belonged to them. One row each, with what we know and what we've
// already said to them, so the decision is made per person rather than in bulk.
export default function ClaimRemediationPage() {
  return <ClaimRemediationClient />
}
