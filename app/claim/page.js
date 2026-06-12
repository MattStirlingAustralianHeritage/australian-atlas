import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ClaimSearch from './ClaimSearch'
import { excludeTestListings } from '@/lib/listings/publicFilter'

const CLAIM_DESCRIPTION = 'Find your venue across all ten Atlas Network directories and claim your free listing on Australian Atlas.'

export const metadata = {
  title: 'Claim Your Listing — Australian Atlas',
  description: CLAIM_DESCRIPTION,
  openGraph: {
    title: 'Claim Your Listing — Australian Atlas',
    description: CLAIM_DESCRIPTION,
    url: 'https://australianatlas.com.au/claim',
  },
  twitter: {
    card: 'summary',
    title: 'Claim Your Listing — Australian Atlas',
    description: CLAIM_DESCRIPTION,
  },
}

export const revalidate = 3600

export default async function ClaimPage() {
  const sb = getSupabaseAdmin()

  // The search itself runs server-side per keystroke (/api/claim/search) so
  // every claimable listing is reachable — a bulk fetch here would silently
  // truncate at PostgREST's 1000-row cap. Only the live total is needed.
  const { count } = await excludeTestListings(
    sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .neq('vertical', 'field')
  )
  const totalCount = count || 0

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <section style={{ padding: '100px 24px 48px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 16, fontFamily: 'var(--font-body)' }}>Claim Your Listing</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16 }}>
            Find your venue
          </h1>
          <p style={{ fontSize: 16, color: 'var(--color-muted)', lineHeight: 1.7, fontFamily: 'var(--font-body)', marginBottom: 0 }}>
            Search across all ten Atlas Network directories. Once you find your venue, claim it for free.
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 24px 80px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ClaimSearch totalCount={totalCount} />
        </div>
      </section>

      {/* Can't find it? */}
      <section style={{ padding: '48px 24px 80px', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 14, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginBottom: 8 }}>
          Can&apos;t find your venue?
        </p>
        <a href="mailto:hello@australianatlas.com.au?subject=New listing request" style={{ color: 'var(--color-sage)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500 }}>
          Request a new listing &rarr;
        </a>
      </section>
    </div>
  )
}
