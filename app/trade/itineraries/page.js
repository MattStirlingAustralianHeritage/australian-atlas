import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTradeContext } from '@/lib/trade/server-auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My itineraries | Atlas Trade',
  robots: { index: false, follow: false },
}

export default async function TradeItinerariesPage() {
  const { user, account, sb } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  const { data: itins } = await sb
    .from('trade_itineraries')
    .select('id, slug, title, region, status, updated_at')
    .eq('trade_account_id', account.id)
    .order('updated_at', { ascending: false })

  const ids = (itins || []).map((i) => i.id)
  const counts = new Map()
  if (ids.length) {
    const { data: stops } = await sb.from('trade_itinerary_stops').select('itinerary_id').in('itinerary_id', ids)
    for (const s of stops || []) counts.set(s.itinerary_id, (counts.get(s.itinerary_id) || 0) + 1)
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 6px' }}>
              Atlas Trade
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
              My itineraries
            </h1>
          </div>
          <Link href="/trade/builder" style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', background: 'var(--color-gold)', padding: '10px 20px', borderRadius: 99, textDecoration: 'none' }}>
            New itinerary
          </Link>
        </div>

        {(!itins || itins.length === 0) ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6 }}>
            Nothing yet. <Link href="/trade/builder" style={{ color: 'var(--color-gold)' }}>Build your first itinerary</Link>.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {itins.map((i) => (
              <li key={i.id} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>{i.title}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                    {[i.region, `${counts.get(i.id) || 0} stops`, i.status].filter(Boolean).join('  ·  ')}
                  </p>
                </div>
                {i.status === 'published' ? (
                  <Link href={`/trade/itinerary/${i.slug}`} style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    View
                  </Link>
                ) : (
                  <span style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>Draft</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
