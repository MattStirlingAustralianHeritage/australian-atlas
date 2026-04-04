export const metadata = { title: 'Offline — Australian Atlas' }

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '80vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2rem',
        color: 'var(--color-ink)', marginBottom: 12,
      }}>
        You are offline
      </h1>
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
        color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 420,
      }}>
        Any trails you have saved and regions you have recently visited are still available. Other pages will load when you are back online.
      </p>
    </div>
  )
}
