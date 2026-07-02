'use client'

import { useEffect, useState } from 'react'
import { getDashboardToken } from '@/lib/dashboard-token'

// ─────────────────────────────────────────────────────────────────────────────
// AI Visibility — how AI assistants read the operator's place page.
//
// Renders inside /dashboard/analytics. Fetches /api/dashboard/ai-visibility
// per owned listing (the API is owner + paid gated) and merges the reports:
// a headline "pulled into N live AI conversations" stat, per-bot breakdown
// bars, an 8-week inline-SVG sparkline (no chart deps), and a plain-English
// explainer. Non-paid owners see a tasteful locked state instead — the same
// treatment as the Suggested Trail tool.
//
// Reporting only: nothing here (and nothing anywhere on the Atlas) influences
// whether AI assistants include a venue in their answers.
// ─────────────────────────────────────────────────────────────────────────────

const BOT_LABELS = {
  'ChatGPT-User': 'ChatGPT',
  'Claude-User': 'Claude',
  'Perplexity-User': 'Perplexity',
  GPTBot: 'GPTBot (OpenAI)',
  'OAI-SearchBot': 'OAI-SearchBot (OpenAI)',
  ClaudeBot: 'ClaudeBot (Anthropic)',
  'Claude-SearchBot': 'Claude-SearchBot (Anthropic)',
  PerplexityBot: 'PerplexityBot (Perplexity)',
  Googlebot: 'Googlebot (Google)',
}

function trendParts(current, previous) {
  if (!previous) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: 'level with prior 30 days', color: 'var(--color-muted)' }
  const up = pct > 0
  return {
    text: `${up ? '↑' : '↓'} ${Math.abs(pct)}% vs prior 30 days`,
    color: up ? 'var(--color-sage, #5f8a7e)' : '#A33A2A',
  }
}

// Merge per-listing API reports into one view. Weekly buckets align by index —
// every report carries the same 8 request-time-anchored weeks.
function mergeReports(reports) {
  const merged = {
    totals: { live_30d: 0, live_prev_30d: 0, crawl_30d: 0, crawl_prev_30d: 0, all_30d: 0, all_prev_30d: 0 },
    bots: [],
    weekly: [],
    capped: false,
  }
  const botMap = new Map()
  for (const r of reports) {
    for (const k of Object.keys(merged.totals)) merged.totals[k] += r.totals?.[k] || 0
    for (const b of r.bots || []) {
      const cur = botMap.get(b.bot_name) || { bot_name: b.bot_name, kind: b.kind, hits_30d: 0, hits_prev_30d: 0 }
      cur.hits_30d += b.hits_30d || 0
      cur.hits_prev_30d += b.hits_prev_30d || 0
      botMap.set(b.bot_name, cur)
    }
    ;(r.weekly || []).forEach((w, i) => {
      if (!merged.weekly[i]) merged.weekly[i] = { week_start: w.week_start, live: 0, crawl: 0, total: 0 }
      merged.weekly[i].live += w.live || 0
      merged.weekly[i].crawl += w.crawl || 0
      merged.weekly[i].total += w.total || 0
    })
    if (r.capped) merged.capped = true
  }
  merged.bots = [...botMap.values()].sort((a, b) => b.hits_30d - a.hits_30d || b.hits_prev_30d - a.hits_prev_30d)
  return merged
}

function weekLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// 8-week trend as a plain inline SVG polyline — no chart dependencies.
function Sparkline({ weekly }) {
  if (!weekly || weekly.length < 2) return null
  const W = 600
  const H = 64
  const PAD = 6
  const max = Math.max(...weekly.map(w => w.total), 1)
  const n = weekly.length
  const pts = weekly.map((w, i) => [
    PAD + (i / (n - 1)) * (W - PAD * 2),
    PAD + (1 - w.total / max) * (H - PAD * 2),
  ])

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          8-week trend
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
          All AI pulls · peak {max}/week
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="AI pulls of your page per week over the last 8 weeks"
      >
        <polyline
          points={pts.map(p => p.join(',')).join(' ')}
          fill="none"
          stroke="var(--color-sage, #5f8a7e)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map(([x, y], i) => (
          <circle
            key={weekly[i].week_start}
            cx={x}
            cy={y}
            r={i === n - 1 ? 4 : 2.5}
            fill={i === n - 1 ? 'var(--color-sage, #5f8a7e)' : '#fff'}
            stroke="var(--color-sage, #5f8a7e)"
            strokeWidth="1.5"
          >
            <title>{`Week of ${weekLabel(weekly[i].week_start)}: ${weekly[i].total} ${weekly[i].total === 1 ? 'pull' : 'pulls'} (${weekly[i].live} live)`}</title>
          </circle>
        ))}
        <text x={PAD} y={H + 14} fontSize="11" fill="var(--color-muted, #888)" fontFamily="var(--font-sans, system-ui)">
          {weekLabel(weekly[0].week_start)}
        </text>
        <text x={W - PAD} y={H + 14} fontSize="11" textAnchor="end" fill="var(--color-muted, #888)" fontFamily="var(--font-sans, system-ui)">
          this week
        </text>
      </svg>
    </div>
  )
}

function BotBars({ title, bots, barColor }) {
  if (!bots.length) return null
  const max = Math.max(...bots.map(b => b.hits_30d), 1)
  return (
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'var(--color-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: '0 0 0.75rem',
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {bots.map(b => (
          <div key={b.bot_name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.85rem',
              color: 'var(--color-ink)',
              flex: '0 0 45%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {BOT_LABELS[b.bot_name] || b.bot_name}
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-cream, #FAF8F5)', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(b.hits_30d > 0 ? 6 : 0, Math.round((b.hits_30d / max) * 100))}%`,
                height: '100%',
                borderRadius: 4,
                background: barColor,
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8rem',
              color: 'var(--color-muted)',
              flex: '0 0 2.5rem',
              textAlign: 'right',
            }}>
              {b.hits_30d}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Locked state for non-paid owners — same treatment as the Suggested Trail tool.
function LockedState() {
  return (
    <div style={{
      background: 'var(--color-cream)',
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-gold)',
      borderRadius: 12,
      padding: '1.75rem 2rem',
      marginBottom: '2rem',
    }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
        A Standard-plan feature
      </p>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
        See how AI assistants read your listing
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
        AI assistants like ChatGPT, Claude and Perplexity read the Atlas when answering travellers.
        The AI Visibility report shows how often your page is pulled into live AI conversations,
        which assistants are reading it, and the trend over time. It&rsquo;s a window, not a lever —
        inclusion in AI answers can&rsquo;t be bought, on the Atlas or anywhere else.
      </p>
      <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
        Manage subscription
      </a>
    </div>
  )
}

export default function AiVisibilitySection({ listings }) {
  const [state, setState] = useState('loading') // 'loading' | 'ready' | 'locked' | 'hidden'
  const [report, setReport] = useState(null)

  const idsKey = (listings || []).map(l => l.id).join(',')

  useEffect(() => {
    let alive = true
    if (!idsKey) { setState('hidden'); return undefined }
    setState('loading')
    getDashboardToken().then(async (token) => {
      if (!alive) return
      if (!token) { setState('hidden'); return }
      const results = await Promise.all((listings || []).map(l =>
        fetch(`/api/dashboard/ai-visibility?listingId=${encodeURIComponent(l.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => (r.ok ? r.json() : null))
          .then(d => (d && !d.error ? d : null))
          .catch(() => null)
      ))
      if (!alive) return
      const paidReports = results.filter(r => r && r.paid)
      const lockedCount = results.filter(r => r && r.locked).length
      if (paidReports.length > 0) {
        setReport(mergeReports(paidReports))
        setState('ready')
      } else if (lockedCount > 0) {
        setState('locked')
      } else {
        // Every fetch failed — stay quiet rather than show invented zeros.
        setState('hidden')
      }
    })
    return () => { alive = false }
  }, [idsKey])

  if (state === 'hidden' || state === 'loading') return null
  if (state === 'locked') return <LockedState />

  const { totals, bots, weekly, capped } = report
  const liveBots = bots.filter(b => b.kind === 'live')
  const crawlBots = bots.filter(b => b.kind === 'crawl')
  const trend = trendParts(totals.live_30d, totals.live_prev_30d)
  const pageNoun = (listings || []).length > 1 ? 'Your pages were' : 'Your page was'
  const hasAnyActivity = totals.all_30d + totals.all_prev_30d > 0

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem 1.5rem 1.5rem',
      marginBottom: '2rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          AI Visibility
        </h2>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
          Last 30 days
        </span>
      </div>

      {/* Headline stat */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '2.5rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          lineHeight: 1,
        }}>
          {totals.live_30d.toLocaleString('en-AU')}
        </span>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.05rem',
          color: 'var(--color-ink)',
        }}>
          {pageNoun} pulled into {totals.live_30d === 1 ? 'a live AI conversation' : `${totals.live_30d.toLocaleString('en-AU')} live AI conversations`} in the last 30 days
        </span>
      </div>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: trend ? trend.color : 'var(--color-muted)',
        margin: '0 0 1.5rem',
      }}>
        {trend ? trend.text : `plus ${totals.crawl_30d.toLocaleString('en-AU')} ${totals.crawl_30d === 1 ? 'read' : 'reads'} by AI index & training crawlers`}
        {trend ? ` · plus ${totals.crawl_30d.toLocaleString('en-AU')} ${totals.crawl_30d === 1 ? 'read' : 'reads'} by AI index & training crawlers` : ''}
        {capped ? ' · high traffic — counts are a minimum' : ''}
      </p>

      {hasAnyActivity ? (
        <>
          <Sparkline weekly={weekly} />

          {/* Bot breakdown bars */}
          {(liveBots.length > 0 || crawlBots.length > 0) && (
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <BotBars title="Live AI conversations" bots={liveBots} barColor="var(--color-sage, #5f8a7e)" />
              <BotBars title="AI index & training crawlers" bots={crawlBots} barColor="var(--color-gold, #C4973B)" />
            </div>
          )}
        </>
      ) : (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-muted)', margin: '0 0 1.5rem' }}>
          No AI assistant activity has been recorded for your page in the last 60 days yet.
          Crawlers work through the Atlas continuously — check back soon.
        </p>
      )}

      {/* Plain-English explainer + integrity note */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.85rem',
          lineHeight: 1.6,
          color: 'var(--color-muted)',
          margin: '0 0 0.6rem',
        }}>
          AI assistants like ChatGPT, Claude and Perplexity read the Atlas when answering travellers.
          A <strong style={{ color: 'var(--color-ink)', fontWeight: 600 }}>live conversation</strong> pull
          means an assistant fetched your page mid-answer — your venue was being used to respond to a
          real person&rsquo;s question. <strong style={{ color: 'var(--color-ink)', fontWeight: 600 }}>Index
          &amp; training crawlers</strong> read pages in the background to keep what these assistants know
          about the Atlas current.
        </p>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.78rem',
          lineHeight: 1.6,
          color: 'var(--color-muted)',
          margin: 0,
          fontStyle: 'italic',
        }}>
          A note on fairness: ranking and inclusion in AI answers cannot be bought — not on the Atlas,
          not anywhere. Assistants read the same public page every visitor sees. This report simply
          shows you what they&rsquo;re reading.
        </p>
      </div>
    </div>
  )
}
