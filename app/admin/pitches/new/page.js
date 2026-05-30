import Link from 'next/link'
import ManualPitch from './ManualPitch'

// Auth handled by middleware. No server data — the form drives everything.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manual Pitch — Admin' }

export default function NewManualPitchPage() {
  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Manual Pitch
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)', margin: '0 auto', maxWidth: 560 }}>
          Name a place, point at its website, optionally link its Atlas listing — and get a fact-checked, grounded pitch. Keep the ones worth writing to the Editorial queue.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin/pitches" style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-muted)', textDecoration: 'none' }}>
            ← Back to Pitch Triage
          </Link>
        </div>
      </div>

      <ManualPitch />
    </div>
  )
}
