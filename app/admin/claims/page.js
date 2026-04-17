import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG, getVerticalClaimsTable } from '@/lib/supabase/clients'
import ClaimsActions from './ClaimsActions'

export const metadata = { title: 'Claims Review — Admin' }
export const dynamic = 'force-dynamic'

export default async function ClaimsPage() {
  // Auth handled by middleware — no page-level check needed

  // Try portal claims_review table first; fall back to querying verticals directly
  let claims = []
  let usingPortalTable = false

  const sb = getSupabaseAdmin()

  try {
    const { data, error } = await sb
      .from('claims_review')
      .select('id, status, vertical, claimant_email, contact_email, claimant_name, contact_name, venue_name, listing_name, tier, selected_tier, created_at, reviewed_at, admin_notes, source_claim_id, listing_id, listings(name)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      // Flatten the joined listing name into the claim record
      claims = data.map(c => ({
        ...c,
        listing_name: c.listings?.name || null,
      }))
      usingPortalTable = true
    }
  } catch {
    // Table may not exist yet — fall through to vertical queries
  }

  // If the portal table is empty or missing, pull claims from each vertical
  if (!usingPortalTable || claims.length === 0) {
    const verticalClaims = await fetchVerticalClaims()
    if (verticalClaims.length > 0) {
      claims = verticalClaims
      usingPortalTable = false
    }
  }

  // Separate pending from reviewed
  const pending = claims.filter(c => c.status === 'pending')
  const reviewed = claims.filter(c => c.status !== 'pending')

  // Stats
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const approvedThisMonth = claims.filter(
    c => c.status === 'approved' && new Date(c.reviewed_at || c.created_at) >= monthStart
  ).length
  const rejectedThisMonth = claims.filter(
    c => c.status === 'rejected' && new Date(c.reviewed_at || c.created_at) >= monthStart
  ).length

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Claims Review
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Vendor claim requests across the Atlas network.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
        <StatCard count={pending.length} label="Pending" bg="#FCE4B8" />
        <StatCard count={approvedThisMonth} label="Approved (month)" bg="#C4D8B8" />
        <StatCard count={rejectedThisMonth} label="Rejected (month)" bg="#F2D4D4" />
        <StatCard count={claims.length} label="Total" bg="#E8E3DA" />
      </div>

      {/* Pending claims */}
      <SectionHeading label="pending" count={pending.length} />
      {pending.length === 0 ? (
        <EmptyState message="No pending claims." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {pending.map(claim => (
            <ClaimCard key={claim.id} claim={claim} showActions usingPortalTable={usingPortalTable} />
          ))}
        </div>
      )}

      {/* Recently reviewed */}
      {reviewed.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <SectionHeading label="reviewed" count={reviewed.length} />
          <div style={{ display: 'grid', gap: 8 }}>
            {reviewed.map(claim => (
              <ClaimCard key={claim.id} claim={claim} showActions={false} usingPortalTable={usingPortalTable} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function StatCard({ count, label, bg }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 8,
      background: bg,
      textAlign: 'center',
    }}>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 24,
        fontWeight: 400,
        color: 'var(--color-ink)',
        margin: 0,
      }}>
        {count}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-muted)',
        margin: '4px 0 0',
      }}>
        {label}
      </p>
    </div>
  )
}

function SectionHeading({ label, count }) {
  return (
    <h2 style={{
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--color-muted)',
      marginBottom: 12,
    }}>
      {label} ({count})
    </h2>
  )
}

function EmptyState({ message }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '2.5rem 0',
      border: '1px dashed var(--color-border, #e5e5e5)',
      borderRadius: 8,
    }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {message}
      </p>
    </div>
  )
}

function ClaimCard({ claim, showActions, usingPortalTable }) {
  const verticalLabel = (claim.vertical || 'unknown').toUpperCase()
  const statusColors = {
    pending: '#FCE4B8',
    approved: '#C4D8B8',
    rejected: '#F2D4D4',
  }

  // Normalise field names — portal table vs vertical table may differ
  const email = claim.claimant_email || claim.contact_email || ''
  const name = claim.claimant_name || claim.contact_name || ''
  const venueName = claim.venue_name || claim.listing_name || ''
  const tier = claim.tier || claim.selected_tier || 'free'
  const createdAt = claim.created_at ? new Date(claim.created_at).toLocaleDateString() : ''

  return (
    <div style={{
      padding: '16px 20px',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      background: '#fff',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {venueName && (
            <span style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--color-ink)',
            }}>
              {venueName}
            </span>
          )}
          <span style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            background: 'var(--color-cream)',
            padding: '2px 8px',
            borderRadius: 100,
          }}>
            {verticalLabel}
          </span>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: claim.status === 'approved' ? '#4a7c59' : claim.status === 'rejected' ? '#a44' : '#b08030',
            background: statusColors[claim.status] || '#eee',
            padding: '2px 8px',
            borderRadius: 100,
          }}>
            {claim.status}
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 400,
          fontSize: 11,
          color: 'var(--color-muted)',
        }}>
          {createdAt}
        </span>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: showActions ? 10 : 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 13,
          color: 'var(--color-muted)',
        }}>
          {name ? `${name} — ` : ''}{email}
        </span>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          opacity: 0.6,
        }}>
          {tier}
        </span>
      </div>

      {claim.admin_notes && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 12,
          color: 'var(--color-muted)',
          opacity: 0.7,
          lineHeight: 1.4,
          margin: '0 0 8px',
          fontStyle: 'italic',
        }}>
          Note: {claim.admin_notes}
        </p>
      )}

      {showActions && (
        <ClaimsActions
          claimId={claim.id}
          vertical={claim.vertical}
          sourceClaimId={claim.source_claim_id || claim.id}
          usingPortalTable={usingPortalTable}
        />
      )}
    </div>
  )
}

// ─── Fetch claims from vertical DBs ──────────────────────

async function fetchVerticalClaims() {
  const allClaims = []

  // Only query verticals that are configured with credentials
  for (const [key, config] of Object.entries(VERTICAL_CONFIG)) {
    if (!config.url || !config.serviceKey) continue

    try {
      const client = getVerticalClient(key)
      const claimConfig = getVerticalClaimsTable(key)
      const { data, error } = await client
        .from(claimConfig.table)
        .select('id, status, created_at, reviewed_at, admin_notes, user_id, ' +
          `${claimConfig.emailKey}, ${claimConfig.nameKey}` +
          (claimConfig.table === 'claims' ? ', venue_name, tier, selected_tier' : '') +
          (claimConfig.table === 'listing_claims' ? ', listing_name' : ''))
        .order('created_at', { ascending: false })
        .limit(50)

      if (!error && data) {
        for (const claim of data) {
          allClaims.push({
            ...claim,
            vertical: key,
            source_claim_id: claim.id,
            // Normalise to portal field names
            claimant_email: claim[claimConfig.emailKey] || '',
            claimant_name: claim[claimConfig.nameKey] || '',
            listing_name: claim.venue_name || claim.listing_name || '',
            tier: claim.tier || claim.selected_tier || 'free',
          })
        }
      }
    } catch (err) {
      // Skip verticals that don't have a claims table or aren't reachable
      console.error(`[claims] Error fetching from ${key}:`, err.message)
    }
  }

  // Sort by created_at descending
  allClaims.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return allClaims
}
