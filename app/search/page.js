'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ListingCard from '@/components/ListingCard'

import { VERTICAL_STYLES } from '@/components/VerticalBadge'

/**
 * Heuristic intent classifier: does the query look like an itinerary request?
 * Returns true if the query matches itinerary-like patterns.
 */
function isItineraryIntent(query) {
  if (!query || query.trim().length < 5) return false
  const q = query.toLowerCase().trim()

  // Multi-word phrases (check first, most specific)
  const phrases = [
    'day trip', 'road trip', 'weekend away', 'weekend in', 'weekend trip',
    'long weekend', '2 nights', '3 nights', '2 days', '3 days', '4 days', '5 days',
    'build me', 'build a', 'plan a', 'plan my', 'plan me', 'build a trail', 'create a trail',
    'overnight in', 'overnight trip', 'nights in', 'days in',
  ]
  for (const p of phrases) {
    if (q.includes(p)) return true
  }

  // Single keywords that strongly signal itinerary intent
  const keywords = [
    'itinerary', 'trail', 'route', 'overnight', 'tour',
  ]
  for (const kw of keywords) {
    if (q.includes(kw)) return true
  }

  // Pattern: number + duration word (e.g. "2 night", "3 day")
  if (/\d+\s*(night|day|nights|days)/.test(q)) return true

  // Pattern: word numbers + duration (e.g. "three day", "two nights")
  if (/\b(one|two|three|four|five|six|seven)\s*(night|day|nights|days)\b/.test(q)) return true

  return false
}

// Use VerticalBadge text colors for pill accents
const VERTICAL_ACCENT = Object.fromEntries(
  Object.entries(VERTICAL_STYLES || {}).map(([k, v]) => [k, v.text])
)

const VERTICALS = [
  { key: '', label: 'All', atlas: '' },
  { key: 'sba', label: 'Small Batch', atlas: 'Drink' },
  { key: 'craft', label: 'Craft', atlas: 'Makers' },
  { key: 'collection', label: 'Culture', atlas: 'Culture' },
  { key: 'fine_grounds', label: 'Fine Grounds', atlas: 'Coffee' },
  { key: 'rest', label: 'Rest', atlas: 'Stay' },
  { key: 'field', label: 'Field', atlas: 'Nature' },
  { key: 'corner', label: 'Corner', atlas: 'Shop' },
  { key: 'found', label: 'Found', atlas: 'Vintage' },
  { key: 'table', label: 'Table', atlas: 'Food' },
]

const VERTICAL_LABEL_MAP = Object.fromEntries(VERTICALS.filter(v => v.key).map(v => [v.key, v.label]))

const STATES = ['', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

function SkeletonCard() {
  return (
    <div className="bg-[var(--color-card-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] animate-pulse">
      <div className="aspect-[16/10] bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-50 rounded w-1/2" />
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-50 rounded w-full" />
          <div className="h-3 bg-gray-50 rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

function SearchPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [vertical, setVertical] = useState(searchParams.get('vertical') || '')
  const [state, setState] = useState(searchParams.get('state') || '')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)

  // Sync URL when filters change (debounced alongside search)
  const updateUrl = useCallback((q, v, s) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (v) params.set('vertical', v)
    if (s) params.set('state', s)
    const qs = params.toString()
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false })
  }, [router])

  const search = useCallback(async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (vertical) params.set('vertical', vertical)
    if (state) params.set('state', state)
    params.set('page', p.toString())
    params.set('limit', '24')

    try {
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.listings || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
      setTotalPages(data.totalPages || 0)
    } catch (e) {
      console.error('Search error:', e)
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [query, vertical, state])

  // Check for itinerary intent on initial load (from homepage submission)
  useEffect(() => {
    const initialQ = searchParams.get('q')
    if (initialQ && isItineraryIntent(initialQ)) {
      router.replace(`/itinerary?q=${encodeURIComponent(initialQ)}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Debounced search + URL sync when query/vertical/state change
  useEffect(() => {
    // If itinerary intent detected mid-session, redirect
    if (query && isItineraryIntent(query)) {
      const timer = setTimeout(() => {
        router.push(`/itinerary?q=${encodeURIComponent(query)}`)
      }, 800) // Slightly longer debounce for redirect
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      updateUrl(query, vertical, state)
      search(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, updateUrl, query, vertical, state, router])

  // Build contextual results message
  function getResultsMessage() {
    if (loading) return 'Searching...'
    const count = total.toLocaleString()
    const vertLabel = VERTICAL_LABEL_MAP[vertical]
    const stateLabel = state

    if (query && vertical && stateLabel) {
      return `${count} ${vertLabel} results for \u201c${query}\u201d in ${stateLabel}`
    }
    if (query && vertical) {
      return `${count} ${vertLabel} results for \u201c${query}\u201d`
    }
    if (query && stateLabel) {
      return `${count} results for \u201c${query}\u201d in ${stateLabel}`
    }
    if (query) {
      return `${count} results for \u201c${query}\u201d`
    }
    if (vertical && stateLabel) {
      return `${count} ${vertLabel} listings in ${stateLabel}`
    }
    if (vertical) {
      return `${count} ${vertLabel} listings`
    }
    if (stateLabel) {
      return `${count} listings in ${stateLabel}`
    }
    return `${count} listings across nine atlases`
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Search header */}
      <div className="max-w-2xl">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Search</h1>
        <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>Find places across all nine atlases</p>
      </div>

      {/* Search input */}
      <div className="mt-6 flex items-center gap-3 bg-white rounded-2xl px-5 py-4 max-w-2xl shadow-sm focus-within:shadow-md transition-all" style={{ border: '0.5px solid var(--color-border)' }}>
        <svg className="w-6 h-6 text-[var(--color-accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, place, or style..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none placeholder:text-[var(--color-muted)]/60"
          style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Category filters -- horizontal scroll on mobile */}
      <div className="mt-5 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max pb-1">
          {VERTICALS.map(v => {
            const isActive = vertical === v.key
            const vs = v.key ? VERTICAL_STYLES[v.key] : null

            return (
              <button
                key={v.key}
                onClick={() => setVertical(v.key)}
                className="px-4 py-2 rounded-full transition-all whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: '13px',
                  ...(isActive && vs ? {
                    backgroundColor: vs.bg,
                    border: `1px solid ${vs.text}40`,
                    color: vs.text,
                  } : isActive && !vs ? {
                    backgroundColor: 'var(--color-ink)',
                    border: '1px solid var(--color-ink)',
                    color: '#fff',
                  } : {
                    backgroundColor: '#fff',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-muted)',
                  }),
                }}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* State filters */}
      <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max pb-1">
          {STATES.map(s => (
            <button
              key={s || 'all'}
              onClick={() => setState(s)}
              className="px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '12px',
                ...(state === s
                  ? { backgroundColor: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' }
                  : { backgroundColor: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }),
              }}
            >
              {s || 'All states'}
            </button>
          ))}
        </div>
      </div>

      {/* Results count -- contextual */}
      <div className="mt-6 flex items-center justify-between">
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', color: 'var(--color-muted)' }}>
          {getResultsMessage()}
        </p>
      </div>

      {/* Results grid */}
      {initialLoad ? (
        /* Skeleton loading state */
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        /* Empty state */
        <div className="mt-12 text-center py-16">
          <svg className="w-12 h-12 text-[var(--color-border)] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="mb-2">No results found</h3>
          <p className="max-w-md mx-auto mb-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>
            {query
              ? `No results for \u201c${query}\u201d \u2014 try broader terms or browse by region.`
              : 'Try adjusting your filters or searching for something specific.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/map" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
              Explore the map
            </a>
            <span className="text-[var(--color-border)]">|</span>
            <a href="/regions" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}>
              Browse regions
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {results.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {/* Sparse results suggestion */}
          {results.length > 0 && results.length < 6 && vertical && (
            <div className="mt-8 text-center py-4">
              <p className="text-sm text-[var(--color-muted)]">
                Showing all matching results.{' '}
                <button
                  onClick={() => { setVertical(''); setState(''); setQuery('') }}
                  className="text-[var(--color-sage)] font-medium hover:text-[var(--color-sage-dark)] transition-colors"
                >
                  Browse all listings
                </button>
              </p>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => search(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px' }}
          >
            Previous
          </button>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => search(page + 1)}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="max-w-2xl">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Search</h1>
          <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>Find places across all nine atlases</p>
        </div>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    }>
      <SearchPageInner />
    </Suspense>
  )
}
