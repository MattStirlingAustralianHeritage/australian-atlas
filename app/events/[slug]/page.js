import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublishedEventBySlug } from '@/lib/events'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { TypographicCard } from '@/components/ListingCard'
import { eventHeroPalette } from '@/lib/events-palette'
import ListingMap from '@/components/ListingMap'
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
  const t = await getTranslations('discovery2')
  const sb = getSupabaseAdmin()
  const event = await getPublishedEventBySlug(sb, slug)

  if (!event) notFound()

  const venue = event.listing
  const place = [venue?.suburb || venue?.region, event.state].filter(Boolean).join(', ')
  const palette = eventHeroPalette(event.category, event.category_key)
  const brandColour = getVerticalBrandColour(venue?.vertical) || '#5F8A7E'
  // Map only when the host listing genuinely has coordinates — never fabricated.
  const hasCoords = !!venue && venue.lat != null && venue.lng != null

  return (
    <div>
      {/* ── Hero band (full-width) ─────────────────────────── */}
      {/* Same typographic treatment as the rest of the network: category ground
          + serif title (roman) + category eyebrow. An operator/host image, when
          present, takes the band instead with the same eyebrow + title overlay. */}
      {event.hero_image_url ? (
        <div className="atlas-hero-band w-full relative overflow-hidden">
          <img
            src={event.hero_image_url}
            alt={event.title}
            loading="eager"
            className="w-full h-full object-cover absolute inset-0"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,26,23,0.7) 0%, rgba(28,26,23,0.2) 45%, transparent 75%)' }} />
          <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-12" style={{ zIndex: 2 }}>
            <div className="max-w-5xl mx-auto">
              {event.category && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.7)', marginBottom: '12px',
                }}>
                  {event.category}
                </p>
              )}
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'normal',
                fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.06,
                color: '#fff', margin: 0,
              }}>
                {event.title}
              </h1>
            </div>
          </div>
        </div>
      ) : (
        <TypographicCard
          name={event.title}
          size="hero"
          align="poster"
          eyebrow={event.category || null}
          ground={palette.ground}
          textColor={palette.text}
        />
      )}

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="lg:grid lg:grid-cols-3 lg:gap-12">
          {/* Left: copy + CTAs */}
          <div className="lg:col-span-2">
            {/* Date */}
            <p className="text-lg text-[var(--color-ink)] font-medium">
              {formatDateRange(event.start_date, event.end_date)}
            </p>

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
                  {t('getTickets')}
                </a>
              )}
              {venue && (
                <Link
                  href={`/place/${venue.slug}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-ink)] text-[var(--color-ink)] text-sm font-medium hover:bg-[var(--color-ink)] hover:text-white transition-colors"
                >
                  {t('visitVenue')}
                </Link>
              )}
              <CopyUrlButton />
            </div>
          </div>

          {/* Right rail: Hosted by + venue/region + map */}
          {venue && (
            <aside className="mt-12 lg:mt-0 lg:col-span-1">
              <h2 className="font-[family-name:var(--font-serif)] text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3">
                {t('hostedBy')}
              </h2>
              <Link
                href={`/place/${venue.slug}`}
                className="group block rounded-xl border border-[var(--color-border)] bg-white p-4 hover:shadow-md transition-shadow"
              >
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: brandColour }}
                >
                  {getVerticalBadge(venue.vertical)}
                </span>
                <h3 className="mt-2 font-[family-name:var(--font-serif)] font-bold text-base text-[var(--color-ink)] leading-tight group-hover:text-[var(--color-sage)] transition-colors">
                  {venue.name}
                </h3>
                {place && (
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                    {place}
                  </p>
                )}
              </Link>

              {/* Venue map — only when the host listing has coordinates */}
              {hasCoords && (
                <div className="mt-4">
                  <div
                    className="rounded-xl overflow-hidden border border-[var(--color-border)]"
                    style={{ height: 240 }}
                  >
                    <ListingMap lat={venue.lat} lng={venue.lng} name={venue.name} color={brandColour} />
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Back link */}
        <div className="mt-12">
          <Link
            href="/events"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            &larr; {t('allEvents')}
          </Link>
        </div>
      </div>
    </div>
  )
}
