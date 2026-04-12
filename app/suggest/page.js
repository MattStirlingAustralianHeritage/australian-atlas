import SuggestForm from './SuggestForm'

export const metadata = {
  title: 'Suggest a Place | Australian Atlas',
  description: 'Know somewhere that should be on Australian Atlas? Suggest a venue for our directory.',
}

export default function SuggestPage() {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{
        padding: '100px 24px 60px',
        textAlign: 'center',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-cream)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            marginBottom: 16,
            fontFamily: 'var(--font-body)',
          }}>
            Community
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 5vw, 54px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            lineHeight: 1.15,
            marginBottom: 20,
          }}>
            Suggest a Place
          </h1>
          <p style={{
            fontSize: 17,
            color: 'var(--color-muted)',
            lineHeight: 1.7,
            fontFamily: 'var(--font-body)',
            maxWidth: 520,
            margin: '0 auto',
          }}>
            Know somewhere that should be on Australian Atlas? Tell us about it.
          </p>
        </div>
      </section>

      {/* Form */}
      <section style={{ padding: '48px 24px 80px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <SuggestForm />
        </div>
      </section>

    </div>
  )
}
