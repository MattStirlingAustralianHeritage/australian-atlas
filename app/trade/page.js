import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTradeContext } from '@/lib/trade/server-auth'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import TradeNav from '@/components/trade/TradeNav'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trade workspace | Atlas Trade',
  robots: { index: false, follow: false },
}

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — the workspace hub.
   One screen that answers "what can I do here" and "what's new since I
   last looked": counts, quick actions, the new-product radar, recent
   itineraries and open enquiries.                                            */

export default async function TradeHomePage() {
  const { user, account, sb } = await getTradeContext()
  if (!user) redirect('/for-trade')
  if (!account) redirect('/for-trade/apply')

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: networkCount },
    { count: tradeReadyCount },
    { data: itins },
    { data: enquiries },
    { data: radarRows },
  ] = await Promise.all([
    excludeTestListings(excludeNeedsReview(
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
    )),
    sb.from('trade_buildable_listings').select('id', { count: 'exact', head: true }),
    sb
      .from('trade_itineraries')
      .select('id, slug, title, region, status, updated_at')
      .eq('trade_account_id', account.id)
      .order('updated_at', { ascending: false })
      .limit(4),
    sb
      .from('trade_enquiries')
      .select('id, venue_name, enquiry_type, status, created_at')
      .eq('trade_account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(4),
    excludeTestListings(excludeNeedsReview(
      sb
        .from('listings')
        .select('id, name, slug, vertical, sub_type, region, state, created_at')
        .eq('status', 'active')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(8)
    )),
  ])

  const openEnquiries = (enquiries || []).filter((e) => e.status === 'sent').length

  const quickActions = [
    { href: '/trade/directory', title: 'Browse the directory', body: 'Filter the network by region, state, group size, coach access and trade terms.' },
    { href: '/trade/builder', title: 'Build an itinerary', body: 'Describe the tour in plain language; assemble a day-planned, shareable proposal.' },
    { href: '/trade/directory?trade=1', title: 'Trade-ready product', body: `${tradeReadyCount ?? 0} venues have stated trade terms and a contact channel.` },
    { href: '/trade/enquiries', title: 'Your enquiries', body: openEnquiries ? `${openEnquiries} awaiting a reply.` : 'Track rates, availability and famil requests.' },
  ]

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <TradeNav active="home" orgName={account.org_name} />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 6px' }}>
          {account.founding_member
            ? `Founding member${account.founding_cohort_seq ? ` · #${account.founding_cohort_seq}` : ''}`
            : 'Trade beta'}
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
          {account.org_name}
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 300, color: 'var(--color-muted)', margin: '10px 0 0', maxWidth: 640, lineHeight: 1.65 }}>
          A working view over {networkCount == null ? 'thousands of' : Number(networkCount).toLocaleString()} independent
          Australian venues — every one a verified, live record. Build with the whole network; contract with
          the {tradeReadyCount ?? '—'} that have stated trade terms.
        </p>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 28 }}>
          {quickActions.map((a) => (
            <Link key={a.href + a.title} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18, height: '100%', boxSizing: 'border-box' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 16.5, color: 'var(--color-ink)', margin: 0 }}>{a.title}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 300, color: 'var(--color-muted)', margin: '6px 0 0', lineHeight: 1.55 }}>{a.body}</p>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, marginTop: 40, alignItems: 'start' }}>
          {/* New-product radar */}
          <section>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>
              New to the atlas · last 30 days
            </h2>
            {(radarRows || []).length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Quiet month — nothing new yet.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(radarRows || []).map((r) => (
                <a key={r.id} href={getVerticalUrl(r.vertical, r.slug)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-ink)', margin: 0 }}>{r.name}</p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                      {[getVerticalLabel(r.vertical), r.sub_type?.replace(/_/g, ' '), r.region, r.state].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* Recent itineraries + enquiries */}
          <section>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 12 }}>
              Recent work
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(itins || []).length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
                  No itineraries yet — <Link href="/trade/builder" style={{ color: 'var(--color-gold)' }}>build your first</Link>.
                </p>
              )}
              {(itins || []).map((i) => (
                <Link key={i.id} href={i.status === 'published' ? `/trade/itinerary/${i.slug}` : `/trade/builder?id=${i.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</p>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '3px 0 0' }}>{[i.region, i.status].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: i.status === 'published' ? 'var(--color-gold)' : 'var(--color-muted)' }}>
                      {i.status === 'published' ? 'View' : 'Edit'}
                    </span>
                  </div>
                </Link>
              ))}

              {(enquiries || []).length > 0 && (
                <>
                  <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '14px 0 2px' }}>
                    Enquiries
                  </h3>
                  {(enquiries || []).map((e) => (
                    <Link key={e.id} href="/trade/enquiries" style={{ textDecoration: 'none' }}>
                      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)' }}>{e.venue_name || 'Venue'}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: e.status === 'sent' ? 'var(--color-gold)' : 'var(--color-muted)', textTransform: 'capitalize' }}>
                          {e.enquiry_type} · {e.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
