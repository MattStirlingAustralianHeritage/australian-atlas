import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import ClaimSearch from './ClaimSearch'

export const metadata = {
  title: 'Claim Your Listing — Australian Atlas',
  description: 'Find your venue and claim your free listing on Australian Atlas.',
}

export const revalidate = 3600

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

export default async function ClaimPage() {
  const sb = getSupabaseAdmin()

  // Fetch all active, unclaimed listings for client-side search
  const { data: listings } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, is_claimed')
    .eq('status', 'active')
    .order('name')

  const serialized = (listings || []).map(l => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    verticalLabel: VERTICAL_LABELS[l.vertical] || l.vertical,
    verticalColor: VERTICAL_COLORS[l.vertical] || '#5F8A7E',
    region: l.region,
    state: l.state,
    isClaimed: l.is_claimed || false,
  }))

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <section style={{ padding: '100px 24px 48px', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-sage)', marginBottom: 16, fontFamily: 'var(--font-body)' }}>Claim Your Listing</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: 16 }}>
            Find your venue
          </h1>
          <p style={{ fontSize: 16, color: 'var(--color-muted)', lineHeight: 1.7, fontFamily: 'var(--font-body)', marginBottom: 0 }}>
            Search across all nine Atlas Network directories. Once you find your venue, claim it for free.
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 24px 80px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ClaimSearch listings={serialized} />
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
