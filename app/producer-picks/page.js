import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { listPickedVenues } from '@/lib/picks/producerPicks'
import ListingCard from '@/components/ListingCard'

export const revalidate = 3600

const SITE_URL = 'https://australianatlas.com.au'

export const metadata = {
  title: "Producer's Picks | Australian Atlas",
  description:
    'The independent places vouched for by their peers. Every venue here has been personally picked by another verified operator on the Australian Atlas network.',
  openGraph: {
    title: "Producer's Picks | Australian Atlas",
    description:
      'The independent places vouched for by their peers. Every venue here has been personally picked by another verified operator on the Australian Atlas network.',
    url: `${SITE_URL}/producer-picks`,
    siteName: 'Australian Atlas',
    locale: 'en_AU',
    type: 'website',
  },
  alternates: {
    canonical: `${SITE_URL}/producer-picks`,
  },
}

export default async function ProducerPicksPage() {
  const sb = getSupabaseAdmin()
  const venues = await listPickedVenues(sb)

  const subtitle = venues.length > 0
    ? `${venues.length} independent ${venues.length === 1 ? 'place' : 'places'} singled out by another venue on the network — a recommendation from the people who would know best.`
    : 'When a venue vouches for another independent place, it appears here — a recommendation from the people who would know best.'

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <div className="section-gap" style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-4xl mx-auto text-center" style={{ padding: '0 24px' }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--color-sage)', marginBottom: 16,
            fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            {"Producer's Picks"}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            marginBottom: 16,
            lineHeight: 1.15,
          }}>
            Vouched for by their peers
          </h1>
          <p style={{
            color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.7,
            maxWidth: 540, margin: '0 auto',
            fontFamily: 'var(--font-body)',
          }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: 64, paddingBottom: 96 }}>
        {venues.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            {"No producer's picks yet. As venues across the network vouch for one another, their picks will appear here."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {venues.map(({ listing, curators }) => (
              <div key={listing.id}>
                <ListingCard listing={listing} />
                <CuratorLine curators={curators} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// "Picked by …" attribution beneath each card. Names link to the curator's
// place page. Caps at three names with a "+N more" tail so dense cards stay
// tidy. Curators are pre-filtered to active venues in listPickedVenues.
function CuratorLine({ curators }) {
  if (!curators || curators.length === 0) return null
  const shown = curators.slice(0, 3)
  const extra = curators.length - shown.length

  return (
    <p style={{
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
      color: 'var(--color-muted)', lineHeight: 1.5, margin: '10px 2px 0',
    }}>
      Picked by{' '}
      {shown.map((c, i) => (
        <span key={c.id}>
          {i > 0 && ', '}
          {c.slug ? (
            <Link
              href={`/place/${c.slug}`}
              className="hover:underline"
              style={{ color: 'var(--color-ink)', fontWeight: 500, textDecoration: 'none' }}
            >
              {c.name}
            </Link>
          ) : (
            <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{c.name}</span>
          )}
        </span>
      ))}
      {extra > 0 && ` +${extra} more`}
    </p>
  )
}
