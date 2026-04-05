'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TrailPromptInput({ placeholder }) {
  const [query, setQuery] = useState('')
  const router = useRouter()

  function handleSubmit(e) {
    e.preventDefault()
    if (query.trim().length >= 3) {
      // Navigate to itinerary page — preferences modal will appear there
      router.push(`/itinerary?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-lg mx-auto">
      <div
        className="flex items-center gap-3 bg-white rounded-2xl px-5 py-4 shadow-sm hover:shadow-md focus-within:shadow-md transition-all"
        style={{ border: '0.5px solid var(--color-border)' }}
      >
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="var(--color-sage)" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder || "Try 'weekend wine trail through the Barossa' or 'three day art tour of Hobart'..."}
          className="flex-1 bg-transparent text-[var(--color-ink)] placeholder:text-[var(--color-muted)] outline-none"
          style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px' }}
        />
        {query.trim().length >= 3 && (
          <button
            type="submit"
            className="shrink-0 text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px', background: 'var(--color-sage)' }}
          >
            Build trail
          </button>
        )}
      </div>
    </form>
  )
}
