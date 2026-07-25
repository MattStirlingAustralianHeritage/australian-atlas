import ActivityFeed from './ActivityFeed'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operator Activity — Admin' }

// The feed itself is client-side (filters + paging are interactive and the data
// is a merge across five tables), so this page is just the frame.
export default function ActivityPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>
          Operator Activity
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', margin: 0,
        }}>
          What operators are doing with their listings — photos, hours, descriptions, picks.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <a
            href="/admin/listings"
            style={{
              fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
              textDecoration: 'none', borderBottom: '1px solid var(--color-border, rgba(28,26,23,0.12))',
              paddingBottom: 2,
            }}
          >
            ← Listing editor
          </a>
        </div>
      </div>

      <ActivityFeed />
    </div>
  )
}
