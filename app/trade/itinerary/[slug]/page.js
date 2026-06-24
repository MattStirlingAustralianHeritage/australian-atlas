import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { loadItinerary } from '@/lib/trade/itinerary'
import { ATLAS_ATTRIBUTION } from '@/lib/trade/config'
import TradeFields from '@/components/trade/TradeFields'

export const dynamic = 'force-dynamic'

const getPublished = cache(async (slug) => {
  const sb = getSupabaseAdmin()
  return loadItinerary(sb, { slug, requireStatus: 'published' })
})

export async function generateMetadata({ params }) {
  const loaded = await getPublished(params.slug)
  if (!loaded) return { title: 'Itinerary not found | Atlas Trade' }
  const { itinerary, stops } = loaded
  const desc = itinerary.intent_text
    || `A ${stops.length}-stop itinerary${itinerary.region ? ` around ${itinerary.region}` : ''}, curated via Australian Atlas.`
  return {
    title: `${itinerary.title} | Atlas Trade`,
    description: desc,
    robots: { index: false, follow: false }, // trade artefacts aren't for consumer indexing
    openGraph: {
      title: itinerary.title,
      description: desc,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
    },
  }
}

export default async function PublishedTradeItinerary({ params }) {
  const loaded = await getPublished(params.slug)
  if (!loaded) notFound()
  const { itinerary, stops } = loaded

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Header bar with attribution + PDF */}
      <div style={{ borderBottom: '1px solid var(--color-border)', background: 'white' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>
            {ATLAS_ATTRIBUTION}
          </span>
          <a
            href={`/api/trade/pdf/${itinerary.slug}`}
            style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)', background: 'var(--color-gold)', padding: '7px 16px', borderRadius: 99, textDecoration: 'none' }}
          >
            Download PDF
          </a>
        </div>
      </div>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        {/* Title block */}
        <header style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 10 }}>
            Australian Atlas · For the trade
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, margin: '0 0 12px' }}>
            {itinerary.title}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            {[itinerary.region, `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`].filter(Boolean).join('  ·  ')}
          </p>
          {itinerary.intent_text && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: '14px 0 0' }}>
              {itinerary.intent_text}
            </p>
          )}
        </header>

        <div style={{ borderTop: '1px solid var(--color-border)' }} />

        {/* Stops */}
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {stops.map((s, i) => (
            <li key={s.id} style={{ padding: '24px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 16 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-gold)', minWidth: 34 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>
                      {s.name}
                    </a>
                  ) : s.name}
                </h2>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '4px 0 0' }}>
                  {[s.vertical_label, s.sub_type, s.region || s.suburb, s.state].filter(Boolean).join('  ·  ')}
                </p>
                {s.description && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: '10px 0 0' }}>
                    {s.description.length > 360 ? s.description.slice(0, 360).replace(/\s+\S*$/, '') + '…' : s.description}
                  </p>
                )}
                {s.notes && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.55, margin: '10px 0 0', fontStyle: 'italic' }}>
                    {s.notes}
                  </p>
                )}
                {/* Trade enrichment — only for opted-in operators. */}
                {s.trade_ready && <TradeFields trade={s.trade} />}
              </div>
            </li>
          ))}
        </ol>

        {/* Footer attribution — a condition of use, not removable */}
        <footer style={{ marginTop: 32, paddingTop: 20 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-gold)', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 6px' }}>
            {ATLAS_ATTRIBUTION}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            Built on the curated Australian Atlas network of independent operators. Trade rates and capacity shown are
            indicative — confirm directly with each operator before booking.
          </p>
        </footer>
      </article>
    </div>
  )
}
