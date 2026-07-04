import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
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
const EVENTS_DESCRIPTION_KO = '오스트레일리안 아틀라스 네트워크 전역의 다가오는 축제, 마켓, 디너, 투어, 전시, 워크숍.'
const EVENTS_DESCRIPTION_ZH = 'Australian Atlas 网络各地即将举办的节庆、市集、晚宴、导览、展览与工作坊。'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = { en: 'Events — Australian Atlas', ko: '이벤트 — Australian Atlas', zh: '活动 — Australian Atlas' }[locale] || 'Events — Australian Atlas'
  const description = { en: EVENTS_DESCRIPTION, ko: EVENTS_DESCRIPTION_KO, zh: EVENTS_DESCRIPTION_ZH }[locale] || EVENTS_DESCRIPTION
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: 'https://australianatlas.com.au/events',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function EventsPage({ searchParams }) {
  const t = await getTranslations('discovery2')
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
      <div className="page-masthead max-w-2xl">
        <p className="section-dateline">{t('eventsKicker')}</p>
        <h1 className="masthead-title">{t('eventsTitle')}</h1>
        <p className="masthead-sub">
          {t('eventsSubtitle')}
        </p>
      </div>

      {/* Filters — only once there are enough events to justify them */}
      {showFilters && (
        <form className="mt-2 flex flex-wrap gap-3">
          <select
            name="state"
            defaultValue={state}
            className="atlas-select px-3 py-2 border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)]"
          >
            <option value="">{t('allStates')}</option>
            {STATES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {categories.length > 0 && (
            <select
              name="category"
              defaultValue={category}
              className="atlas-select px-3 py-2 border border-[var(--color-border)] bg-white text-sm text-[var(--color-ink)] font-[family-name:var(--font-sans)] capitalize"
            >
              <option value="">{t('allTypes')}</option>
              {categories.map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          )}

          <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--color-sage)] text-white text-sm font-medium">
            {t('filter')}
          </button>
          {(state || category) && (
            <Link href="/events" className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-muted)] self-center">
              {t('clear')}
            </Link>
          )}
        </form>
      )}

      {/* Events */}
      {total === 0 ? (
        <div
          className="mt-12 text-center mx-auto"
          style={{
            maxWidth: '440px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', padding: '48px 32px', background: '#fff',
          }}
        >
          <p style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic',
            fontSize: '20px', color: 'var(--color-ink)', marginBottom: '10px',
          }}>
            {t('emptyTitle')}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px',
            lineHeight: 1.6, color: 'var(--color-muted)',
          }}>
            {(state || category)
              ? t('emptyFiltered')
              : t('emptyBody')}
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
          {t('submitEvent')}
        </Link>
      </div>
    </div>
  )
}
