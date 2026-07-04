import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { listPickedVenues } from '@/lib/picks/producerPicks'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { ogLocale } from '@/lib/i18n/config'
import ListingCard from '@/components/ListingCard'

export const revalidate = 3600

const SITE_URL = 'https://australianatlas.com.au'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = {
    en: 'Producer Picks | Australian Atlas',
    ko: '프로듀서 픽 | Australian Atlas',
    zh: 'Producer Picks | Australian Atlas',
  }[locale] || 'Producer Picks | Australian Atlas'
  const description = {
    en: 'The independent places vouched for by their peers. Every venue here has been personally picked by another verified operator on the Australian Atlas network.',
    ko: '동료들이 보증하는 독립 장소들. 이곳의 모든 업체는 Australian Atlas 네트워크의 또 다른 검증된 운영자가 직접 추천했습니다.',
    zh: '由同行亲自背书的独立场所。这里的每一家都由 Australian Atlas 网络中另一位经过核实的经营者亲手推荐。',
  }[locale] || 'The independent places vouched for by their peers. Every venue here has been personally picked by another verified operator on the Australian Atlas network.'
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/producer-picks`,
      siteName: 'Australian Atlas',
      locale: ogLocale(locale),
      type: 'website',
    },
    alternates: {
      canonical: `${SITE_URL}/producer-picks`,
    },
  }
}

export default async function ProducerPicksPage() {
  const sb = getSupabaseAdmin()
  const t = await getTranslations('explore')
  const locale = await getLocale()
  const venues = await listPickedVenues(sb)

  // Overlay Korean name/description onto the picked listing objects for /ko.
  const overlaid = await overlayListingTranslations(venues.map(v => v.listing), locale)
  const overlaidById = new Map(overlaid.map(l => [l && l.id, l]))
  const localizedVenues = venues.map(v => ({ ...v, listing: overlaidById.get(v.listing?.id) || v.listing }))

  const subtitle = localizedVenues.length > 0
    ? t('picksSubtitleCount', { count: localizedVenues.length })
    : t('picksSubtitleEmpty')

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Hero */}
      <div className="section-gap" style={{ background: 'var(--color-cream)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-4xl mx-auto text-center" style={{ padding: '0 24px' }}>
          <p className="section-dateline" style={{ marginBottom: 16 }}>
            {t('picksKicker')}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            marginBottom: 16,
            lineHeight: 1.15,
          }}>
            {t('picksTitle')}
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
        {localizedVenues.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            color: 'var(--color-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
          }}>
            {t('picksEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {localizedVenues.map(({ listing, curators }) => (
              <div key={listing.id}>
                <ListingCard listing={listing} />
                <CuratorLine curators={curators} t={t} />
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
function CuratorLine({ curators, t }) {
  if (!curators || curators.length === 0) return null
  const shown = curators.slice(0, 3)
  const extra = curators.length - shown.length

  return (
    <p style={{
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
      color: 'var(--color-muted)', lineHeight: 1.5, margin: '10px 2px 0',
    }}>
      {t('pickedBy')}{' '}
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
      {extra > 0 && ` ${t('plusMore', { count: extra })}`}
    </p>
  )
}
