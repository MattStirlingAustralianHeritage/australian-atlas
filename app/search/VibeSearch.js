'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { isApprovedImageSource } from '@/lib/image-utils'
import { VERTICAL_MUTED } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_MUTED

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}


function VibeResultCard({ result }) {
  const hasRealImage = result.hero_image_url && isApprovedImageSource(result.hero_image_url)
  const verticalColor = VERTICAL_COLORS[result.vertical] || 'var(--color-muted)'
  const verticalLabel = VERTICAL_LABELS[result.vertical] || result.vertical

  return (
    <a
      href={`/place/${result.slug}`}
      className="vibe-card"
      style={{
        display: 'block',
        textDecoration: 'none',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '0.5px solid var(--color-border)',
        background: '#fff',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Image or typographic placeholder */}
      {hasRealImage ? (
        <div style={{ aspectRatio: '16/10', overflow: 'hidden' }}>
          <img
            src={result.hero_image_url}
            alt={result.name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            aspectRatio: '16/10',
            background: 'var(--color-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            {result.name}
          </p>
        </div>
      )}

      {/* Text content */}
      <div style={{ padding: '1rem 1.125rem 1.25rem' }}>
        <h3
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.9375rem',
            color: 'var(--color-ink)',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {result.name}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: verticalColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              fontWeight: 400,
              color: 'var(--color-muted)',
            }}
          >
            {verticalLabel}
            {result.region && ` \u00B7 ${result.region}`}
            {result.state && !result.region && ` \u00B7 ${result.state}`}
          </span>
        </div>

        {/* Vibe reason */}
        {result.vibe_reason && (
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              fontWeight: 400,
              color: 'var(--color-muted)',
              marginTop: '0.625rem',
              marginBottom: 0,
              lineHeight: 1.45,
            }}
          >
            {result.vibe_reason}
          </p>
        )}
      </div>
    </a>
  )
}

function VibeSkeletonCard() {
  return (
    <div
      style={{
        borderRadius: '12px',
        overflow: 'hidden',
        border: '0.5px solid var(--color-border)',
        background: '#fff',
      }}
    >
      <div style={{ aspectRatio: '16/10', background: '#f3f2ef' }} className="animate-pulse" />
      <div style={{ padding: '1rem 1.125rem 1.25rem' }}>
        <div style={{ height: '14px', width: '70%', background: '#f3f2ef', borderRadius: '4px' }} className="animate-pulse" />
        <div style={{ height: '10px', width: '45%', background: '#f8f7f4', borderRadius: '4px', marginTop: '0.5rem' }} className="animate-pulse" />
        <div style={{ height: '12px', width: '90%', background: '#f8f7f4', borderRadius: '4px', marginTop: '0.75rem' }} className="animate-pulse" />
      </div>
    </div>
  )
}

const EXAMPLE_VIBE_KEYS = ['vibeExample1', 'vibeExample2', 'vibeExample3', 'vibeExample4', 'vibeExample5']

export default function VibeSearch({ initialQuery = '', onQueryChange }) {
  const t = useTranslations('search')
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)

  // Carry the typed text back up so toggling Search↔Vibe keeps the query.
  const updateQuery = useCallback((v) => {
    setQuery(v)
    if (onQueryChange) onQueryChange(v)
  }, [onQueryChange])

  const handleSearch = useCallback(async (searchQuery) => {
    const q = (searchQuery || query).trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const res = await fetch('/api/search/vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t('vibeSearchFailed'))
      }

      const data = await res.json()
      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query])

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSearch()
  }

  const handleExampleClick = (vibe) => {
    setQuery(vibe)
    handleSearch(vibe)
  }

  return (
    <div>
      {/* Vibe search input */}
      <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
        <div
          className="search-shell"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            maxWidth: '40rem',
          }}
        >
          {/* Sparkle icon */}
          <svg
            className="search-shell-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
            aria-hidden="true"
          >
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder={t('vibePlaceholder')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              fontWeight: 300,
              color: 'var(--color-ink)',
              background: 'transparent',
              minHeight: '24px',
            }}
            enterKeyHint="search"
            spellCheck={false}
          />

          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--color-muted)',
                flexShrink: 0,
                padding: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            type="submit"
            disabled={!query.trim() || loading}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: query.trim() ? 'var(--color-ink)' : 'var(--color-border)',
              color: '#fff',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '0.8125rem',
              cursor: query.trim() ? 'pointer' : 'default',
              transition: 'background 0.15s, opacity 0.15s',
              opacity: loading ? 0.6 : 1,
              flexShrink: 0,
              minHeight: '36px',
            }}
          >
            {loading ? t('vibeSearching') : t('vibeSearchButton')}
          </button>
        </div>
      </form>

      {/* Example vibes (show when no search has been done) */}
      {!searched && (
        <div style={{ marginTop: '1.5rem', maxWidth: '40rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--color-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.625rem',
            }}
          >
            {t('vibeTryLabel')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {EXAMPLE_VIBE_KEYS.map((vibeKey) => {
              const vibe = t(vibeKey)
              return (
              <button
                key={vibeKey}
                onClick={() => handleExampleClick(vibe)}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: '9999px',
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--color-muted)',
                  transition: 'color 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.target.style.color = 'var(--color-ink)'; e.target.style.borderColor = 'var(--color-ink)' }}
                onMouseLeave={(e) => { e.target.style.color = 'var(--color-muted)'; e.target.style.borderColor = 'var(--color-border)' }}
              >
                {vibe}
              </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ marginTop: '2rem', maxWidth: '40rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-accent)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ marginTop: '2rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
            {t('vibeFinding')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <VibeSkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && searched && results.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
            {t('vibeResultsCount', { count: results.length })}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {results.map((result) => (
              <VibeResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && results.length === 0 && !error && (
        <div style={{ marginTop: '3rem', textAlign: 'center', padding: '2rem 1rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.125rem',
              fontWeight: 400,
              color: 'var(--color-ink)',
              marginBottom: '0.5rem',
            }}
          >
            {t('vibeEmptyTitle')}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--color-muted)',
            }}
          >
            {t('vibeEmptyHelp')}
          </p>
        </div>
      )}

      {/* Card hover style */}
      <style>{`
        .vibe-card:hover {
          border-color: rgba(28,26,23,0.28) !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .vibe-card:hover img {
          transform: scale(1.03);
        }
      `}</style>
    </div>
  )
}
