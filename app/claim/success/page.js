import Link from 'next/link'

export const metadata = {
  title: 'Claim Submitted — Australian Atlas',
}

export default function ClaimSuccessPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(95,138,126,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg width="24" height="24" fill="none" stroke="var(--color-sage)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 16, fontFamily: 'var(--font-body)' }}>
          Claim Received
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.1, marginBottom: 16 }}>
          We&apos;ll be in touch
        </h1>
        <p style={{ fontSize: 15, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 36, fontFamily: 'var(--font-body)' }}>
          Your claim has been submitted. We review claims manually to ensure accuracy and will be in touch within 48 hours.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{
            display: 'inline-block', padding: '12px 28px', background: 'var(--color-sage)',
            color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4,
          }}>
            Back to Atlas
          </Link>
          <Link href="/for-venues" style={{
            display: 'inline-block', padding: '12px 28px', border: '1px solid var(--color-border)',
            color: 'var(--color-ink)', textDecoration: 'none', fontSize: 12, fontWeight: 400,
            letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', borderRadius: 4,
          }}>
            Learn More
          </Link>
        </div>
      </div>
    </div>
  )
}
