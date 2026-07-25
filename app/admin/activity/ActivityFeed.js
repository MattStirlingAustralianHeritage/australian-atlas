'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Operator activity feed.
//
// One question: what are people doing with their listings? Photos added, hours
// fixed, descriptions written, picks made — newest first, grouped by day, with
// the actual images inline so a hero swap is a thing you SEE, not a row you read.
// ─────────────────────────────────────────────────────────────────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

// Keep in sync with actionGroup() in lib/activity/logListingActivity.js.
const GROUPS = [
  ['', 'Everything'],
  ['media', 'Photos & video'],
  ['facts', 'The facts'],
  ['words', 'Words'],
  ['curation', 'Picks & events'],
  ['trade', 'Trade'],
  ['lifecycle', 'Claims'],
  ['admin', 'Admin edits'],
]

const TIMEFRAMES = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
]

const GROUP_COLOR = {
  media: '#C4603A',
  facts: '#3F7A6B',
  words: '#6B5CA5',
  curation: '#B8862B',
  trade: '#4A6FA5',
  lifecycle: '#2D7D4F',
  admin: '#6B6760',
  other: '#6B6760',
}

const ink = 'var(--color-ink, #2D2A26)'
const muted = 'var(--color-muted, #6B6760)'
const border = 'var(--color-border, rgba(28,26,23,0.12))'
const body = 'var(--font-body, system-ui)'

function timeAgo(iso) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yday = new Date(Date.now() - 86400000)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yday)) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** The images an event is about, so a photo change is visible at a glance. */
function eventImages(e) {
  const d = e.details || {}
  if (Array.isArray(d.urls) && d.urls.length) return d.urls.slice(0, 6)
  if (d.to) return [d.to]
  if (d.from && e.action === 'hero_image_removed') return [d.from]
  return []
}

function Stat({ value, label, accent }) {
  return (
    <div style={{
      flex: '1 1 140px',
      padding: '0.9rem 1rem',
      background: '#fff',
      border: `1px solid ${border}`,
      borderRadius: 12,
    }}>
      <div style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '1.6rem',
        lineHeight: 1.1,
        color: accent || ink,
      }}>
        {value}
      </div>
      <div style={{ fontFamily: body, fontSize: '0.7rem', color: muted, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.35rem 0.75rem',
        borderRadius: 999,
        border: `1px solid ${active ? (color || ink) : border}`,
        background: active ? (color || ink) : '#fff',
        color: active ? '#fff' : ink,
        fontFamily: body,
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function ActivityRow({ e }) {
  const [open, setOpen] = useState(false)
  const images = eventImages(e)
  const color = GROUP_COLOR[e.group] || GROUP_COLOR.other
  const held = e.details?.blocked || Number(e.details?.held) > 0
  const hasDetails = e.details && Object.keys(e.details).length > 0

  return (
    <div style={{
      display: 'flex',
      gap: '0.9rem',
      padding: '0.9rem 0',
      borderBottom: `1px solid ${border}`,
    }}>
      {/* Group dot */}
      <div style={{ paddingTop: 6 }}>
        <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: color }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontFamily: body, fontSize: '0.85rem', color: ink, fontWeight: 500 }}>
            {e.actor_role === 'admin' ? 'Admin' : (e.actor_email || 'An operator')}
          </span>
          <span style={{ fontFamily: body, fontSize: '0.85rem', color: ink }}>
            {e.summary}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: 4 }}>
          {e.listing_slug ? (
            <a
              href={`/place/${e.listing_slug}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: body, fontSize: '0.75rem', color, textDecoration: 'none', fontWeight: 500 }}
            >
              {e.listing_name || 'Listing'} ↗
            </a>
          ) : (
            <span style={{ fontFamily: body, fontSize: '0.75rem', color: muted }}>
              {e.listing_name || 'Deleted listing'}
            </span>
          )}
          {e.vertical && (
            <span style={{ fontFamily: body, fontSize: '0.68rem', color: muted }}>
              {VERTICAL_NAMES[e.vertical] || e.vertical}
            </span>
          )}
          <span style={{ fontFamily: body, fontSize: '0.68rem', color: muted }} title={new Date(e.created_at).toLocaleString('en-AU')}>
            {timeAgo(e.created_at)}
          </span>
          {held && (
            <span style={{
              fontFamily: body, fontSize: '0.63rem', fontWeight: 600, color: '#B3261E',
              background: 'rgba(179,38,30,0.08)', border: '1px solid rgba(179,38,30,0.25)',
              borderRadius: 4, padding: '0.1rem 0.35rem',
            }}>
              HELD BY MODERATION
            </span>
          )}
          {e.source === 'derived' && (
            <span style={{ fontFamily: body, fontSize: '0.63rem', color: muted, opacity: 0.7 }} title="Reconstructed from existing records — predates the activity log">
              reconstructed
            </span>
          )}
          {hasDetails && (
            <button
              onClick={() => setOpen(o => !o)}
              style={{
                fontFamily: body, fontSize: '0.68rem', color: muted, background: 'none',
                border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}
            >
              {open ? 'hide' : 'details'}
            </button>
          )}
        </div>

        {images.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            {images.map(url => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{
                    width: 76, height: 76, objectFit: 'cover', borderRadius: 8,
                    border: `1px solid ${border}`, display: 'block',
                    filter: held ? 'grayscale(1) brightness(0.85)' : 'none',
                  }}
                />
              </a>
            ))}
          </div>
        )}

        {open && (
          <pre style={{
            marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'rgba(28,26,23,0.03)',
            border: `1px solid ${border}`, borderRadius: 8, fontSize: '0.7rem',
            color: muted, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {JSON.stringify(e.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function ActivityFeed() {
  const [days, setDays] = useState(30)
  const [group, setGroup] = useState('')
  const [role, setRole] = useState('operator')
  const [vertical, setVertical] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [logMissing, setLogMissing] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async (pageToLoad) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: String(days), page: String(pageToLoad), limit: '50' })
      if (group) params.set('group', group)
      if (role) params.set('role', role)
      if (vertical) params.set('vertical', vertical)
      if (debouncedQ) params.set('q', debouncedQ)

      const res = await fetch(`/api/admin/activity?${params}`)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()

      setEvents(prev => (pageToLoad === 0 ? data.events : [...prev, ...data.events]))
      setStats(data.stats)
      setTotal(data.total)
      setLogMissing(!!data.logTableMissing)
      setPage(pageToLoad)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days, group, role, vertical, debouncedQ])

  // Any filter change resets to the first page.
  useEffect(() => { load(0) }, [load])

  // Group the feed by day so the shape of a week is legible at a glance.
  const byDay = useMemo(() => {
    const out = []
    let current = null
    for (const e of events) {
      const label = dayLabel(e.created_at)
      if (!current || current.label !== label) {
        current = { label, rows: [] }
        out.push(current)
      }
      current.rows.push(e)
    }
    return out
  }, [events])

  return (
    <div>
      {/* ── Headline numbers (always last 7 days) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <Stat value={stats?.events_7d ?? '—'} label="Things done this week" />
        <Stat value={stats?.operators_7d ?? '—'} label="Operators active" accent="#3F7A6B" />
        <Stat value={stats?.listings_7d ?? '—'} label="Listings touched" />
        <Stat value={stats?.photos_7d ?? '—'} label="Photos added" accent="#C4603A" />
        <Stat value={stats?.held_7d ?? '—'} label="Held by moderation" accent={stats?.held_7d ? '#B3261E' : undefined} />
      </div>

      {logMissing && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 10,
          background: 'rgba(184,134,43,0.08)', border: '1px solid rgba(184,134,43,0.3)',
          fontFamily: body, fontSize: '0.78rem', color: ink,
        }}>
          The activity log table isn’t there yet — run <code>supabase/migrations/260_listing_activity.sql</code>.
          Until then this feed is reconstructed from claims, description drafts, venue facts and events, so it
          shows the milestones but not the field-level edits.
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {GROUPS.map(([key, label]) => (
          <Chip key={key} active={group === key} onClick={() => setGroup(key)} color={GROUP_COLOR[key]}>
            {label}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: `1px solid ${border}`, fontFamily: body, fontSize: '0.78rem', background: '#fff', color: ink }}
        >
          <option value="operator">Operators only</option>
          <option value="admin">Admin only</option>
          <option value="">Everyone</option>
        </select>

        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: `1px solid ${border}`, fontFamily: body, fontSize: '0.78rem', background: '#fff', color: ink }}
        >
          {TIMEFRAMES.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
        </select>

        <select
          value={vertical}
          onChange={e => setVertical(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: `1px solid ${border}`, fontFamily: body, fontSize: '0.78rem', background: '#fff', color: ink }}
        >
          <option value="">All verticals</option>
          {Object.entries(VERTICAL_NAMES).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search venue or operator…"
          style={{
            flex: '1 1 200px', minWidth: 160, padding: '0.4rem 0.6rem', borderRadius: 8,
            border: `1px solid ${border}`, fontFamily: body, fontSize: '0.78rem', background: '#fff', color: ink,
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(179,38,30,0.06)', border: '1px solid rgba(179,38,30,0.25)', fontFamily: body, fontSize: '0.8rem', color: '#B3261E', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* ── Feed ── */}
      <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '0.25rem 1.25rem 1rem' }}>
        {byDay.length === 0 && !loading && (
          <div style={{ padding: '2.5rem 0', textAlign: 'center', fontFamily: body, fontSize: '0.85rem', color: muted }}>
            Nothing here for these filters. Try a longer timeframe, or “Everyone”.
          </div>
        )}

        {byDay.map(day => (
          <div key={day.label}>
            <div style={{
              position: 'sticky', top: 0, background: '#fff', paddingTop: '1rem', paddingBottom: '0.4rem',
              fontFamily: body, fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: muted,
            }}>
              {day.label}
            </div>
            {day.rows.map(e => <ActivityRow key={`${e.source}:${e.id}`} e={e} />)}
          </div>
        ))}

        {loading && (
          <div style={{ padding: '1.25rem 0', textAlign: 'center', fontFamily: body, fontSize: '0.8rem', color: muted }}>
            Loading…
          </div>
        )}

        {!loading && events.length < total && (
          <div style={{ textAlign: 'center', paddingTop: '1rem' }}>
            <button
              onClick={() => load(page + 1)}
              style={{
                padding: '0.5rem 1.1rem', borderRadius: 8, border: `1px solid ${border}`,
                background: '#fff', fontFamily: body, fontSize: '0.78rem', color: ink, cursor: 'pointer',
              }}
            >
              Load more ({total - events.length} left)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
