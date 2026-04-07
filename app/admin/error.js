'use client'

export default function AdminError({ error, reset }) {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)',
          fontSize: '1.5rem',
          fontWeight: 600,
          color: 'var(--color-ink, #2D2A26)',
          marginBottom: '0.5rem',
        }}>
          Something went wrong
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: '0.9rem',
          color: 'var(--color-muted, #888)',
          marginBottom: '1.5rem',
          lineHeight: 1.5,
        }}>
          {error?.message || 'An error occurred loading this admin page.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-ink, #2D2A26)',
              color: '#fff',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {/* Back link handled by AdminNavBar in layout */}
        </div>
      </div>
    </div>
  )
}
