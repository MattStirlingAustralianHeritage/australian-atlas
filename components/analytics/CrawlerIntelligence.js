'use client'

// Bots & AI crawlers tab for /admin/analytics.
//
// Everything rendered here is aggregated in Postgres by the crawler_* functions
// (supabase/migrations 272-274) and arrives pre-computed from
// /api/analytics/crawlers. This component does layout and formatting only — it
// never sums a window itself, because the underlying table is ~182k rows and
// any client-side total would be computed over PostgREST's first 1000.
//
// Charts are hand-rolled inline SVG, matching components/TrafficTrend.js. The
// only charting dependency in this project is Mapbox, and that is for maps.

import { Fragment, useState } from 'react'

const CARD = {
  background: '#fff',
  borderRadius: '12px',
  border: '1px solid var(--color-border, #E5E0D8)',
  padding: '1.25rem',
}
const MUTED = 'var(--color-muted, #8B8578)'
const INK = 'var(--color-ink, #2D2A26)'
const BORDER = 'var(--color-border, #E5E0D8)'

const AI_CATEGORIES = ['ai_assistant', 'ai_search', 'ai_training']

const PATH_KIND_LABELS = {
  place: 'Venue pages', region: 'Region pages', trail: 'Trails', editorial: 'Journal & press',
  map: 'Map', discovery: 'Search & explore', collection: 'Collections', planning: 'Trip planning',
  og_image: 'Social preview images', commercial: 'Operator & pricing', about: 'About & network',
  // Not all of `private` is robots-disallowed — /login and /auth are crawlable,
  // /admin and /dashboard are not — so this label must not claim otherwise.
  // The robots.txt compliance panel is the authority on actual violations.
  robots: 'robots.txt', sitemap: 'Sitemap', api: 'API', private: 'Private & auth',
  home: 'Homepage', other: 'Other',
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const num = (v) => (Number(v) || 0).toLocaleString()
const pct = (part, whole) => (whole > 0 ? Math.round((Number(part) || 0) / whole * 100) : 0)

function formatBucket(bucket, unit) {
  const d = new Date(bucket)
  if (isNaN(d)) return String(bucket)
  if (unit === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`
  if (unit === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function formatWhen(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export default function CrawlerIntelligence({ data, loading, selectedBot, onSelectBot }) {
  const [feedOpen, setFeedOpen] = useState(false)

  if (loading && !data) {
    return <div style={{ padding: '4rem', textAlign: 'center', color: MUTED }}>Loading crawler intelligence…</div>
  }
  if (!data) return null

  const cats = data.categories || {}
  const o = data.overview || {}
  const cov = data.coverage || {}
  const totalHits = Number(o.total_hits) || 0
  const catMeta = (key) => cats[key] || { label: key, short: key, color: '#6E6A63', blurb: '' }

  if (!totalHits && !data.error) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: MUTED, margin: 0 }}>No crawler activity recorded in this window.</p>
      </div>
    )
  }

  return (
    <div>
      {data.error && (
        <div style={{ ...CARD, borderColor: '#C77D4A', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, color: '#A85A4A', fontSize: '0.85rem' }}>{data.error}</p>
        </div>
      )}

      {/* ── Headline counters ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Stat label="Bot Requests" value={num(o.total_hits)} sub={`${num(o.distinct_paths)} distinct URLs`} />
        <Stat
          label="AI Crawler Requests"
          value={num(o.ai_hits)}
          sub={`${pct(o.ai_hits, totalHits)}% of all bot traffic`}
          accent="#B8862B"
        />
        <Stat
          label="Human-Prompted AI Fetches"
          value={num(o.assistant_hits)}
          sub="someone asked an AI about you"
          accent="#B8862B"
        />
        <Stat label="Distinct Bots" value={num(o.distinct_bots)} sub={`${num(o.distinct_operators)} operators`} />
        <Stat label="Source Addresses" value={num(o.distinct_ips)} sub="unique crawler IPs" />
        <Stat
          label="robots.txt Violations"
          value={num(o.disallowed_hits)}
          sub={Number(o.disallowed_hits) ? 'disallowed paths fetched' : 'none in window'}
          accent={Number(o.disallowed_hits) ? '#A85A4A' : undefined}
        />
      </div>

      {/* ── AI visibility coverage ────────────────────────────────────── */}
      <Panel
        title="AI Visibility Coverage"
        note="Of the venues currently live on the portal, how many an AI system has actually read. A venue no AI crawler has fetched cannot be cited in an AI answer."
      >
        {Number(cov.total_listings) ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            <Coverage
              label="Read by any AI crawler"
              value={cov.crawled_ai}
              total={cov.total_listings}
              color="#B8862B"
              note="training, search or assistant"
            />
            <Coverage
              label="In an AI search index"
              value={cov.crawled_ai_search}
              total={cov.total_listings}
              color="#6B7F5E"
              note="citable in AI answers"
            />
            <Coverage
              label="Fetched for a real user"
              value={cov.crawled_assistant}
              total={cov.total_listings}
              color="#C77D4A"
              note="someone asked about this venue"
            />
            <Coverage
              label="Crawled by Google"
              value={cov.crawled_google}
              total={cov.total_listings}
              color="#3D5A6E"
              note="classic search index"
            />
          </div>
        ) : (
          <Empty>No live listings to measure against.</Empty>
        )}
      </Panel>

      {/* ── Activity over time ────────────────────────────────────────── */}
      <StackedTimeline
        rows={data.timeline}
        unit={data.bucketUnit}
        categories={cats}
        selectedBot={selectedBot}
        botRows={data.botTimeline}
      />

      {/* ── Category + operator mix ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Panel title="What Kind of Bot" note="Every request classified by what the crawler is for." flush>
          {(data.byCategory || []).map((row) => {
            const meta = catMeta(row.bot_category)
            return (
              <div key={row.bot_category} style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: INK, fontWeight: 500 }}>{meta.label}</span>
                  <span style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {num(row.hits)} · {pct(row.hits, totalHits)}%
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: 'hidden', margin: '0.35rem 0 0.3rem' }}>
                  <div style={{ height: '100%', width: `${pct(row.hits, totalHits)}%`, background: meta.color, borderRadius: 3 }} />
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: MUTED, lineHeight: 1.45 }}>{meta.blurb}</p>
              </div>
            )
          })}
          {!(data.byCategory || []).length && <Empty>No categories in window.</Empty>}
        </Panel>

        <Panel title="Who Operates Them" note="Rolled up by the company running the crawler." flush>
          {(data.byOperator || []).map((row) => (
            <div key={row.bot_operator} style={{ marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: INK }}>
                  {row.bot_operator}
                  {row.ai && <Chip color="#B8862B" style={{ marginLeft: '0.4rem' }}>AI</Chip>}
                </span>
                <span style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {num(row.hits)}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: BORDER, overflow: 'hidden', marginTop: '0.3rem' }}>
                <div style={{ height: '100%', width: `${pct(row.hits, totalHits)}%`, background: row.ai ? '#B8862B' : '#3D5A6E', borderRadius: 2 }} />
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: MUTED }}>
                {num(row.bots)} bot{Number(row.bots) === 1 ? '' : 's'} · {num(row.paths)} distinct URLs
              </p>
            </div>
          ))}
          {!(data.byOperator || []).length && <Empty>No operators in window.</Empty>}
        </Panel>
      </div>

      {/* ── Per-bot table ─────────────────────────────────────────────── */}
      <Panel
        title="Every Bot Seen"
        note={selectedBot
          ? `Filtered to ${selectedBot} — click it again to clear.`
          : 'Click a row to filter the URL list below to that bot. “URLs” vs “Requests” separates a crawler indexing the catalogue from one hammering a single page.'}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: MUTED, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <Th>Bot</Th><Th>Operator</Th><Th>Purpose</Th>
                <Th align="right">Requests</Th><Th align="right">URLs</Th>
                <Th align="right">Venues</Th><Th align="right">IPs</Th><Th align="right">Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {(data.byBot || []).map((row) => {
                const meta = catMeta(row.bot_category)
                const active = selectedBot === row.bot_name
                return (
                  <tr
                    key={row.bot_name}
                    onClick={() => onSelectBot?.(active ? null : row.bot_name)}
                    style={{
                      borderTop: `1px solid ${BORDER}`,
                      cursor: 'pointer',
                      background: active ? 'rgba(184,134,43,0.08)' : 'transparent',
                    }}
                  >
                    <Td>
                      <span style={{ fontWeight: 600, color: INK }}>{row.bot_name}</span>
                      {row.bot_known === false && <Chip color="#6E6A63" style={{ marginLeft: '0.4rem' }}>unknown</Chip>}
                      {Number(row.disallowed_hits) > 0 && (
                        <Chip color="#A85A4A" style={{ marginLeft: '0.4rem' }}>
                          {num(row.disallowed_hits)} disallowed
                        </Chip>
                      )}
                    </Td>
                    <Td style={{ color: MUTED }}>{row.bot_operator}</Td>
                    <Td><Chip color={meta.color}>{meta.short}</Chip></Td>
                    <Td align="right" mono>{num(row.hits)}</Td>
                    <Td align="right" mono>{num(row.paths)}</Td>
                    <Td align="right" mono>{num(row.place_hits)}</Td>
                    <Td align="right" mono>{num(row.ips)}</Td>
                    <Td align="right" style={{ color: MUTED, whiteSpace: 'nowrap' }}>{formatWhen(row.last_seen)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!(data.byBot || []).length && <Empty>No bots in window.</Empty>}
      </Panel>

      {/* ── What they read ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <Panel title="Where the Crawl Budget Goes" note="Requests by section of the site, with the AI share of each." flush>
          {(data.pathKinds || []).map((row) => {
            const aiShare = pct(row.ai_hits, Number(row.hits) || 1)
            return (
              <div key={row.path_kind} style={{ marginBottom: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: INK }}>
                    {PATH_KIND_LABELS[row.path_kind] || row.path_kind}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {num(row.hits)}
                  </span>
                </div>
                {/* Full bar = all bot requests to this section; filled portion = AI. */}
                <div
                  title={`${aiShare}% of requests to this section came from AI crawlers`}
                  style={{ height: 5, borderRadius: 3, background: BORDER, overflow: 'hidden', marginTop: '0.3rem', position: 'relative' }}
                >
                  <div style={{ position: 'absolute', inset: 0, width: `${pct(row.hits, totalHits)}%`, background: '#C9C3B8', borderRadius: 3 }} />
                  <div style={{ position: 'absolute', inset: 0, width: `${pct(row.ai_hits, totalHits)}%`, background: '#B8862B', borderRadius: 3 }} />
                </div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: MUTED }}>
                  {num(row.paths)} distinct URLs · {aiShare}% AI
                </p>
              </div>
            )
          })}
          {!(data.pathKinds || []).length && <Empty>No sections in window.</Empty>}
        </Panel>

        <Panel
          title="Most-Crawled URLs"
          note={selectedBot ? `Filtered to ${selectedBot}.` : 'Across every bot in the window.'}
          flush
        >
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {(data.topPaths || []).map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: i < data.topPaths.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#B8862B', flexShrink: 0, opacity: 0.7 }} />
                <span style={{ fontSize: '0.78rem', color: INK, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.path}>
                  {row.path}
                </span>
                <span style={{ fontSize: '0.7rem', color: MUTED, flexShrink: 0 }}>{num(row.bots)} bots</span>
                <span style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 44, textAlign: 'right' }}>
                  {num(row.hits)}
                </span>
              </div>
            ))}
          </div>
          {!(data.topPaths || []).length && <Empty>No URLs in window.</Empty>}
        </Panel>
      </div>

      {/* ── Venues AI reads most ──────────────────────────────────────── */}
      <Panel
        title="Venues AI Reads Most"
        note="Live listings ranked by crawler requests. This is, in effect, what the AI ecosystem thinks the Atlas is about."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem 1.5rem' }}>
          {(data.topListings || []).map((row) => (
            <div key={row.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 62 }}>
                {String(row.vertical || '').replace(/_/g, ' ')}
              </span>
              <a
                href={`/place/${row.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.82rem', color: INK, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                {row.name}
              </a>
              <span title={`${num(row.ai_hits)} from AI crawlers · ${num(row.bots)} distinct bots`} style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {num(row.hits)}
              </span>
            </div>
          ))}
        </div>
        {!(data.topListings || []).length && <Empty>No venue pages crawled in window.</Empty>}
      </Panel>

      {/* ── Wasted crawl + robots compliance ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <LocaleCrawling rows={data.localeWaste} supported={data.supportedLocales} totalHits={totalHits} />

        <Panel
          title="robots.txt Compliance"
          note="Bots that fetched a path app/robots.js disallows for every user-agent."
          flush
        >
          {(data.violations || []).length ? (
            (data.violations || []).map((row) => (
              <div key={row.bot_name} style={{ padding: '0.5rem 0', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: INK, fontWeight: 500 }}>
                    {row.bot_name} <span style={{ color: MUTED, fontWeight: 400 }}>· {row.bot_operator}</span>
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#A85A4A', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {num(row.hits)}
                  </span>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: MUTED, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.sample_path} · {formatWhen(row.last_seen)}
                </p>
              </div>
            ))
          ) : <Empty>No disallowed paths fetched. Every bot in this window honoured robots.txt.</Empty>}
        </Panel>
      </div>

      {/* ── Crawl pressure heatmap ────────────────────────────────────── */}
      <Heatmap rows={data.hourly} />

      {/* ── Source addresses ──────────────────────────────────────────── */}
      <Panel
        title="Busiest Source Addresses"
        note="A bot's identity is a self-declared header; the address it came from is not. Concentrated traffic from one IP is normal for a crawler pool and also the shape of an impersonator."
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 520 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: MUTED, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <Th>Address</Th><Th>Mostly</Th><Th align="right">Requests</Th><Th align="right">URLs</Th><Th align="right">Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {(data.topIps || []).map((row) => (
                <tr key={row.ip} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <Td mono>{row.ip}</Td>
                  <Td style={{ color: MUTED }}>{row.bot_name}</Td>
                  <Td align="right" mono>{num(row.hits)}</Td>
                  <Td align="right" mono>{num(row.paths)}</Td>
                  <Td align="right" style={{ color: MUTED, whiteSpace: 'nowrap' }}>{formatWhen(row.last_seen)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(data.topIps || []).length && <Empty>No addresses in window.</Empty>}
      </Panel>

      {/* ── Catalogue gaps ────────────────────────────────────────────── */}
      <NotSeen notSeen={data.notSeen} categories={cats} catalogueSize={data.catalogueSize} widenedAt={data.detectionWidenedAt} />

      {/* ── Live feed ─────────────────────────────────────────────────── */}
      <Panel
        title="Live Crawler Feed"
        note="The most recent requests, newest first."
        action={
          <button
            onClick={() => setFeedOpen((v) => !v)}
            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: MUTED, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {feedOpen ? 'Collapse' : 'Expand'}
          </button>
        }
        flush
      >
        <div style={{ maxHeight: feedOpen ? 640 : 240, overflowY: 'auto', transition: 'max-height 0.2s ease' }}>
          {(data.recent || []).map((row, i) => {
            const meta = catMeta(row.bot_category)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0', borderBottom: `1px solid ${BORDER}`, fontSize: '0.75rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                <span style={{ color: INK, fontWeight: 500, minWidth: 118, flexShrink: 0 }}>{row.bot_name}</span>
                <span
                  style={{ color: row.disallowed ? '#A85A4A' : MUTED, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}
                  title={row.path}
                >
                  {row.path}
                </span>
                {row.country && <span style={{ color: MUTED, flexShrink: 0 }}>{row.country}</span>}
                <span style={{ color: MUTED, flexShrink: 0, minWidth: 58, textAlign: 'right' }}>{formatWhen(row.fetched_at)}</span>
              </div>
            )
          })}
        </div>
        {!(data.recent || []).length && <Empty>No recent activity.</Empty>}
      </Panel>
    </div>
  )
}

// ── Stacked category trend ────────────────────────────────────────────────
function StackedTimeline({ rows, unit, categories, selectedBot, botRows }) {
  const [hover, setHover] = useState(null)
  const data = Array.isArray(rows) ? rows : []

  // Pivot {bucket, bot_category, hits} into one record per bucket.
  const bucketMap = new Map()
  for (const r of data) {
    const key = r.bucket
    if (!bucketMap.has(key)) bucketMap.set(key, { bucket: key, total: 0, byCat: {} })
    const rec = bucketMap.get(key)
    rec.byCat[r.bot_category] = (rec.byCat[r.bot_category] || 0) + Number(r.hits || 0)
    rec.total += Number(r.hits || 0)
  }
  const buckets = [...bucketMap.values()].sort((a, b) => new Date(a.bucket) - new Date(b.bucket))

  const botByBucket = new Map((Array.isArray(botRows) ? botRows : []).map((r) => [r.bucket, Number(r.hits || 0)]))

  // Stack order: AI categories at the bottom so the AI band reads as a
  // continuous mass, everything else above it.
  const present = [...new Set(data.map((r) => r.bot_category))]
  const order = [
    ...AI_CATEGORIES.filter((c) => present.includes(c)),
    ...present.filter((c) => !AI_CATEGORIES.includes(c)),
  ]

  const W = 900, H = 220
  const ml = 6, mr = 6, mt = 14, mb = 26
  const plotW = W - ml - mr
  const plotTop = mt, plotBottom = H - mb, plotH = plotBottom - plotTop
  const n = buckets.length
  const max = buckets.reduce((m, b) => Math.max(m, b.total), 0) || 1
  const slotW = n ? plotW / n : plotW
  const barW = Math.min(slotW * 0.7, 30)
  const labelStep = Math.max(1, Math.ceil(n / 12))

  const hv = hover != null ? buckets[hover] : null

  return (
    <div style={{ ...CARD, marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.15rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: INK }}>Crawl Activity Over Time</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', fontSize: '0.72rem', color: MUTED, flexWrap: 'wrap' }}>
          {order.map((c) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: (categories[c] || {}).color || '#6E6A63' }} />
              {(categories[c] || {}).short || c}
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontSize: '0.72rem', color: MUTED, margin: '0 0 0.75rem' }}>
        Requests per {unit}, stacked by bot type{selectedBot ? ` · line shows ${selectedBot}` : ''}.
      </p>

      {!n ? <Empty>No activity in window.</Empty> : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
            {buckets.map((b, i) => {
              let acc = 0
              const cx = ml + slotW * (i + 0.5)
              return (
                <g key={b.bucket}>
                  <rect
                    x={cx - slotW / 2} y={plotTop} width={slotW} height={plotH}
                    fill={hover === i ? 'rgba(0,0,0,0.035)' : 'transparent'}
                    onMouseEnter={() => setHover(i)}
                  />
                  {order.map((c) => {
                    const v = b.byCat[c] || 0
                    if (!v) return null
                    const h = (v / max) * plotH
                    const y = plotBottom - acc - h
                    acc += h
                    return (
                      <rect
                        key={c} x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 0.6)}
                        fill={(categories[c] || {}).color || '#6E6A63'}
                        pointerEvents="none"
                      />
                    )
                  })}
                </g>
              )
            })}

            {/* Per-bot overlay when a bot is selected. */}
            {selectedBot && botByBucket.size > 0 && (
              <path
                d={buckets.map((b, i) => {
                  const v = botByBucket.get(b.bucket) || 0
                  return `${i === 0 ? 'M' : 'L'} ${(ml + slotW * (i + 0.5)).toFixed(1)} ${(plotBottom - (v / max) * plotH).toFixed(1)}`
                }).join(' ')}
                fill="none" stroke="#2D2A26" strokeWidth="1.6" strokeLinejoin="round" pointerEvents="none"
              />
            )}

            {buckets.map((b, i) => (i % labelStep === 0 ? (
              <text
                key={`l${b.bucket}`} x={ml + slotW * (i + 0.5)} y={H - 8}
                textAnchor="middle" fontSize="10" fill={MUTED}
              >
                {formatBucket(b.bucket, unit)}
              </text>
            ) : null))}
          </svg>

          {hv && (
            <div style={{
              position: 'absolute', top: 0, left: `${((hover + 0.5) / n) * 100}%`,
              transform: `translateX(${hover / n > 0.7 ? '-105%' : '5%'})`,
              background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '0.5rem 0.65rem', fontSize: '0.72rem', pointerEvents: 'none',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 150, zIndex: 2,
            }}>
              <p style={{ margin: '0 0 0.3rem', fontWeight: 600, color: INK }}>{formatBucket(hv.bucket, unit)}</p>
              {order.filter((c) => hv.byCat[c]).map((c) => (
                <p key={c} style={{ margin: '0.1rem 0', color: MUTED, display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: (categories[c] || {}).color || '#6E6A63' }} />
                    {(categories[c] || {}).short || c}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: INK }}>{num(hv.byCat[c])}</span>
                </p>
              ))}
              <p style={{ margin: '0.35rem 0 0', paddingTop: '0.3rem', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontWeight: 600, color: INK }}>
                <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{num(hv.total)}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Localised crawling ────────────────────────────────────────────────────
// The portal serves /ko and /zh through a middleware rewrite and advertises
// them via hreflang, so crawls of those prefixes are the system working as
// designed — they are localised coverage, not waste. Only a prefix the site
// does NOT serve is wasted budget, and that distinction comes from
// lib/i18n/config via the API rather than being hard-coded here, so this panel
// cannot disagree with what middleware actually serves.
function LocaleCrawling({ rows, supported, totalHits }) {
  const all = Array.isArray(rows) ? rows : []
  const known = new Set(supported || [])
  const served = all.filter((r) => known.has(r.path_locale))
  const unserved = all.filter((r) => !known.has(r.path_locale))

  const Row = ({ row, color }) => (
    <div key={row.path_locale} style={{ marginBottom: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', color: INK, fontFamily: 'ui-monospace, monospace' }}>/{row.path_locale}/…</span>
        <span style={{ fontSize: '0.8rem', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{num(row.hits)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: BORDER, overflow: 'hidden', marginTop: '0.3rem' }}>
        <div style={{ height: '100%', width: `${pct(row.hits, totalHits)}%`, background: color, borderRadius: 2 }} />
      </div>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: MUTED }}>
        {num(row.paths)} distinct URLs · {num(row.bots)} bots · {pct(row.hits, totalHits)}% of all bot traffic
      </p>
    </div>
  )

  return (
    <Panel
      title="Localised Crawling"
      note="Requests for locale-prefixed URLs. The portal serves these through a middleware rewrite and advertises them in hreflang, so this is translated coverage being indexed — not wasted budget."
      flush
    >
      {served.length ? served.map((r) => <Row key={r.path_locale} row={r} color="#6B7F5E" />) : (
        <Empty>No localised crawling in window.</Empty>
      )}

      {unserved.length > 0 && (
        <>
          <p style={{ margin: '1rem 0 0.6rem', fontSize: '0.72rem', fontWeight: 600, color: '#A85A4A' }}>
            Prefixes the site does not serve
          </p>
          {unserved.map((r) => <Row key={r.path_locale} row={r} color="#A85A4A" />)}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: MUTED, lineHeight: 1.5 }}>
            These resolve to nothing. Either add the locale to
            <code style={{ margin: '0 0.25rem', fontSize: '0.7rem' }}>lib/i18n/config</code>
            or return a 410 so crawlers stop asking.
          </p>
        </>
      )}
    </Panel>
  )
}

// ── Hour × weekday crawl pressure ─────────────────────────────────────────
function Heatmap({ rows }) {
  const data = Array.isArray(rows) ? rows : []
  if (!data.length) return null

  const grid = new Map(data.map((r) => [`${r.dow}-${r.hour}`, Number(r.hits || 0)]))
  const max = data.reduce((m, r) => Math.max(m, Number(r.hits || 0)), 0) || 1
  const peak = data.reduce((best, r) => (Number(r.hits) > Number(best.hits || 0) ? r : best), {})

  return (
    <Panel
      title="Crawl Pressure"
      note={`Requests by hour and weekday, Melbourne time. Busiest: ${DOW[peak.dow] || '—'} at ${String(peak.hour ?? 0).padStart(2, '0')}:00 (${num(peak.hits)} requests).`}
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(24, minmax(14px, 1fr))`, gap: 2, minWidth: 560 }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`h${h}`} style={{ fontSize: '0.55rem', color: MUTED, textAlign: 'center' }}>
              {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
            </div>
          ))}
          {DOW.map((label, d) => (
            <Fragment key={`row${d}`}>
              <div style={{ fontSize: '0.65rem', color: MUTED, display: 'flex', alignItems: 'center' }}>{label}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = grid.get(`${d}-${h}`) || 0
                // sqrt scale: crawl volume is heavily skewed, so a linear ramp
                // renders everything but the peak hour as an identical pale square.
                const intensity = v ? 0.12 + 0.88 * Math.sqrt(v / max) : 0
                return (
                  <div
                    key={`${d}-${h}`}
                    title={`${label} ${String(h).padStart(2, '0')}:00 — ${num(v)} requests`}
                    style={{
                      aspectRatio: '1', borderRadius: 2, minHeight: 14,
                      background: v ? `rgba(184,134,43,${intensity.toFixed(3)})` : 'var(--color-border, #E5E0D8)',
                    }}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// ── Catalogue coverage ────────────────────────────────────────────────────
function NotSeen({ notSeen, categories, catalogueSize, widenedAt }) {
  const [open, setOpen] = useState(false)
  const list = Array.isArray(notSeen) ? notSeen : []
  if (!list.length) return null

  // The absence of an AI search or assistant crawler is a finding; the absence
  // of a Czech search engine is not. Lead with the ones that cost us something.
  const notable = list.filter((b) => AI_CATEGORIES.includes(b.category) || b.category === 'search_engine')
  const shown = open ? list : notable

  return (
    <Panel
      title="Not Seen in This Window"
      note={`${list.length} of ${catalogueSize} catalogued bots sent no requests. For an AI search or assistant crawler, that absence is the finding: it cannot cite what it has never fetched.`}
      action={
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: MUTED, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {open ? 'Show notable only' : `Show all ${list.length}`}
        </button>
      }
    >
      {!widenedAt && (
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.72rem', color: '#A85A4A', lineHeight: 1.5 }}>
          Detection for these bots has not started recording yet — until the widened middleware
          deploys, only the original nine tokens are logged, so absence here is not yet evidence
          of absence in reality.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem 1.5rem' }}>
        {shown.map((b) => {
          const meta = categories[b.category] || { short: b.category, color: '#6E6A63' }
          return (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: `1px solid ${BORDER}` }}>
              <Chip color={meta.color}>{meta.short}</Chip>
              <span style={{ fontSize: '0.8rem', color: INK, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.purpose}>
                {b.name}
              </span>
              <span style={{ fontSize: '0.7rem', color: MUTED, flexShrink: 0 }}>{b.operator}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ── Small shared pieces ───────────────────────────────────────────────────
function Panel({ title, note, action, children, flush }) {
  return (
    <div style={{ ...CARD, marginBottom: flush ? 0 : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: INK }}>{title}</h2>
        {action}
      </div>
      {note && <p style={{ fontSize: '0.72rem', color: MUTED, margin: '0.2rem 0 1rem', lineHeight: 1.5, maxWidth: '68ch' }}>{note}</p>}
      {children}
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={CARD}>
      <p style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, margin: '0 0 0.375rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '1.9rem', fontWeight: 600, color: accent || INK, margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif, Georgia)' }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: '0.7rem', color: MUTED, margin: '0.35rem 0 0' }}>{sub}</p>}
    </div>
  )
}

function Coverage({ label, value, total, color, note }) {
  const p = pct(value, Number(total) || 0)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: INK }}>{label}</span>
        <span style={{ fontSize: '1.15rem', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif, Georgia)' }}>{p}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: BORDER, overflow: 'hidden', margin: '0.4rem 0 0.3rem' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <p style={{ margin: 0, fontSize: '0.7rem', color: MUTED }}>
        {num(value)} of {num(total)} · {note}
      </p>
    </div>
  )
}

function Chip({ children, color, style }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 4,
      fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', color, border: `1px solid ${color}`,
      background: 'transparent', whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  )
}

function Th({ children, align }) {
  return <th style={{ padding: '0 0.5rem 0.5rem', textAlign: align || 'left', fontWeight: 600 }}>{children}</th>
}

function Td({ children, align, mono, style }) {
  return (
    <td style={{
      padding: '0.5rem', textAlign: align || 'left',
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: INK, ...style,
    }}>
      {children}
    </td>
  )
}

function Empty({ children }) {
  return <p style={{ color: MUTED, fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{children}</p>
}
