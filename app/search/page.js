'use client'

import { useState, useEffect, useCallback } from 'react'
import ListingCard from '@/components/ListingCard'

const VERTICALS = [
  { key: '', label: 'All' },
  { key: 'sba', label: 'Drink' },
  { key: 'collection', label: 'Culture' },
  { key: 'craft', label: 'Craft' },
  { key: 'fine_grounds', label: 'Coffee' },
  { key: 'rest', label: 'Stay' },
  { key: 'field', label: 'Nature' },
  { key: 'corner', label: 'Shop' },
  { key: 'found', label: 'Vintage' },
  { key: 'table', label: 'Food' },
]

const STATES = ['', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [vertical, setVertical] = useState('')
  const [state, setState] = useState('')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)

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
    }
  }, [query, vertical, state])

  useEffect(() => {
    const timer = setTimeout(() => search(1), 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Search header */}
      <div className="max-w-2xl">
        <h1 className="font-[family-name:var(--font-serif)] text-3xl font-bold">Search</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Find places across all nine atlases</p>
      </div>

      {/* Search input */}
      <div className="mt-6 flex items-center gap-3 bg-white border border-[var(--color-border)] rounded-xl px-4 py-3 max-w-xl">
        <svg className="w-5 h-5 text-[var(--color-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--color-muted)]"
        />
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        {VERTICALS.map(v => (
          <button
            key={v.key}
            onClick={() => setVertical(v.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              vertical === v.key
                ? 'bg-[var(--color-sage)] text-white border-[var(--color-sage)]'
                : 'bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-sage)]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATES.map(s => (
          <button
            key={s || 'all'}
            onClick={() => setState(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              state === s
                ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
                : 'bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-ink)]'
            }`}
          >
            {s || 'All states'}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          {loading ? 'Searching...' : `${total.toLocaleString()} results`}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {results.map(listing => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => search(page - 1)}
            disabled={page <= 1}
            className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--color-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => search(page + 1)}
            disabled={page >= totalPages}
            className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
