import Link from 'next/link'
import { TypographicCard } from '@/components/ListingCard'
import { eventHeroPalette } from '@/lib/events-palette'

// ============================================================
// EventCard — the events-index card. Reuses the network's
// <TypographicCard> poster treatment for the hero (no bespoke
// placeholder), with the title + category living in the hero and
// date + venue + region in the panel below.
// ============================================================

function formatDateRange(startDate, endDate) {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  const dayStart = start.getDate()
  const monthStart = start.toLocaleDateString('en-AU', { month: 'short' })
  const yearStart = start.getFullYear()

  if (!end || start.toDateString() === end.toDateString()) {
    return `${dayStart} ${monthStart} ${yearStart}`
  }

  const dayEnd = end.getDate()
  const monthEnd = end.toLocaleDateString('en-AU', { month: 'short' })
  const yearEnd = end.getFullYear()

  if (monthStart === monthEnd && yearStart === yearEnd) {
    return `${dayStart}–${dayEnd} ${monthStart} ${yearStart}`
  }
  if (yearStart === yearEnd) {
    return `${dayStart} ${monthStart} – ${dayEnd} ${monthEnd} ${yearStart}`
  }
  return `${dayStart} ${monthStart} ${yearStart} – ${dayEnd} ${monthEnd} ${yearEnd}`
}

function eventPlace(event) {
  const venue = event.listing
  return [venue?.name, venue?.suburb || venue?.region, event.state].filter(Boolean).join(', ')
}

function FreePill() {
  return (
    <span style={{
      position: 'absolute', top: 12, right: 12, zIndex: 3,
      fontSize: '10px', fontWeight: 600, padding: '4px 10px',
      borderRadius: 100, color: '#2f5d3a',
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
      letterSpacing: '0.02em',
    }}>
      Free
    </span>
  )
}

export default function EventCard({ event, feature = false }) {
  const place = eventPlace(event)
  const aspectRatio = feature ? '3/2' : '16/9'
  const hasImage = !!event.hero_image_url
  const palette = eventHeroPalette(event.category, event.category_key)

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group listing-card block overflow-hidden"
      style={{ borderRadius: 'var(--radius-card)', border: '0.5px solid var(--color-border)', position: 'relative' }}
    >
      <div style={{ position: 'relative' }}>
        {hasImage ? (
          <div style={{ position: 'relative', aspectRatio, overflow: 'hidden' }}>
            <img
              src={event.hero_image_url}
              alt={event.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 38%, rgba(0,0,0,0.7) 100%)',
              pointerEvents: 'none',
            }} />
            {event.category && (
              <p style={{
                position: 'absolute', top: 14, left: 14, zIndex: 2,
                fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)', margin: 0,
              }}>
                {event.category}
              </p>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1.25rem', zIndex: 2 }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'normal',
                fontSize: feature ? 'clamp(1.6rem, 3.5vw, 2.2rem)' : '20px',
                lineHeight: 1.15, color: '#fff', margin: 0,
              }}>
                {event.title}
              </p>
            </div>
          </div>
        ) : (
          <TypographicCard
            name={event.title}
            category={event.category}
            eyebrow={event.category || null}
            align="poster"
            aspectRatio={aspectRatio}
            ground={palette.ground}
            textColor={palette.text}
          />
        )}
        {event.is_free && <FreePill />}
      </div>

      {/* Info panel — date + venue + region only */}
      <div className="p-4">
        <p className={`font-medium text-[var(--color-ink)] ${feature ? 'text-base' : 'text-sm'}`}>
          {formatDateRange(event.start_date, event.end_date)}
        </p>
        {place && (
          <p className={`mt-0.5 text-[var(--color-muted)] ${feature ? 'text-base' : 'text-sm'}`}>
            {place}
          </p>
        )}
      </div>
    </Link>
  )
}

// Compact row for the low-count single-column list beneath the feature card.
export function EventListRow({ event }) {
  const place = eventPlace(event)
  const palette = eventHeroPalette(event.category, event.category_key)

  return (
    <Link href={`/events/${event.slug}`} className="group flex items-center gap-4 py-4">
      <div
        style={{ background: palette.ground, borderRadius: '10px' }}
        className="h-12 w-12 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className="font-[family-name:var(--font-serif)] text-[var(--color-ink)] leading-tight group-hover:text-[var(--color-sage)] transition-colors truncate"
          style={{ fontSize: '17px' }}
        >
          {event.title}
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-muted)] truncate">
          {[formatDateRange(event.start_date, event.end_date), place].filter(Boolean).join('  ·  ')}
        </p>
      </div>
    </Link>
  )
}
