import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { listUpcomingEvents, listEventCategories } from '@/lib/events'

export const revalidate = 3600

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

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

export const metadata = {
  title: 'Events — Australian Atlas',
  description: 'Upcoming events across the Australian Atlas network.',
}

export default async function EventsPage({ searchParams }) {
  const params = await searchParams
  const state = params?.state || ''
  const category = params?.category || ''

  const sb = getSupabaseAdmin()
  const [events, categories] = await Promise.all([
    listUpcomingEvents(sb, { state, category }),
    listEventCategories(sb),
  ])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">
        Events
      </h1>
      <p className="mt-2 text-[var(--color-muted)] max-w-xl">
        Upcoming events across the Australian Atlas network
      </p>

      {/* Filters */}
      <form className="mt-8 flex flex-wrap gap-3">
        <select
          name="state"
          defaultValue={state}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)]"
        >
          <option value="">All states</option>
          {STATES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {categories.length > 0 && (
          <select
            name="category"
            defaultValue={category}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)] capitalize"
          >
            <option value="">All types</option>
            {categories.map(c => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        )}

        <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--color-sage)] text-white text-sm font-medium">
          Filter
        </button>
        {(state || category) && (
          <Link href="/events" className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-muted)] self-center">
            Clear
          </Link>
        )}
      </form>

      {/* Events Grid */}
      {events.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => {
            const venue = event.listing
            const place = [venue?.name, venue?.suburb || venue?.region, event.state].filter(Boolean).join(', ')
            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group block rounded-xl overflow-hidden border border-[var(--color-border)] bg-white hover:shadow-md transition-shadow"
              >
                {event.hero_image_url ? (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={event.hero_image_url}
                      alt={event.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-[#F1EFE8] flex items-center justify-center">
                    <span className="text-[var(--color-muted)] text-sm">No image</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {event.category && (
                      <span className="inline-block bg-[#F1EFE8] text-[#5F5E5A] text-xs px-2.5 py-1 rounded-full capitalize">
                        {event.category}
                      </span>
                    )}
                    {event.is_free && (
                      <span className="inline-block text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(122,143,107,0.16)', color: '#3a7d44' }}>
                        Free
                      </span>
                    )}
                  </div>
                  <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold text-[var(--color-ink)] leading-tight group-hover:text-[var(--color-sage)] transition-colors">
                    {event.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                    {formatDateRange(event.start_date, event.end_date)}
                  </p>
                  {place && (
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                      {place}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-[var(--color-muted)] text-lg">No upcoming events</p>
          <p className="mt-2 text-[var(--color-muted)] text-sm">
            {(state || category) ? 'Try clearing your filters.' : 'Check back soon for events across the network.'}
          </p>
        </div>
      )}

      {/* Submit CTA */}
      <div className="mt-12 text-center">
        <Link
          href="/events/submit"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-sage)] text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Submit an event
        </Link>
      </div>
    </div>
  )
}
