import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublishedEventBySlug } from '@/lib/events'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import CopyUrlButton from './CopyUrlButton'

export const revalidate = 3600

function formatDateRange(startDate, endDate) {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  const dayStart = start.getDate()
  const monthStart = start.toLocaleDateString('en-AU', { month: 'long' })
  const yearStart = start.getFullYear()
  const weekdayStart = start.toLocaleDateString('en-AU', { weekday: 'long' })

  if (!end || start.toDateString() === end.toDateString()) {
    return `${weekdayStart}, ${dayStart} ${monthStart} ${yearStart}`
  }

  const dayEnd = end.getDate()
  const monthEnd = end.toLocaleDateString('en-AU', { month: 'long' })
  const yearEnd = end.getFullYear()
  const weekdayEnd = end.toLocaleDateString('en-AU', { weekday: 'long' })

  if (monthStart === monthEnd && yearStart === yearEnd) {
    return `${weekdayStart} ${dayStart} – ${weekdayEnd} ${dayEnd} ${monthStart} ${yearStart}`
  }

  if (yearStart === yearEnd) {
    return `${dayStart} ${monthStart} – ${dayEnd} ${monthEnd} ${yearStart}`
  }

  return `${dayStart} ${monthStart} ${yearStart} – ${dayEnd} ${monthEnd} ${yearEnd}`
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()
  const event = await getPublishedEventBySlug(sb, slug)

  if (!event) {
    return { title: 'Event not found — Australian Atlas' }
  }

  const venue = event.listing
  const place = [venue?.suburb || venue?.region, event.state].filter(Boolean).join(', ')
  const description = event.description
    ? event.description.substring(0, 160)
    : `${event.title}${place ? ` in ${place}` : ''}`
  return {
    title: `${event.title} — Australian Atlas Events`,
    description,
    openGraph: {
      title: event.title,
      description,
      url: `https://australianatlas.com.au/events/${slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
      images: event.hero_image_url ? [{ url: event.hero_image_url, width: 1200, height: 630 }] : [],
    },
    alternates: {
      canonical: `https://australianatlas.com.au/events/${slug}`,
    },
  }
}

export default async function EventDetailPage({ params }) {
  const { slug } = await params
  const sb = getSupabaseAdmin()
  const event = await getPublishedEventBySlug(sb, slug)

  if (!event) notFound()

  const venue = event.listing
  const place = [venue?.suburb || venue?.region, event.state].filter(Boolean).join(', ')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero image */}
      {event.hero_image_url && (
        <div className="rounded-2xl overflow-hidden max-h-[400px]">
          <img
            src={event.hero_image_url}
            alt={event.title}
            className="w-full h-full object-cover max-h-[400px]"
          />
        </div>
      )}

      <div className="mt-6">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          {event.category && (
            <span className="bg-[#F1EFE8] text-[#5F5E5A] text-xs px-2.5 py-1 rounded-full capitalize">
              {event.category}
            </span>
          )}
          {event.is_free && (
            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(122,143,107,0.16)', color: '#3a7d44' }}>
              Free
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="font-[family-name:var(--font-serif)] italic text-3xl sm:text-4xl font-bold text-[var(--color-ink)] leading-tight">
          {event.title}
        </h1>

        {/* Date */}
        <p className="mt-3 text-[var(--color-ink)] font-medium">
          {formatDateRange(event.start_date, event.end_date)}
        </p>

        {/* Location / venue */}
        {(venue?.name || place) && (
          <p className="mt-1 text-[var(--color-muted)]">
            {[venue?.name, place].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Description */}
        {event.description && (
          <div className="mt-6 text-base leading-relaxed text-[var(--color-ink)] whitespace-pre-line">
            {event.description}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap gap-3">
          {event.ticket_url && (
            <a
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-sage)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Get tickets
            </a>
          )}
          {venue && (
            <Link
              href={`/place/${venue.slug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-ink)] text-[var(--color-ink)] text-sm font-medium hover:bg-[var(--color-ink)] hover:text-white transition-colors"
            >
              Visit venue
            </Link>
          )}
        </div>

        {/* Share */}
        <div className="mt-6">
          <CopyUrlButton />
        </div>
      </div>

      {/* Hosted by */}
      {venue && (
        <div className="mt-14 border-t border-[var(--color-border)] pt-8">
          <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-[var(--color-ink)] mb-5">
            Hosted by
          </h2>
          <Link
            href={`/place/${venue.slug}`}
            className="group inline-flex flex-col rounded-xl border border-[var(--color-border)] bg-white p-4 hover:shadow-md transition-shadow"
          >
            <span
              className="self-start text-xs px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: getVerticalBrandColour(venue.vertical) || '#888' }}
            >
              {getVerticalBadge(venue.vertical)}
            </span>
            <h3 className="mt-1.5 font-[family-name:var(--font-serif)] font-bold text-base text-[var(--color-ink)] leading-tight group-hover:text-[var(--color-sage)] transition-colors">
              {venue.name}
            </h3>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {[venue.suburb || venue.region, venue.state].filter(Boolean).join(', ')}
            </p>
          </Link>
        </div>
      )}

      {/* Back link */}
      <div className="mt-10">
        <Link
          href="/events"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          &larr; All events
        </Link>
      </div>
    </div>
  )
}
