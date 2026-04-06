import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CopyUrlButton from './CopyUrlButton'

export const revalidate = 3600

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59',
  corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

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
    return `${weekdayStart} ${dayStart} \u2013 ${weekdayEnd} ${dayEnd} ${monthStart} ${yearStart}`
  }

  if (yearStart === yearEnd) {
    return `${dayStart} ${monthStart} \u2013 ${dayEnd} ${monthEnd} ${yearStart}`
  }

  return `${dayStart} ${monthStart} ${yearStart} \u2013 ${dayEnd} ${monthEnd} ${yearEnd}`
}

async function getEvent(slug) {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('events')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()
    return data
  } catch {
    return null
  }
}

async function getRegionListings(regionId) {
  if (!regionId) return []
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, hero_image_url')
      .eq('region_id', regionId)
      .eq('is_active', true)
      .limit(3)
    return data || []
  } catch {
    return []
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await getEvent(slug)

  if (!event) {
    return { title: 'Event not found \u2014 Australian Atlas' }
  }

  return {
    title: `${event.name} \u2014 Australian Atlas Events`,
    description: event.description
      ? event.description.substring(0, 160)
      : `${event.name} in ${[event.suburb, event.state].filter(Boolean).join(', ')}`,
    openGraph: {
      title: event.name,
      description: event.description?.substring(0, 160) || '',
      images: event.image_url ? [{ url: event.image_url }] : [],
    },
  }
}

export default async function EventDetailPage({ params }) {
  const { slug } = await params
  const event = await getEvent(slug)

  if (!event) notFound()

  const regionListings = await getRegionListings(event.region_id)
  const verticals = Array.isArray(event.verticals) ? event.verticals : []

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero image */}
      {event.image_url && (
        <div className="rounded-2xl overflow-hidden max-h-[400px]">
          <img
            src={event.image_url}
            alt={event.name}
            className="w-full h-full object-cover max-h-[400px]"
          />
        </div>
      )}

      <div className="mt-6">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          {event.category && (
            <span className="bg-[#F1EFE8] text-[#5F5E5A] text-xs px-2.5 py-1 rounded-full">
              {event.category}
            </span>
          )}
          {verticals.map(v => (
            <span
              key={v}
              className="text-xs px-2.5 py-1 rounded-full text-white"
              style={{ backgroundColor: VERTICAL_COLORS[v] || '#888' }}
            >
              {VERTICAL_LABELS[v] || v}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="font-[family-name:var(--font-serif)] italic text-3xl sm:text-4xl font-bold text-[var(--color-ink)] leading-tight">
          {event.name}
        </h1>

        {/* Date */}
        <p className="mt-3 text-[var(--color-ink)] font-medium">
          {formatDateRange(event.start_date, event.end_date)}
        </p>

        {/* Location */}
        <p className="mt-1 text-[var(--color-muted)]">
          {[event.location_name, event.suburb, event.state].filter(Boolean).join(', ')}
        </p>
        {event.address && (
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">{event.address}</p>
        )}

        {/* Description */}
        {event.description && (
          <div className="mt-6 text-base leading-relaxed text-[var(--color-ink)] whitespace-pre-line">
            {event.description}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap gap-3">
          {event.website_url && (
            <a
              href={event.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-ink)] text-[var(--color-ink)] text-sm font-medium hover:bg-[var(--color-ink)] hover:text-white transition-colors"
            >
              Visit website
            </a>
          )}
          {event.ticket_url && (
            <a
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-ink)] text-[var(--color-ink)] text-sm font-medium hover:bg-[var(--color-ink)] hover:text-white transition-colors"
            >
              Get tickets
            </a>
          )}
        </div>

        {/* Share */}
        <div className="mt-6">
          <CopyUrlButton />
        </div>

        {/* Map / Address */}
        {event.lat && event.lng && (
          <div className="mt-8">
            <img
              src={`https://api.mapbox.com/styles/v1/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k/static/pin-s+5f8a7e(${event.lng},${event.lat})/${event.lng},${event.lat},12,0/600x300@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}`}
              alt={`Map of ${event.location_name || event.name}`}
              className="w-full rounded-xl border border-[var(--color-border)]"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Also in this region */}
      {regionListings.length > 0 && (
        <div className="mt-14 border-t border-[var(--color-border)] pt-8">
          <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold text-[var(--color-ink)] mb-5">
            Also in this region
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {regionListings.map(listing => (
              <Link
                key={listing.id}
                href={`/explore/${listing.vertical}/${listing.slug}`}
                className="group block rounded-xl overflow-hidden border border-[var(--color-border)] bg-white hover:shadow-md transition-shadow"
              >
                {listing.hero_image_url ? (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={listing.hero_image_url}
                      alt={listing.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-[#F1EFE8]" />
                )}
                <div className="p-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: VERTICAL_COLORS[listing.vertical] || '#888' }}
                  >
                    {VERTICAL_LABELS[listing.vertical] || listing.vertical}
                  </span>
                  <h3 className="mt-1.5 font-[family-name:var(--font-serif)] font-bold text-sm text-[var(--color-ink)] leading-tight">
                    {listing.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {[listing.suburb, listing.state].filter(Boolean).join(', ')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
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

