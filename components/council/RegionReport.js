import Link from 'next/link'
import PrintButton from './PrintButton'
import { TrendChart, DeltaBadge } from './charts'
import { getVerticalLabel } from '@/lib/verticalUrl'

// Atlas-branded, print-optimised regional performance report. Pure presentation:
// it renders whatever metrics object computeRegionMetrics produced (interim JS
// or RPC-backed — same shape), so it is interim-data compatible. Used by both
// /council/[region]/report and /council/example.
//
// Optional intelligence props (sessions, trends, benchmark, byVertical) light up
// the councillor-ready sections — weekly chart, period deltas, network rank,
// category coverage. All are null-safe: the report degrades gracefully to the
// original summary when a caller doesn't supply them.

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

function Stat({ value, label, sub, delta }) {
  return (
    <div
      className="print-avoid-break"
      style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.1rem 1.25rem', background: '#fff' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', justifyContent: 'space-between' }}>
        <p style={{ fontFamily: C.display, fontSize: '2rem', fontWeight: 400, color: C.ink, margin: '0 0 0.15rem' }}>
          {value}
        </p>
        {delta || null}
      </div>
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

// Plain-English headline for the covering paragraph — templated from the data,
// never generated: every clause has a guard so thin data degrades to a shorter
// sentence rather than a wrong one.
function buildHeadline({ metrics, trends, benchmark, rangeLabel }) {
  const name = metrics?.region?.name
  if (!name) return null
  const views = metrics?.regionPageViews || 0
  const clicks = metrics?.totalClicks || 0
  if (views + clicks === 0) return null

  const windowText = (rangeLabel || 'the selected period').toLowerCase().replace(/^last/, 'the last')
  const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`
  let s = `Over ${windowText}, ${name} drew ${plural(views, 'region page view')} and ${plural(clicks, 'visit')} to its venues' pages across the Australian Atlas network`

  const cur = (trends?.current?.views || 0) + (trends?.current?.clicks || 0)
  const prev = (trends?.previous?.views || 0) + (trends?.previous?.clicks || 0)
  if (prev > 0 && cur > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct >= 5) s += ` — up ${pct}% on the previous period`
    else if (pct <= -5) s += ` — down ${Math.abs(pct)}% on the previous period`
  }
  const origin = metrics?.visitorOrigin?.[0]
  if (origin?.city) s += `, with the strongest interest coming from ${origin.city}`
  s += '.'

  if (benchmark?.rank && benchmark?.of) {
    s += ` That places it #${benchmark.rank} of ${benchmark.of} published Atlas regions by visitor interest.`
  }
  return s
}

export default function RegionReport({
  metrics,
  variant = 'report',
  rangeLabel = 'Last 90 days',
  council = null,
  sessions = null,
  trends = null,
  benchmark = null,
  byVertical = null,
}) {
  const region = metrics?.region || {}
  const periodEnd = fmtDate(metrics?.generatedAt)
  // White-label: when an authenticated council views its own region's report we
  // lead with the council's branding (logo + name); prospects (and the public
  // example) keep the Australian Atlas masthead.
  const brandName = council?.name || 'Australian Atlas'
  const headline = buildHeadline({ metrics, trends, benchmark, rangeLabel })
  const split = trends?.split
  const located = split ? split.local + split.visiting : 0

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
            href="/council/enquire"
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
        {/* Masthead */}
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              {council?.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={council.logo_url} alt={brandName} style={{ height: 34, width: 'auto', margin: '0 0 0.6rem', display: 'block' }} />
              ) : null}
              <p style={{ fontFamily: C.display, fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.5rem' }}>
                {brandName}
              </p>
              <h1 style={{ fontFamily: C.display, fontSize: '1.9rem', fontWeight: 400, color: C.ink, margin: 0, lineHeight: 1.15 }}>
                {region.name}
              </h1>
              <p style={{ fontFamily: C.body, fontSize: '0.9rem', color: C.muted, margin: '0.35rem 0 0' }}>
                Regional Performance Report{region.state ? ` · ${region.state}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: C.body, fontSize: '0.75rem', color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {rangeLabel}
              </p>
              {periodEnd && (
                <p style={{ fontFamily: C.body, fontSize: '0.75rem', color: C.muted, margin: '0.2rem 0 0' }}>
                  Data as at {periodEnd}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Headline summary */}
        {headline && (
          <p style={{ fontFamily: C.display, fontSize: '1.05rem', color: C.ink, lineHeight: 1.55, margin: '0 0 1.5rem' }}>
            {headline}
          </p>
        )}

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <Stat
            value={fmt(metrics?.regionPageViews)}
            label="Region page views"
            delta={<DeltaBadge current={trends?.current?.views} previous={trends?.previous?.views} />}
          />
          <Stat
            value={fmt(metrics?.totalClicks)}
            label="Listing clicks"
            delta={<DeltaBadge current={trends?.current?.clicks} previous={trends?.previous?.clicks} />}
          />
          {typeof sessions === 'number' && sessions > 0 && (
            <Stat value={fmt(sessions)} label="Unique visitors" sub="distinct people, bot-filtered" />
          )}
          <Stat value={fmt(metrics?.totalListings)} label="Listings in region" />
          {/* "New this period" is only meaningful once the dataset has aged: a
              listing's created_at is its Atlas import date, so early in a region's
              life every listing reads as "new" (newListings === totalListings) and
              the stat just duplicates "Listings in region". Show it only once it
              carries signal (some, but not all, listings new in the window). */}
          {typeof metrics?.newListings === 'number'
            && metrics.newListings > 0
            && metrics.newListings < metrics.totalListings && (
            <Stat value={fmt(metrics.newListings)} label="New this period" />
          )}
        </div>

        {/* Weekly trend */}
        {trends?.series?.length > 1 && (
          <section className="print-avoid-break" style={{ marginBottom: '1.75rem' }}>
            <SectionTitle note="Weekly page views and listing clicks over the reporting window; the change badges above compare against the preceding period of the same length.">
              Weekly interest
            </SectionTitle>
            <TrendChart series={trends.series} height={200} />
          </section>
        )}

        {/* Network benchmark */}
        {benchmark?.rank != null && (
          <section className="print-avoid-break" style={{ marginBottom: '1.75rem', background: C.cream, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1.1rem 1.25rem' }}>
            <SectionTitle note={`Compared with all ${benchmark.of} published Atlas regions over the same window.`}>
              How {region.name} compares
            </SectionTitle>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontFamily: C.body, fontSize: '0.85rem', color: C.ink }}>
              <span><strong style={{ fontFamily: C.display, fontSize: '1.35rem', fontWeight: 400 }}>#{benchmark.rank}</strong> of {benchmark.of} regions by visitor interest</span>
              <span style={{ alignSelf: 'flex-end' }}>{fmt(benchmark.clicks)} listing clicks <span style={{ color: C.muted }}>(network median {fmt(benchmark.medianClicks)})</span></span>
              {typeof benchmark.clicksPerListing === 'number' && (
                <span style={{ alignSelf: 'flex-end' }}>{benchmark.clicksPerListing} clicks per listing <span style={{ color: C.muted }}>(median {benchmark.medianClicksPerListing})</span></span>
              )}
            </div>
          </section>
        )}

        {/* Local vs visiting */}
        {located > 3 && (
          <section className="print-avoid-break" style={{ marginBottom: '1.75rem' }}>
            <SectionTitle note="Whether interest is coming from within the region or from prospective visitors elsewhere (IP-based, approximate).">
              Local vs visiting interest
            </SectionTitle>
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'rgba(28,26,23,0.07)', marginBottom: '0.4rem' }}>
              <div style={{ width: `${(split.visiting / located) * 100}%`, background: 'var(--color-sage)' }} />
              <div style={{ width: `${(split.local / located) * 100}%`, background: 'var(--color-gold)' }} />
            </div>
            <p style={{ fontFamily: C.body, fontSize: '0.8rem', color: C.muted, margin: 0 }}>
              {Math.round((split.visiting / located) * 100)}% visiting · {Math.round((split.local / located) * 100)}% local
            </p>
          </section>
        )}

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
            <SectionTitle note="Where in Australia visitors to this region's places are browsing from.">Visitor origin</SectionTitle>
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

        {/* Category coverage */}
        {byVertical && Object.keys(byVertical).length > 0 && (
          <section className="print-avoid-break" style={{ marginBottom: '1.75rem' }}>
            <SectionTitle note="Independent operators in the region by Atlas category.">Category coverage</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.body, fontSize: '0.85rem' }}>
              <tbody>
                {Object.entries(byVertical).sort((a, b) => b[1] - a[1]).map(([vertical, count]) => (
                  <tr key={vertical} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.45rem 0.5rem 0.45rem 0', color: C.ink }}>{getVerticalLabel(vertical)} Atlas</td>
                    <td style={{ padding: '0.45rem 0 0.45rem 0.5rem', color: C.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Methodology + attribution. A <div>, not a <footer>: the global print
            rule hides <footer> (the site footer) and we want this to print. */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem', marginTop: '0.5rem' }}>
          <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, lineHeight: 1.55, margin: '0 0 0.5rem' }}>
            Methodology: metrics are drawn from anonymous pageviews and on-site searches across the
            Australian Atlas verticals, with datacenter and crawler traffic excluded and visitor origin
            limited to Australian locations. Listings are attributed to {region.name} by verified geographic
            anchoring. Period comparisons use the preceding window of equal length. Network rank compares all
            published Atlas regions over the same window. Test fixtures are excluded. This report is a
            point-in-time snapshot — figures are frozen as at the date shown.
          </p>
          <p style={{ fontFamily: C.body, fontSize: '0.72rem', color: C.muted, margin: 0 }}>
            Prepared by Australian Atlas · australianatlas.com.au · councils@australianatlas.com.au
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
