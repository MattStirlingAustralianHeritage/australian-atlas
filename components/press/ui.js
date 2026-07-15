'use client'

// Press (Newsroom) UI helpers — thin layer over the council design-system
// primitives so newsroom pages stay tidy. Everything visual reuses the
// existing tokens; nothing here declares a new colour.

import Link from 'next/link'
import { getVerticalLabel } from '@/lib/verticalUrl'

export {
  Card, PageHeader, SectionTitle, StatCard, EmptyState, Pill, Button,
  Skeleton, SkeletonPage, regionMapImage,
} from '@/components/council/ui'

export function fmtDate(ymdOrIso) {
  if (!ymdOrIso) return ''
  const d = new Date(ymdOrIso.length === 10 ? `${ymdOrIso}T00:00:00Z` : ymdOrIso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function fmtDateRange(start, end) {
  if (!end || end === start) return fmtDate(start)
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

export function verticalName(key) {
  return getVerticalLabel(key) || key || ''
}

// Uppercase micro-label (the eyebrow style used across the dashboards).
export function MicroLabel({ children, color = 'var(--color-sage)' }) {
  return (
    <p style={{
      fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color, margin: '0 0 6px',
    }}>
      {children}
    </p>
  )
}

const SIGNAL_LABELS = {
  new_cluster: 'New places',
  milestone: 'Milestone',
  first_of_kind: 'First of its kind',
  events_cluster: "What's on",
  anniversary: 'Anniversary',
  heritage: 'Heritage',
}

// A story-signal card: a rule-computed angle with the numbers behind it.
export function SignalCard({ signal }) {
  return (
    <div style={{
      background: 'var(--color-card-bg)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: '1rem 1.15rem',
    }}>
      <MicroLabel color="var(--color-gold)">{SIGNAL_LABELS[signal.kind] || 'Signal'}{signal.regionName ? ` · ${signal.regionName}` : ''}</MicroLabel>
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: '1.02rem', fontWeight: 450,
        color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 0.35rem',
      }}>
        {signal.headline}
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>
        {signal.detail}
      </p>
      {signal.items?.length > 0 && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
          {signal.items.map((it, i) => (
            <span key={it.slug || i}>
              {i > 0 && <span style={{ color: 'var(--color-muted)' }}> · </span>}
              <Link href={it.isEvent ? `/events/${it.slug}` : `/place/${it.slug}`} target="_blank" style={{ color: 'var(--color-sage-dark)', textDecoration: 'none' }}>
                {it.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

// One event row — used on the newsdesk and the events page.
export function EventRow({ event, regionName }) {
  const where = [event.location_name, event.suburb].filter(Boolean).join(', ')
  return (
    <div style={{
      display: 'flex', gap: '0.9rem', alignItems: 'baseline',
      padding: '0.7rem 0', borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ minWidth: 108, flexShrink: 0 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-sage-dark)', margin: 0 }}>
          {fmtDateRange(event.start_date, event.end_date)}
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 550, color: 'var(--color-ink)', margin: '0 0 2px' }}>
          <Link href={`/events/${event.slug}`} target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>
            {event.name}
          </Link>
          {event.is_free && (
            <span style={{
              marginLeft: 8, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--color-sage-dark)',
              border: '1px solid rgba(95,138,126,0.35)',
              borderRadius: 999, padding: '0.1rem 0.45rem', verticalAlign: 'middle',
            }}>
              Free
            </span>
          )}
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
          {where}{regionName ? ` · ${regionName}` : ''}{(event.category_label || event.category) ? ` · ${event.category_label || event.category}` : ''}
        </p>
      </div>
      <a
        href={`/api/press/ics?event=${encodeURIComponent(event.slug)}`}
        title="Add to calendar (.ics)"
        style={{
          fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
          color: 'var(--color-muted)', textDecoration: 'none', flexShrink: 0,
          border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.2rem 0.6rem',
        }}
      >
        + Cal
      </a>
    </div>
  )
}

// A recently-added place row.
export function AdditionRow({ listing, regionName }) {
  return (
    <div style={{
      display: 'flex', gap: '0.9rem', alignItems: 'baseline',
      padding: '0.6rem 0', borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ minWidth: 108, flexShrink: 0 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
          {fmtDate(listing.created_at)}
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 550, color: 'var(--color-ink)', margin: '0 0 2px' }}>
          <Link href={`/place/${listing.slug}`} target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>
            {listing.name}
          </Link>
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
          {verticalName(listing.vertical)}{listing.sub_type ? ` · ${listing.sub_type}` : ''}{listing.suburb ? ` · ${listing.suburb}` : ''}{regionName ? ` · ${regionName}` : ''}
        </p>
      </div>
    </div>
  )
}

const LEAD_LABELS = {
  story_lead: 'Story lead',
  release: 'Release',
  data_note: 'Data note',
  milestone: 'Milestone',
}

export function leadTypeLabel(type) {
  return LEAD_LABELS[type] || 'Story lead'
}

export function EmbargoBadge({ until }) {
  if (!until || new Date(until) <= new Date()) return null
  return (
    <span style={{
      marginLeft: 8, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--color-accent)',
      border: '1px solid rgba(196,96,58,0.4)',
      borderRadius: 999, padding: '0.12rem 0.5rem', verticalAlign: 'middle',
    }}>
      Embargo · {fmtDate(until)}
    </span>
  )
}
