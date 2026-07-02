import { redirect, notFound } from 'next/navigation'
import { getTradeContext } from '@/lib/trade/server-auth'
import { loadFactSheet } from '@/lib/trade/factsheet'
import TradeNav from '@/components/trade/TradeNav'
import EnquiryForm from './EnquiryForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trade fact sheet | Atlas Trade',
  robots: { index: false, follow: false },
}

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — product fact sheet ("the one-pager the trade asks for").
   Gated: includes the trade-only contact channel. Only trade-ready venues
   have fact sheets; everything else 404s.                                    */

export default async function TradeProductPage({ params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  const sheet = await loadFactSheet(sb, { slug: params.slug })
  if (!sheet) notFound()

  const t = sheet.trade || {}
  const p = sheet.profile || {}

  const tradeRows = [
    ['Engagement', [t.bespoke && 'Bespoke / FIT', t.group && 'Groups'].filter(Boolean).join('  +  ') || 'By arrangement'],
    t.group ? ['Group ceiling', t.group_size_max ? `Up to ${t.group_size_max}` : 'No stated ceiling — confirm'] : null,
    ['Trade rates', t.rates_available ? 'Available on request' : 'Not stated — confirm directly'],
    t.contact_before_booking ? ['Booking', 'Contact the operator before including in a program'] : null,
    p.notice_days != null ? ['Minimum notice', p.notice_days === 0 ? 'Same-day possible' : `${p.notice_days} day${p.notice_days === 1 ? '' : 's'}`] : null,
    p.coach_access ? ['Coach access', 'Coach parking / access available'] : null,
    (p.languages || []).length ? ['Languages', p.languages.join(', ')] : null,
    p.dietary_notes ? ['Dietary', p.dietary_notes] : null,
    p.capacity_notes ? ['Capacity', p.capacity_notes] : null,
    p.seasonal_notes ? ['Seasonality', p.seasonal_notes] : null,
    p.insurance_confirmed ? ['Insurance', 'Current public liability insurance confirmed by operator'] : null,
    p.famil_open ? ['Famils', 'Open to famil visits'] : null,
  ].filter(Boolean)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <TradeNav active="directory" orgName={account.org_name} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 6px' }}>
              Trade product fact sheet
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: 'var(--color-ink)', margin: 0, lineHeight: 1.15 }}>
              {sheet.name}
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '8px 0 0' }}>
              {[sheet.vertical_label, sheet.sub_type, sheet.region || sheet.suburb, sheet.state].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`/api/trade/product/${sheet.slug}/pdf`}
              style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', background: 'var(--color-gold)', padding: '9px 18px', borderRadius: 99, textDecoration: 'none' }}
            >
              Download PDF
            </a>
            {sheet.url && (
              <a
                href={sheet.url} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', background: 'white', border: '1px solid var(--color-border)', padding: '9px 18px', borderRadius: 99, textDecoration: 'none' }}
              >
                Public listing ↗
              </a>
            )}
          </div>
        </div>

        {sheet.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sheet.hero_image_url} alt="" style={{ width: '100%', height: 280, objectFit: 'cover', borderRadius: 14, marginTop: 22, display: 'block' }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginTop: 26, alignItems: 'start' }}>
          {/* Left: story + venue details */}
          <div>
            {sheet.description && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 300, color: 'var(--color-ink)', lineHeight: 1.75, margin: 0 }}>
                {sheet.description}
              </p>
            )}
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18, marginTop: 20 }}>
              <h2 style={sectionHead}>The venue</h2>
              <Rows rows={[
                sheet.address ? ['Address', sheet.address] : null,
                sheet.website ? ['Website', sheet.website] : null,
                sheet.founded_year ? ['Founded', String(sheet.founded_year)] : null,
                ['Ownership', sheet.is_owner_operator ? 'Independent, owner-operated' : 'Independent'],
              ].filter(Boolean)} />
            </div>

            {/* Readiness checklist */}
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18, marginTop: 14 }}>
              <h2 style={sectionHead}>
                Trade readiness · {sheet.checklist.done}/{sheet.checklist.total} stated
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sheet.checklist.items.map((item) => (
                  <li key={item.key} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: item.done ? 'var(--color-ink)' : 'var(--color-muted)', display: 'flex', gap: 8 }}>
                    <span style={{ color: item.done ? 'var(--color-gold)' : 'var(--color-border)', fontWeight: 700 }}>{item.done ? '✓' : '—'}</span>
                    {item.label}
                  </li>
                ))}
              </ul>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
                Operator-stated and indicative. Unticked items aren’t “no” — they’re “ask”.
              </p>
            </div>
          </div>

          {/* Right: trade terms + contact + enquiry */}
          <div>
            <div style={{ background: 'white', border: '1px solid rgba(196,155,59,0.55)', borderRadius: 12, padding: 18 }}>
              <h2 style={sectionHead}>Working with the trade</h2>
              <Rows rows={tradeRows} />
            </div>

            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18, marginTop: 14 }}>
              <h2 style={sectionHead}>Trade contact</h2>
              <Rows rows={[
                sheet.contact.name ? ['Contact', sheet.contact.name] : null,
                sheet.contact.email ? ['Email', sheet.contact.email] : null,
                sheet.contact.phone ? ['Phone', sheet.contact.phone] : null,
              ].filter(Boolean)} />
              {!sheet.contact.email && !sheet.contact.phone && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: 0 }}>
                  No direct channel stated — use the enquiry form below.
                </p>
              )}
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', margin: '10px 0 0' }}>
                Shown to signed-in trade buyers only. Never published.
              </p>
            </div>

            <EnquiryForm listingId={sheet.id} venueName={sheet.name} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Rows({ rows }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 10 }}>
          <dt style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', minWidth: 110, flexShrink: 0 }}>{k}</dt>
          <dd style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const sectionHead = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 12px',
}
