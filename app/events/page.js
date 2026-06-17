import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { listUpcomingEvents, listEventCategories } from '@/lib/events'
import EventCard, { EventListRow } from '@/components/EventCard'

export const revalidate = 3600

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// The filter bar is pure overhead until the network carries enough events to
// warrant narrowing. Show it once there are more than this many results (or
// whenever a filter is already active, so it can be cleared).
const FILTER_THRESHOLD = 8
// At or below this many events the multi-column grid reads as empty, so we
// switch to a single centred feature column.
const LOW_COUNT = 3

const EVENTS_DESCRIPTION = 'Upcoming festivals, markets, dinners, tours, exhibitions and workshops across the Australian Atlas network.'

export const metadata = {
  title: 'Events — Australian Atlas',
  description: EVENTS_DESCRIPTION,
  openGraph: {
    title: 'Events — Australian Atlas',
    description: EVENTS_DESCRIPTION,
    url: 'https://australianatlas.com.au/events',
  },
  twitter: {
    card: 'summary',
    title: 'Events — Australian Atlas',
    description: EVENTS_DESCRIPTION,
  },
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

  const total = events.length
  const showFilters = total > FILTER_THRESHOLD || !!(state || category)
  const isLowCount = total > 0 && total <= LOW_COUNT

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl font-bold">
        Events
      </h1>
      <p className="mt-2 text-[var(--color-muted)] max-w-xl">
        Upcoming events across the Australian Atlas network
      </p>

      {/* Filters — only once there are enough events to justify them */}
      {showFilters && (
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
      )}

      {/* Events */}
      {total === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-[var(--color-muted)] text-lg">No upcoming events</p>
          <p className="mt-2 text-[var(--color-muted)] text-sm">
            {(state || category) ? 'Try clearing your filters.' : 'Check back soon for events across the network.'}
          </p>
        </div>
      ) : isLowCount ? (
        // Low count: a single centred feature column, with a short list below
        // for the second and third events. Never reads as an empty grid.
        <div className="mt-10 max-w-xl mx-auto">
          <EventCard event={events[0]} feature />
          {events.length > 1 && (
            <div className="mt-6 border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {events.slice(1).map(event => (
                <EventListRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
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
