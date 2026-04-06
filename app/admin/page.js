import Link from 'next/link'

export default function AdminPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display, Georgia)',
              fontSize: '1.75rem',
              fontWeight: 600,
              color: 'var(--color-ink, #2D2A26)',
              margin: '0 0 0.25rem',
            }}>
              Admin
            </h1>
            <p style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.9rem',
              color: 'var(--color-muted, #888)',
              margin: 0,
            }}>
              Australian Atlas Network
            </p>
          </div>
          <Link
            href="/admin/logout"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #e5e5e5)',
              background: '#fff',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.825rem',
              color: 'var(--color-muted, #888)',
              textDecoration: 'none',
            }}
          >
            Sign out
          </Link>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          <AdminCard
            label="Analytics"
            description="Traffic, geography, per-vertical breakdown"
            href="/admin/analytics"
          />
          <AdminCard
            label="Events"
            description="Manage community events"
            href="/admin/events"
          />
          <AdminCard
            label="Trails"
            description="Editorial trails linking venues across verticals"
            href="/admin/trails"
          />
          <AdminCard
            label="Claims"
            description="Review and approve vendor claim requests"
            href="/admin/claims"
          />
          <AdminCard
            label="Search Insights"
            description="Top queries, trail prompts, zero-result searches"
            href="/admin/insights"
          />
          <AdminCard
            label="Completeness"
            description="Listing quality scores, missing fields, improvement tips"
            href="/admin/completeness"
          />
          <AdminCard
            label="Staleness"
            description="Listing freshness, dead URLs, verification tiers"
            href="/admin/staleness"
          />
          <AdminCard
            label="Listings"
            description="Browse, search, and edit all listings across verticals"
            href="/admin/listings"
          />
          <AdminCard
            label="Candidates"
            description="Listing acquisition pipeline and coverage gaps"
            href="/admin/candidates"
          />
          <AdminCard
            label="Duplicates"
            description="Semantic deduplication review and merge"
            href="/admin/duplicates"
          />
          <AdminCard
            label="Editorial"
            description="Story ideas queue and interview pipeline"
            href="/admin/editorial"
          />
          <AdminCard
            label="Regions"
            description="View and manage regions"
            href="/regions"
          />
        </div>
      </div>
    </div>
  )
}

function AdminCard({ label, description, href }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid var(--color-border, #e5e5e5)',
        padding: '1.25rem',
        textDecoration: 'none',
      }}
    >
      <p style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.95rem',
        fontWeight: 500,
        color: 'var(--color-ink, #2D2A26)',
        margin: '0 0 0.25rem',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontSize: '0.8rem',
        color: 'var(--color-muted, #888)',
        margin: 0,
        lineHeight: 1.4,
      }}>
        {description}
      </p>
    </Link>
  )
}
