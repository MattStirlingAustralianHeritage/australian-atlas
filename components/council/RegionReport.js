import Link from 'next/link'
import PrintButton from './PrintButton'

// Atlas-branded, print-optimised regional performance report. Pure presentation:
// it renders whatever metrics object computeRegionMetrics produced (interim JS
// or RPC-backed — same shape), so it is interim-data compatible. Used by both
// /council/[region]/report and /council/example.

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-AU') : '0')

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

const C = {
  ink: 'var(--color-ink)',
  muted: 'var(--color-muted)',
  border: 'var(--color-border)',
  sage: 'var(--color-sage)',
  cream: 'var(--color-cream)',
  display: 'var(--font-display)',
  body: 'var(--font-body)',
}

function Stat({ value, label, sub }) {
  return (
    <div
      className="print-avoid-break"
      style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.1rem 1.25rem', background: '#fff' }}
    >
      <p style={{ fontFamily: C.display, fontSize: '2rem', fontWeight: 400, color: C.ink, margin: '0 0 0.15rem' }}>
        {value}
      </p>
      <p style={{ fontFamily: C.body, fontSize: '0.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, margin: 0 }}>
        {label}
      </p>
      {sub && <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, margin: '0.25rem 0 0' }}>{sub}</p>}
    </div>
  )
}

function SectionTitle({ children, note }) {
  return (
    <div style={{ margin: '0 0 0.75rem' }}>
      <h2 style={{ fontFamily: C.display, fontSize: '1.15rem', fontWeight: 400, color: C.ink, margin: 0 }}>{children}</h2>
      {note && <p style={{ fontFamily: C.body, fontSize: '0.75rem', color: C.muted, margin: '0.2rem 0 0' }}>{note}</p>}
    </div>
  )
}

export default function RegionReport({ metrics, variant = 'report', rangeLabel = 'Last 90 days', council = null, uniqueVisitors = null }) {
  const region = metrics?.region || {}
  const periodEnd = fmtDate(metrics?.generatedAt)
  const hasUnique = typeof uniqueVisitors === 'number'

  return (
    <div style={{ background: variant === 'example' ? 'var(--color-bg)' : '#fff', minHeight: '100vh', padding: '2rem 1rem' }}>
      {/* Example banner (screen only) */}
      {variant === 'example' && (
        <div
          className="no-print"
          style={{
            maxWidth: 820, margin: '0 auto 1.25rem', padding: '0.9rem 1.25rem', borderRadius: 10,
            background: C.cream, border: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap',
            alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
          }}
        >
          <span style={{ fontFamily: C.body, fontSize: '0.85rem', color: C.ink }}>
            <strong>Example report</strong> — real Australian Atlas data for {region.name}. Your council&rsquo;s
            report covers your own region(s).
          </span>
          <Link
            href="/council/enquire?plan=partner"
            style={{
              fontFamily: C.body, fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
              background: C.sage, color: '#fff', padding: '0.5rem 1rem', borderRadius: 999, whiteSpace: 'nowrap',
            }}
          >
            Get this for your region →
          </Link>
        </div>
      )}

      {/* The printable page */}
      <article
        className="print-page"
        style={{
          maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 12,
          border: `1px solid ${C.border}`, padding: '2.5rem 2.25rem',
        }}
      >
        {/* Masthead — white-labelled to the managing council when known (logo +
            name), Atlas-branded otherwise. Only public branding is ever shown. */}
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              {council?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={council.logo_url}
                  alt={council.name || 'Council'}
                  style={{ maxHeight: 46, maxWidth: 220, objectFit: 'contain', display: 'block', marginBottom: '0.6rem' }}
                />
              ) : (
                <p style={{ fontFamily: C.display, fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.5rem' }}>
                  {council?.name || 'Australian Atlas'}
                </p>
              )}
              <h1 style={{ fontFamily: C.display, fontSize: '1.9rem', fontWeight: 400, color: C.ink, margin: 0, lineHeight: 1.15 }}>
                {region.name}
              </h1>
              <p style={{ fontFamily: C.body, fontSize: '0.9rem', color: C.muted, margin: '0.35rem 0 0' }}>
                Regional Performance Report{region.state ? ` · ${region.state}` : ''}
                {council?.name ? ` · prepared for ${council.name}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: C.body, fontSize: '0.75rem', color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {rangeLabel}
              </p>
              <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, margin: '0.2rem 0 0' }}>
                Prepared by Australian Atlas
              </p>
            </div>
          </div>
        </header>

        {/* Point-in-time stamp — the spine of the artifact. Prominent + dated so the
            report reads honestly as a frozen snapshot, never a live view. */}
        <div
          className="print-avoid-break"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap',
            border: `1px solid ${C.sage}`, borderLeft: `4px solid ${C.sage}`, borderRadius: 8,
            background: C.cream, padding: '0.7rem 1rem', margin: '0 0 1.75rem',
          }}
        >
          <span style={{ fontFamily: C.display, fontSize: '1rem', color: C.ink, fontWeight: 600 }}>
            Data as at {periodEnd || '—'}
          </span>
          <span style={{ fontFamily: C.body, fontSize: '0.78rem', color: C.muted }}>
            Point-in-time snapshot — figures are frozen as of this date and will differ from the live dashboard.
          </span>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <Stat value={fmt(metrics?.regionPageViews)} label="Region page views" />
          <Stat value={fmt(metrics?.totalClicks)} label="Listing clicks" />
          {hasUnique && <Stat value={fmt(uniqueVisitors)} label="Unique visitors" />}
          <Stat value={fmt(metrics?.totalListings)} label="Independent operators" sub="Published in this region" />
          <Stat value={fmt(metrics?.newListings)} label="New this period" />
        </div>

        {/* Top listings by clicks */}
        <section className="print-avoid-break" style={{ marginBottom: '1.75rem' }}>
          <SectionTitle note="Visits to each venue's place page across the Atlas network, bot-filtered.">
            Most-viewed places
          </SectionTitle>
          {metrics?.topListings?.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.body, fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem 0.5rem 0', color: C.muted, fontWeight: 500, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Place</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: C.muted, fontWeight: 500, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0 0.5rem 0.5rem', color: C.muted, fontWeight: 500, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Views</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topListings.map((l) => (
                  <tr key={`${l.slug}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.5rem 0.5rem 0.5rem 0', color: C.ink, fontWeight: 500 }}>{l.name}</td>
                    <td style={{ padding: '0.5rem', color: C.muted }}>{l.verticalLabel}</td>
                    <td style={{ padding: '0.5rem 0 0.5rem 0.5rem', color: C.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No place-page views recorded in this period yet.</Empty>
          )}
        </section>

        {/* Two-up: visitor origin + searches */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
          <section className="print-avoid-break">
            <SectionTitle note="Where visitors to this region's places are browsing from.">Visitor origin</SectionTitle>
            {metrics?.visitorOrigin?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {metrics.visitorOrigin.map((o, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: `1px solid ${C.border}`, fontFamily: C.body, fontSize: '0.85rem' }}>
                    <span style={{ color: C.ink }}>
                      {o.city}
                      {o.area ? <span style={{ color: C.muted }}>{`, ${o.area}`}</span> : null}
                      {o.country && o.country !== 'AU' ? <span style={{ color: C.muted }}>{` (${o.country})`}</span> : null}
                    </span>
                    <span style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(o.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Not enough located visits yet.</Empty>
            )}
          </section>

          <section className="print-avoid-break">
            <SectionTitle note="Searches on the Atlas network naming this region or its towns.">Search interest</SectionTitle>
            {metrics?.topSearches?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {metrics.topSearches.map((s, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem 0', borderBottom: `1px solid ${C.border}`, fontFamily: C.body, fontSize: '0.85rem' }}>
                    <span style={{ color: C.ink }}>&ldquo;{s.query}&rdquo;</span>
                    <span style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No region-specific searches recorded in this period.</Empty>
            )}
          </section>
        </div>

        {/* Methodology + attribution. A <div>, not a <footer>: the global print
            rule hides <footer> (the site footer) and we want this to print. */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem', marginTop: '0.5rem' }}>
          <p style={{ fontFamily: C.body, fontSize: '0.78rem', color: C.ink, fontWeight: 500, margin: '0 0 0.5rem' }}>
            Generated from Australian Atlas — live data at australianatlas.com.au
          </p>
          <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, lineHeight: 1.55, margin: '0 0 0.5rem' }}>
            Methodology: metrics are drawn from anonymous pageviews and on-site searches across the nine
            Australian Atlas verticals, with datacenter and crawler traffic excluded. Listings are attributed
            to {region.name} by verified geographic anchoring. Test fixtures are excluded.
          </p>
          <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, margin: 0 }}>
            councils@australianatlas.com.au
          </p>
        </div>
      </article>

      {/* Print control (screen only) */}
      <div className="no-print" style={{ maxWidth: 820, margin: '1.25rem auto 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <PrintButton />
      </div>
    </div>
  )
}

function Empty({ children }) {
  return (
    <p style={{ fontFamily: C.body, fontSize: '0.82rem', color: C.muted, margin: '0.25rem 0 0' }}>{children}</p>
  )
}
