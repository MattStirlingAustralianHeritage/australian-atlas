'use client'

import { VERTICAL_MUTED } from '@/lib/verticalUrl'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'

// ── Vertical config ─────────────────────────────────────────

const VERTICALS = [
  { key: '', label: 'All' },
  { key: 'sba', label: 'Small Batch', color: VERTICAL_MUTED.sba },
  { key: 'collection', label: 'Culture Atlas', color: VERTICAL_MUTED.collection },
  { key: 'craft', label: 'Maker Studios', color: VERTICAL_MUTED.craft },
  { key: 'fine_grounds', label: 'Fine Grounds', color: VERTICAL_MUTED.fine_grounds },
  { key: 'rest', label: 'Boutique Stays', color: VERTICAL_MUTED.rest },
  { key: 'field', label: 'Field Atlas', color: VERTICAL_MUTED.field },
  { key: 'corner', label: 'Corner Atlas', color: VERTICAL_MUTED.corner },
  { key: 'found', label: 'Found Atlas', color: VERTICAL_MUTED.found },
  { key: 'table', label: 'Table Atlas', color: VERTICAL_MUTED.table },
  { key: 'way', label: 'Way Atlas', color: VERTICAL_MUTED.way },
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

// ── Search: normalisation, indexing, ranking ────────────────

function normalize(s) {
  return (s == null ? '' : String(s))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (café → cafe)
}

// Build a searchable record once per listing.
function buildRecord(item) {
  const name = normalize(item.name)
  const loc = normalize([item.suburb, item.state, item.region].filter(Boolean).join(' '))
  const vlabel = normalize(VERTICAL_LABEL_MAP[item.vertical] || item.vertical)
  // Padded, punctuation→space variants for word-boundary prefix tests.
  const namePadded = ' ' + name.replace(/[^a-z0-9]+/g, ' ') + ' '
  const locPadded = ' ' + loc.replace(/[^a-z0-9]+/g, ' ') + ' '
  return { item, name, loc, vlabel, namePadded, locPadded }
}

// Is `needle` a subsequence of `hay`? (cheap typo / partial tolerance)
function isSubsequence(needle, hay) {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++
  }
  return i === needle.length
}

// Score a single query token against a record. 0 = no match.
function tokenScore(tk, rec) {
  if (rec.name === tk) return 1000
  if (rec.name.startsWith(tk)) return 650
  if (rec.namePadded.includes(' ' + tk)) return 480 // word-boundary prefix in name
  if (rec.name.includes(tk)) return 320
  if (rec.locPadded.includes(' ' + tk)) return 200 // location word-boundary prefix
  if (rec.loc.includes(tk)) return 130
  if (rec.vlabel.includes(tk)) return 90
  if (tk.length >= 3 && isSubsequence(tk, rec.name)) return 45 // fuzzy fallback
  return 0
}

// Score a record against all query tokens. Returns null when any token is
// unmatched (AND semantics), otherwise a relevance number (higher = better).
function scoreRecord(rec, tokens, joined) {
  let total = 0
  for (const tk of tokens) {
    const s = tokenScore(tk, rec)
    if (s === 0) return null
    total += s
  }
  // Contiguous-phrase bonus for multi-word queries.
  if (joined.length > 0) {
    if (rec.name.startsWith(joined)) total += 500
    else if (rec.name.includes(joined)) total += 250
  }
  // Prefer shorter, tighter names on ties.
  total -= Math.min(rec.name.length, 60) * 0.5
  return total
}

// Wrap matched spans of `name` in <mark>. Cosmetic — case-insensitive only.
function highlightName(name, tokens) {
  if (!tokens || !tokens.length || !name) return name
  const lower = name.toLowerCase()
  const ranges = []
  for (const tk of tokens) {
    if (!tk) continue
    let from = 0
    let idx
    while ((idx = lower.indexOf(tk, from)) !== -1) {
      ranges.push([idx, idx + tk.length])
      from = idx + tk.length
    }
  }
  if (!ranges.length) return name
  ranges.sort((a, b) => a[0] - b[0])
  const merged = [ranges[0].slice()]
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1])
    else merged.push(ranges[i].slice())
  }
  const out = []
  let cursor = 0
  merged.forEach(([s, e], i) => {
    if (s > cursor) out.push(name.slice(cursor, s))
    out.push(
      <mark
        key={i}
        style={{
          background: 'color-mix(in srgb, var(--color-gold) 38%, transparent)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {name.slice(s, e)}
      </mark>
    )
    cursor = e
  })
  if (cursor < name.length) out.push(name.slice(cursor))
  return out
}

// ── Shared listing row ──────────────────────────────────────

function ListingRow({ item, highlightTokens, alwaysShowMeta = false }) {
  return (
    <li
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
          {highlightTokens ? highlightName(item.name, highlightTokens) : item.name}
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
          className={alwaysShowMeta ? 'atlas-index-meta-always' : 'atlas-index-meta'}
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
  )
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
          <ListingRow key={item.id} item={item} />
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

// ── Search results view ─────────────────────────────────────

const RESULT_CAP = 120

function SearchResults({ results, tokens, totalMatches }) {
  return (
    <div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {results.map((item) => (
          <ListingRow
            key={item.id}
            item={item}
            highlightTokens={tokens}
            alwaysShowMeta
          />
        ))}
      </ul>

      {totalMatches > results.length && (
        <p
          style={{
            textAlign: 'center',
            padding: '1.25rem 1rem 0',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            color: 'var(--color-muted)',
          }}
        >
          Showing the top {results.length.toLocaleString()} of{' '}
          {totalMatches.toLocaleString()} matches — keep typing to narrow it down.
        </p>
      )}
    </div>
  )
}

// ── Main client component ───────────────────────────────────

export default function IndexClient({ listings, totalCount, publicVerticals = [] }) {
  const [activeVertical, setActiveVertical] = useState('')
  const [activeState, setActiveState] = useState('')
  const [activeLetter, setActiveLetter] = useState('A')
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  // Index every listing once (normalisation is the only per-item cost).
  const indexed = useMemo(() => listings.map(buildRecord), [listings])

  // Apply vertical/state filters to the indexed set (cheap array filter).
  const indexedFiltered = useMemo(() => {
    let r = indexed
    if (activeVertical) r = r.filter(x => x.item.vertical === activeVertical)
    if (activeState) r = r.filter(x => x.item.state === activeState)
    return r
  }, [indexed, activeVertical, activeState])

  const filtered = useMemo(() => indexedFiltered.map(x => x.item), [indexedFiltered])

  // Tokenised, normalised query.
  const trimmedQuery = query.trim()
  const tokens = useMemo(() => {
    const q = normalize(trimmedQuery)
    return q.split(/\s+/).filter(Boolean)
  }, [trimmedQuery])
  const isSearching = tokens.length > 0

  // Ranked search results over the filtered set.
  const search = useMemo(() => {
    if (!isSearching) return { results: [], total: 0 }
    const joined = tokens.join(' ')
    const scored = []
    for (const rec of indexedFiltered) {
      const score = scoreRecord(rec, tokens, joined)
      if (score != null) scored.push({ item: rec.item, score, name: rec.name })
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      results: scored.slice(0, RESULT_CAP).map(s => s.item),
      total: scored.length,
    }
  }, [isSearching, tokens, indexedFiltered])

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

  const clearSearch = useCallback(() => {
    setQuery('')
    if (inputRef.current) inputRef.current.focus()
  }, [])

  const filteredCount = filtered.length
  const isFiltered = activeVertical || activeState

  // Header copy adapts to whether a search is active.
  const headlineCount = isSearching ? search.total : (isFiltered ? filteredCount : totalCount)
  const headline = isSearching
    ? `${headlineCount.toLocaleString()} ${headlineCount === 1 ? 'result' : 'results'}`
    : `${headlineCount.toLocaleString()} independent Australian places`
  const subline = isSearching
    ? `for “${trimmedQuery}”${isFiltered ? ' in your current filters' : ''}`
    : (isFiltered
        ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} places`
        : 'Every place on the network, from A to Z')

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
        <p className="section-dateline" style={{ marginBottom: '14px' }}>The Atlas Index</p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(2.15rem, 4.6vw, 3.6rem)',
            letterSpacing: '-0.015em',
            lineHeight: 1.06,
            color: 'var(--color-ink)',
            margin: 0,
          }}
        >
          {headline}
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
          {subline}
        </p>
      </header>

      {/* Search + filter bar */}
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '1rem 1.5rem 0',
        }}
      >
        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
          {/* Search icon */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              color: 'var(--color-muted)',
              pointerEvents: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); clearSearch() } }}
            placeholder="Search by name, suburb or region…"
            aria-label="Search the Atlas index by name, suburb or region"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.875rem 2.75rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg)',
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              color: 'var(--color-ink)',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              WebkitAppearance: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--color-sage)'
              e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-sage) 22%, transparent)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--color-border)'
              e.target.style.boxShadow = 'none'
            }}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--color-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-border) 40%, transparent)'; e.currentTarget.style.color = 'var(--color-ink)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Vertical pills */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', gap: '0.375rem', paddingBottom: '0.375rem', minWidth: 'max-content' }}>
            {VERTICALS.filter(v => v.key === '' || publicVerticals.includes(v.key)).map((v) => {
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

      {/* Sticky alphabet nav — browse mode only */}
      {!isSearching && (
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
      )}

      {/* Body */}
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: isSearching ? '1rem 1.5rem 4rem' : '0 1.5rem 4rem',
        }}
      >
        {isSearching ? (
          search.results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--color-ink)', marginBottom: '0.5rem' }}>
                No places match “{trimmedQuery}”
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                {isFiltered
                  ? 'Try a different spelling, or clear your filters.'
                  : 'Try a different spelling or a nearby suburb.'}
              </p>
              <button
                onClick={() => { clearSearch(); setActiveVertical(''); setActiveState('') }}
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
                {isFiltered ? 'Clear search & filters' : 'Clear search'}
              </button>
            </div>
          ) : (
            <SearchResults
              results={search.results}
              tokens={tokens}
              totalMatches={search.total}
            />
          )
        ) : filtered.length === 0 ? (
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
        .atlas-index-meta-always {
          display: inline !important;
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
        input[type=search]::-webkit-search-cancel-button {
          -webkit-appearance: none;
          appearance: none;
        }
      `}</style>
    </main>
  )
}
