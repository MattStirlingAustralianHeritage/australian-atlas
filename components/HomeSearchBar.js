'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import SearchAutocomplete from '@/components/SearchAutocomplete'

// Example queries cycled through the placeholder while the field is empty —
// they teach the plain-English query patterns (style, thing + region,
// vibe + state, category + city) by example. Every query here was verified
// against the live /api/search to return real results; don't add one without
// checking it isn't a dead end.
const PLACEHOLDER_EXAMPLES = [
  'Find a roaster, a winery, a gallery, a farm stay…',
  'Try “wood-fired bakery”',
  'Try “natural wine in the Adelaide Hills”',
  'Try “quiet farm stay in Tasmania”',
  'Try “galleries in Hobart”',
]

export default function HomeSearchBar() {
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const router = useRouter()

  useEffect(() => {
    if (query) return
    const id = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % PLACEHOLDER_EXAMPLES.length)
    }, 3500)
    return () => clearInterval(id)
  }, [query])

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
    <form onSubmit={handleSubmit} className="mt-4 w-full mx-auto" style={{ maxWidth: '720px' }}>
      {/* Border, shadow, and the gold focus-within glow live on the
          .home-search-shell class — inline border/shadow here would beat the
          :focus-within rule and kill the glow. */}
      <div
        className="home-search-shell flex items-center gap-3 rounded-2xl px-5 sm:px-6 group"
        style={{ height: '62px' }}
      >
        <svg className="w-[22px] h-[22px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-gold)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <SearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={handleAutocompleteSelect}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
          inputStyle={{ fontSize: '16px', border: 'none', background: 'transparent', padding: 0, borderRadius: 0 }}
          ariaLabel="Search the atlas"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full hover:opacity-90 transition-opacity"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px',
            background: 'var(--color-gold)', color: '#FAF8F4',
            padding: '10px 22px',
          }}
        >
          Search
        </button>
      </div>
    </form>
  )
}
