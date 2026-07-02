import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { loadItinerary } from '@/lib/trade/itinerary'
import { ATLAS_ATTRIBUTION } from '@/lib/trade/config'
import { legBetween } from '@/lib/trade/distance'
import TradeFields from '@/components/trade/TradeFields'

export const dynamic = 'force-dynamic'

const getPublished = cache(async (slug) => {
  const sb = getSupabaseAdmin()
  const loaded = await loadItinerary(sb, { slug, requireStatus: 'published' })
  if (!loaded) return null
  // Co-brand: the authoring account appears beside the Atlas attribution,
  // never instead of it (AUP).
  let account = null
  if (loaded.itinerary.trade_account_id) {
    const { data } = await sb
      .from('trade_accounts')
      .select('org_name, org_website, org_logo_url')
      .eq('id', loaded.itinerary.trade_account_id)
      .maybeSingle()
    account = data || null
  }
  return { ...loaded, account }
})

export async function generateMetadata({ params }) {
  const loaded = await getPublished(params.slug)
  if (!loaded) return { title: 'Itinerary not found | Atlas Trade' }
  const { itinerary, stops } = loaded
  const desc = itinerary.cover_note || itinerary.intent_text
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
  const { itinerary, stops, account } = loaded

  const dayCount = Math.max(1, ...stops.map((s) => s.day || 1))
  const days = Array.from({ length: dayCount }, (_, i) => i + 1)
  let stopNumber = 0

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
          {/* Co-brand strip: prepared by the trade org, curated via Atlas. */}
          {account?.org_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {account.org_logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.org_logo_url} alt={`${account.org_name} logo`} style={{ height: 34, width: 'auto', maxWidth: 130, objectFit: 'contain', display: 'block' }} />
              )}
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: 0 }}>
                Prepared by <strong style={{ color: 'var(--color-ink)' }}>{account.org_name}</strong>
                {account.org_website && (
                  <>
                    {' · '}
                    <a href={account.org_website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-gold)' }}>
                      {account.org_website.replace(/^https?:\/\//, '')}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 10 }}>
            Australian Atlas · For the trade
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.15, margin: '0 0 12px' }}>
            {itinerary.title}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>
            {[
              itinerary.client_name ? `Prepared for ${itinerary.client_name}` : null,
              itinerary.region,
              dayCount > 1 ? `${dayCount} days` : null,
              `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`,
            ].filter(Boolean).join('  ·  ')}
          </p>
          {(itinerary.cover_note || itinerary.intent_text) && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: itinerary.cover_note ? 'var(--color-ink)' : 'var(--color-muted)', lineHeight: 1.7, margin: '14px 0 0' }}>
              {itinerary.cover_note || itinerary.intent_text}
            </p>
          )}
        </header>

        <div style={{ borderTop: '1px solid var(--color-border)' }} />

        {/* Stops, grouped by day */}
        {days.map((day) => {
          const dayStops = stops.filter((s) => (s.day || 1) === day)
          if (dayStops.length === 0) return null
          return (
            <section key={day}>
              {dayCount > 1 && (
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '26px 0 0' }}>
                  Day {day}
                </h2>
              )}
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {dayStops.map((s, di) => {
                  stopNumber += 1
                  const next = dayStops[di + 1]
                  const leg = next ? legBetween(s, next) : null
                  return (
                    <li key={s.id} style={{ padding: '24px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-gold)', minWidth: 34 }}>
                          {String(stopNumber).padStart(2, '0')}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                            {s.time_hint && (
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-muted)', marginRight: 10 }}>
                                {s.time_hint}
                              </span>
                            )}
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ink)', textDecoration: 'none' }}>
                                {s.name}
                              </a>
                            ) : s.name}
                          </h3>
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
                          {leg && (
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '12px 0 0' }}>
                              ↓ {leg.label}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}

        {/* Footer attribution — a condition of use, not removable */}
        <footer style={{ marginTop: 32, paddingTop: 20 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-gold)', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 6px' }}>
            {ATLAS_ATTRIBUTION}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            Built on the curated Australian Atlas network of independent operators. Trade rates and capacity shown are
            indicative, and drive times are estimates — confirm directly with each operator before booking.
          </p>
        </footer>
      </article>
    </div>
  )
}
