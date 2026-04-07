import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 3600

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const CATEGORIES = [
  'festival', 'market', 'workshop', 'tasting', 'exhibition',
  'pop-up', 'dinner', 'tour', 'talk', 'other',
]

const VERTICAL_OPTIONS = [
  { value: 'sba', label: 'Small Batch' },
  { value: 'collection', label: 'Culture' },
  { value: 'craft', label: 'Craft' },
  { value: 'fine_grounds', label: 'Fine Grounds' },
  { value: 'rest', label: 'Rest' },
  { value: 'field', label: 'Field' },
  { value: 'corner', label: 'Corner' },
  { value: 'found', label: 'Found' },
  { value: 'table', label: 'Table' },
]

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
    return `${dayStart}\u2013${dayEnd} ${monthStart} ${yearStart}`
  }

  if (yearStart === yearEnd) {
    return `${dayStart} ${monthStart} \u2013 ${dayEnd} ${monthEnd} ${yearStart}`
  }

  return `${dayStart} ${monthStart} ${yearStart} \u2013 ${dayEnd} ${monthEnd} ${yearEnd}`
}

export const metadata = {
  title: 'Events \u2014 Australian Atlas',
  description: 'Upcoming events across the Australian Atlas network.',
}

async function getEvents({ state, category, vertical }) {
  try {
    const sb = getSupabaseAdmin()
    const today = new Date().toISOString().split('T')[0]

    let query = sb
      .from('events')
      .select('id, name, slug, start_date, end_date, suburb, state, category, verticals, image_url')
      .eq('status', 'approved')
      .gte('end_date', today)
      .order('start_date', { ascending: true })

    if (state) query = query.eq('state', state)
    if (category) query = query.eq('category', category)
    if (vertical) query = query.contains('verticals', [vertical])

    const { data } = await query
    return data || []
  } catch {
    return []
  }
}

export default async function EventsPage({ searchParams }) {
  const params = await searchParams
  const state = params?.state || ''
  const category = params?.category || ''
  const vertical = params?.vertical || ''

  const events = await getEvents({ state, category, vertical })

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
          onChange="this.form.submit()"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)]"
        >
          <option value="">All states</option>
          {STATES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={category}
          onChange="this.form.submit()"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)] capitalize"
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>

        <select
          name="vertical"
          defaultValue={vertical}
          onChange="this.form.submit()"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)]"
        >
          <option value="">All verticals</option>
          {VERTICAL_OPTIONS.map(v => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>

        <noscript>
          <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--color-sage)] text-white text-sm font-medium">
            Filter
          </button>
        </noscript>
      </form>

      {/* Events Grid */}
      {events.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="group block rounded-xl overflow-hidden border border-[var(--color-border)] bg-white hover:shadow-md transition-shadow"
            >
              {event.image_url ? (
                <div className="aspect-[16/9] overflow-hidden">
                  <img
                    src={event.image_url}
                    alt={event.name}
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
                {event.category && (
                  <span className="inline-block bg-[#F1EFE8] text-[#5F5E5A] text-xs px-2.5 py-1 rounded-full mb-2">
                    {event.category}
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold text-[var(--color-ink)] leading-tight group-hover:text-[var(--color-sage)] transition-colors">
                  {event.name}
                </h3>
                <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                  {formatDateRange(event.start_date, event.end_date)}
                </p>
                {(event.suburb || event.state) && (
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                    {[event.suburb, event.state].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-[var(--color-muted)] text-lg">No upcoming events</p>
          <p className="mt-2 text-[var(--color-muted)] text-sm">
            Check back soon or submit your own event below.
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
