import NearMeClient from './NearMeClient'

export const metadata = {
  title: 'Near Me — Australian Atlas',
  description: 'Discover independent places near your current location across all nine atlases.',
}

export default function NearMePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 8,
            fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            Discovery
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(28px, 4vw, 42px)', color: 'var(--color-ink)',
          }}>
            What's near you
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 16,
            color: 'var(--color-muted)', marginTop: 8, maxWidth: 480, marginInline: 'auto',
          }}>
            Independent makers, stays, galleries, and food — grouped by atlas, sorted by distance.
          </p>
        </div>
        <NearMeClient />
      </div>
    </div>
  )
}
