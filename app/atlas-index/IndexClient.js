'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'

// ── Vertical config ─────────────────────────────────────────

const VERTICALS = [
  { key: '', label: 'All' },
  { key: 'sba', label: 'Small Batch', color: '#6b3a2a' },
  { key: 'collection', label: 'Culture Atlas', color: '#5a6b7c' },
  { key: 'craft', label: 'Maker Studios', color: '#7c6b5a' },
  { key: 'fine_grounds', label: 'Fine Grounds', color: '#5F8A7E' },
  { key: 'rest', label: 'Boutique Stays', color: '#8a5a6b' },
  { key: 'field', label: 'Field Atlas', color: '#5a7c5a' },
  { key: 'corner', label: 'Corner Atlas', color: '#7c5a7c' },
  { key: 'found', label: 'Found Atlas', color: '#5a7c6b' },
  { key: 'table', label: 'Table Atlas', color: '#7c6b5a' },
]

const VERTICAL_COLOR_MAP = Object.fromEntries(
  VERTICALS.filter(v => v.key).map(v => [v.key, v.color])
)
const VERTICAL_LABEL_MAP = Object.fromEntries(
  VERTICALS.filter(v => v.key).map(v => [v.key, v.label])
)

const STATES = ['', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const ALPHABET = [
  '#',
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
]

// ── Helpers ─────────────────────────────────────────────────

function getLetterKey(name) {
  if (!name) return '#'
  const first = name.trim().charAt(0).toUpperCase()
  if (first >= 'A' && first <= 'Z') return first
  return '#'
}

function groupByLetter(listings) {
  const groups = {}
  for (const item of listings) {
    const key = getLetterKey(item.name)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

// ── Letter section with expand/collapse ─────────────────────

const INITIAL_SHOW = 50

function LetterSection({ letter, items, onVisible }) {
  const sectionRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el || !onVisible) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onVisible(letter)
          }
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [letter, onVisible])

  const visible = expanded ? items : items.slice(0, INITIAL_SHOW)
  const hasMore = items.length > INITIAL_SHOW && !expanded
  const anchorId = `letter-${letter === '#' ? 'num' : letter}`

  return (
    <section ref={sectionRef} id={anchorId} style={{ scrollMarginTop: '140px' }}>
      {/* Letter heading */}
      <div
        style={{
          position: 'sticky',
          top: '100px',
          zIndex: 30,
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '1rem 0 0.5rem',
          marginTop: '1.5rem',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.75rem',
            color: 'var(--color-ink)',
            margin: 0,
            lineHeight: 1,
          }}
        >
          {letter}
        </h2>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-muted)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {items.length.toLocaleString()} {items.length === 1 ? 'place' : 'places'}
        </span>
      </div>

      {/* Listing rows */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visible.map((item) => (
          <li
            key={item.id}
            className="atlas-index-row"
            style={{ borderBottom: '0.5px solid var(--color-border)' }}
          >
            <Link
              href={`/place/${item.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0',
                textDecoration: 'none',
                transition: 'background 0.1s',
                minHeight: '44px',
              }}
            >
              {/* Name */}
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.9375rem',
                  fontWeight: 450,
                  color: 'var(--color-ink)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </span>

              {/* Vertical dot + label */}
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: VERTICAL_COLOR_MAP[item.vertical] || 'var(--color-muted)',
                    flexShrink: 0,
                  }}
                />
                <span
                  className="atlas-index-vlabel"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.6875rem',
                    fontWeight: 400,
                    color: VERTICAL_COLOR_MAP[item.vertical] || 'var(--color-muted)',
                    display: 'none',
                  }}
                >
                  {VERTICAL_LABEL_MAP[item.vertical] || item.vertical}
                </span>
              </span>

              {/* Suburb + State */}
              <span
                className="atlas-index-meta"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--color-muted)',
                  flexShrink: 0,
                  display: 'none',
                  textAlign: 'right',
                  minWidth: '120px',
                }}
              >
                {[item.suburb, item.state].filter(Boolean).join(', ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Show all button */}
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.75rem',
            marginTop: '0.25rem',
            background: 'none',
            border: '1px dashed var(--color-border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--color-muted)',
            textAlign: 'center',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => { e.target.style.color = 'var(--color-ink)'; e.target.style.borderColor = 'var(--color-ink)' }}
          onMouseLeave={(e) => { e.target.style.color = 'var(--color-muted)'; e.target.style.borderColor = 'var(--color-border)' }}
        >
          Show all {items.length.toLocaleString()} listings
        </button>
      )}
    </section>
  )
}

// ── Main client component ───────────────────────────────────

export default function IndexClient({ listings, totalCount }) {
  const [activeVertical, setActiveVertical] = useState('')
  const [activeState, setActiveState] = useState('')
  const [activeLetter, setActiveLetter] = useState('A')

  // Filter listings
  const filtered = useMemo(() => {
    let result = listings
    if (activeVertical) {
      result = result.filter(l => l.vertical === activeVertical)
    }
    if (activeState) {
      result = result.filter(l => l.state === activeState)
    }
    return result
  }, [listings, activeVertical, activeState])

  const grouped = useMemo(() => groupByLetter(filtered), [filtered])
  const activeLetters = useMemo(() => new Set(Object.keys(grouped)), [grouped])

  const handleLetterVisible = useCallback((letter) => {
    setActiveLetter(letter)
  }, [])

  const handleAlphabetClick = useCallback((letter) => {
    const anchorId = `letter-${letter === '#' ? 'num' : letter}`
    const el = document.getElementById(anchorId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const filteredCount = filtered.length
  const isFiltered = activeVertical || activeState

  return (
    <main style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <header
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '3rem 1.5rem 0.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '2.75rem',
            lineHeight: 1.1,
            color: 'var(--color-ink)',
            margin: 0,
          }}
        >
          {isFiltered
            ? `${filteredCount.toLocaleString()} independent Australian places`
            : `${totalCount.toLocaleString()} independent Australian places`}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9375rem',
            color: 'var(--color-muted)',
            marginTop: '0.5rem',
            marginBottom: 0,
          }}
        >
          {isFiltered
            ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} places`
            : 'Every place on the network, from A to Z'}
        </p>
      </header>

      {/* Filter bar */}
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '1rem 1.5rem 0',
        }}
      >
        {/* Vertical pills */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', gap: '0.375rem', paddingBottom: '0.375rem', minWidth: 'max-content' }}>
            {VERTICALS.map((v) => {
              const isActive = activeVertical === v.key
              return (
                <button
                  key={v.key || 'all'}
                  onClick={() => setActiveVertical(v.key)}
                  style={{
                    padding: '0.5rem 0.875rem',
                    borderRadius: '9999px',
                    border: '1px solid',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '0.8125rem',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                    ...(isActive && v.color
                      ? {
                          backgroundColor: v.color,
                          borderColor: v.color,
                          color: '#fff',
                        }
                      : isActive
                        ? {
                            backgroundColor: 'var(--color-ink)',
                            borderColor: 'var(--color-ink)',
                            color: '#fff',
                          }
                        : {
                            backgroundColor: '#fff',
                            borderColor: 'var(--color-border)',
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

        {/* State pills */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.375rem', paddingBottom: '0.375rem', minWidth: 'max-content' }}>
            {STATES.map((s) => {
              const isActive = activeState === s
              return (
                <button
                  key={s || 'all-states'}
                  onClick={() => setActiveState(s)}
                  style={{
                    padding: '0.4375rem 0.75rem',
                    borderRadius: '9999px',
                    border: '1px solid',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 400,
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                    ...(isActive
                      ? {
                          backgroundColor: 'var(--color-ink)',
                          borderColor: 'var(--color-ink)',
                          color: '#fff',
                        }
                      : {
                          backgroundColor: '#fff',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-muted)',
                        }),
                  }}
                >
                  {s || 'All states'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sticky alphabet nav */}
      <nav
        style={{
          position: 'sticky',
          top: '52px',
          zIndex: 40,
          background: 'var(--color-bg)',
          borderBottom: '0.5px solid var(--color-border)',
        }}
      >
        <div
          style={{
            maxWidth: '72rem',
            margin: '0 auto',
            padding: '0 1.5rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <div style={{ display: 'flex', gap: '0.125rem', padding: '0.625rem 0' }}>
            {ALPHABET.map((letter) => {
              const hasListings = activeLetters.has(letter)
              const isCurrent = activeLetter === letter && hasListings
              return (
                <button
                  key={letter}
                  onClick={() => hasListings && handleAlphabetClick(letter)}
                  disabled={!hasListings}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    fontWeight: isCurrent ? 600 : 500,
                    fontFamily: 'var(--font-body)',
                    flexShrink: 0,
                    border: 'none',
                    cursor: hasListings ? 'pointer' : 'default',
                    transition: 'background 0.15s, color 0.15s',
                    background: isCurrent ? 'var(--color-ink)' : 'transparent',
                    color: isCurrent ? '#fff' : hasListings ? 'var(--color-ink)' : 'var(--color-border)',
                  }}
                >
                  {letter}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Letter sections */}
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '0 1.5rem 4rem',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>
              No places found
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
              Try adjusting your filters.
            </p>
            <button
              onClick={() => { setActiveVertical(''); setActiveState('') }}
              style={{
                marginTop: '1rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-border)',
                background: '#fff',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'var(--color-ink)',
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          ALPHABET.map((letter) => {
            const items = grouped[letter]
            if (!items || items.length === 0) return null
            return (
              <LetterSection
                key={letter}
                letter={letter}
                items={items}
                onVisible={handleLetterVisible}
              />
            )
          })
        )}
      </div>

      {/* Responsive styles */}
      <style>{`
        .atlas-index-meta,
        .atlas-index-vlabel {
          display: none !important;
        }
        @media (min-width: 640px) {
          .atlas-index-meta,
          .atlas-index-vlabel {
            display: inline !important;
          }
        }
        nav div::-webkit-scrollbar {
          display: none;
        }
        .atlas-index-row:hover {
          background: color-mix(in srgb, var(--color-border) 20%, transparent);
        }
        nav button:hover:not(:disabled) {
          background: color-mix(in srgb, var(--color-border) 30%, transparent);
        }
      `}</style>
    </main>
  )
}
