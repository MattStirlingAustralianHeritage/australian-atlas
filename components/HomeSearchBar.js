'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SearchAutocomplete from '@/components/SearchAutocomplete'

export default function HomeSearchBar() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    } else {
      router.push('/search')
    }
  }

  function handleAutocompleteSelect(item) {
    if (item.type === 'place' && item.slug) {
      router.push(`/place/${item.slug}`)
    } else if (item.type === 'suburb') {
      router.push(`/search?q=${encodeURIComponent(item.label)}`)
    } else if (item.type === 'region' && item.slug) {
      router.push(`/regions/${item.slug}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full max-w-2xl mx-auto">
      <div className="flex items-center gap-3 bg-white rounded-2xl px-5 sm:px-6 py-4 sm:py-5 shadow-md hover:shadow-lg focus-within:shadow-lg transition-all group" style={{ border: '1px solid var(--color-border)' }}>
        <svg className="w-5 h-5 text-[var(--color-accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <SearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={handleAutocompleteSelect}
          placeholder="Where are you going, or what are you looking for?"
        />
        <button
          type="submit"
          className="shrink-0 text-white bg-[var(--color-accent)] px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
        >
          Search
        </button>
      </div>
    </form>
  )
}
