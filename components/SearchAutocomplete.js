'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { isInquiryQuery } from '@/lib/search/inquiryIntent'

// Sparkle mark for the "Ask the Atlas" affordance — signals the field just
// switched from name-lookup to answering a plain-language request.
function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.6 1.6L21 17l-1.4.6L19 19l-.6-1.4L17 17l1.4-.4z" />
    </svg>
  )
}

// Icons for each result type
function PlaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function SuburbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  )
}

function RegionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  )
}

function CategoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

const TYPE_CONFIG = {
  region: { heading: 'Regions', Icon: RegionIcon },
  suburb: { heading: 'Suburbs', Icon: SuburbIcon },
  category: { heading: 'Categories', Icon: CategoryIcon },
  place: { heading: 'Places', Icon: PlaceIcon },
}

// Render/keyboard order: location + category suggestions surface above
// partial venue-name matches (so e.g. "Yarra Valley" isn't buried under tiny
// venues, and "brew" suggests the Breweries category).
const TYPE_ORDER = ['region', 'suburb', 'category', 'place']

export default function SearchAutocomplete({ value, onChange, onSelect, placeholder, inputStyle, ariaLabel, overlay }) {
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)
  // Only a real interaction (typing/focus) may open the dropdown. Without this,
  // landing on /search?q=… with a prefilled value auto-opened suggestions over
  // the results the user came for.
  const touchedRef = useRef(false)

  // The moment the typed text reads as a plain-language request rather than a
  // name/category lookup, the dropdown stops name-matching and offers to answer
  // the question ("Ask the Atlas") — no wasted /api/autocomplete round-trip, and
  // no confusing venue-name matches under a "buy a gift for…" query.
  const trimmed = (value || '').trim()
  const inquiry = trimmed.length >= 3 && isInquiryQuery(trimmed)

  // Build a flat list of items for keyboard navigation (includes headers for skip logic)
  const flatItems = buildFlatList(results)

  // Fetch autocomplete results with debounce
  const fetchResults = useCallback((query) => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }

    if (!query || query.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    fetch(`/api/autocomplete?q=${encodeURIComponent(query.trim())}`, {
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        setResults(data.results || [])
        setIsOpen(touchedRef.current && (data.results || []).length > 0)
        setActiveIndex(-1)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[autocomplete] fetch error:', err)
          setLoading(false)
        }
      })
  }, [])

  // Debounced trigger on value change. An inquiry short-circuits the network:
  // abort any in-flight typeahead, drop stale name-matches, and open the "Ask"
  // panel instead.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (inquiry) {
      if (abortRef.current) abortRef.current.abort()
      setResults([])
      setLoading(false)
      setActiveIndex(-1)
      setIsOpen(touchedRef.current)
      return
    }
    debounceRef.current = setTimeout(() => {
      fetchResults(value)
    }, 200)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, inquiry, fetchResults])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Handle selecting a result
  function handleSelect(item) {
    setIsOpen(false)
    setActiveIndex(-1)
    if (onSelect) {
      onSelect(item)
    }
  }

  // Keyboard navigation
  function handleKeyDown(e) {
    if (!isOpen || flatItems.length === 0) {
      return
    }

    const selectableItems = flatItems.filter(f => f.kind === 'item')

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => {
        const next = prev + 1
        return next >= selectableItems.length ? 0 : next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => {
        const next = prev - 1
        return next < 0 ? selectableItems.length - 1 : next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < selectableItems.length) {
        handleSelect(selectableItems[activeIndex].data)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  // Group results by type and build a selectable index map
  const grouped = {}
  for (const item of results) {
    if (!grouped[item.type]) {
      grouped[item.type] = []
    }
    grouped[item.type].push(item)
  }

  // Pre-compute the selectable index for each type+position pair
  const indexMap = {}
  let counter = 0
  for (const type of TYPE_ORDER) {
    const items = grouped[type]
    if (!items || items.length === 0) continue
    for (let i = 0; i < items.length; i++) {
      indexMap[`${type}-${i}`] = counter++
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { touchedRef.current = true; onChange(e.target.value) }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          touchedRef.current = true
          if (inquiry || (results.length > 0 && value.trim().length >= 2)) {
            setIsOpen(true)
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none placeholder:text-[var(--color-muted)]/60"
        style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', ...inputStyle }}
        autoComplete="off"
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls="aa-listbox"
        aria-activedescendant={isOpen && activeIndex >= 0 ? `aa-opt-${activeIndex}` : undefined}
      />

      {/* Animated hint overlay (hero only). Shown over the empty field as a
          richer stand-in for the native placeholder; hidden the moment a value
          is typed. pointer-events:none on the overlay keeps focus on the input. */}
      {overlay && !value ? overlay : null}

      {/* Loading indicator */}
      {loading && value.trim().length >= 2 && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
        }}>
          <div style={{
            width: '14px',
            height: '14px',
            border: '1.5px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            borderRadius: '50%',
            animation: 'autocomplete-spin 0.6s linear infinite',
          }} />
        </div>
      )}

      {/* Inquiry mode — offer to ANSWER the request rather than name-match it. */}
      {isOpen && inquiry && (
        <div
          role="listbox"
          id="aa-listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected="true"
            onClick={() => handleSelect({ type: 'ask', query: trimmed })}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '14px 16px', border: 'none', background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'var(--color-cream)', color: 'var(--color-gold)',
            }}>
              <AskIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600,
                fontSize: 14, color: 'var(--color-ink)',
              }}>
                Ask the Atlas
              </span>
              <span style={{
                display: 'block', fontFamily: 'var(--font-body)', fontWeight: 300,
                fontSize: 12.5, color: 'var(--color-muted)', marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Get recommendations for “{trimmed}”
              </span>
            </span>
            <span style={{ color: 'var(--color-gold)', fontSize: 18, flexShrink: 0 }} aria-hidden="true">→</span>
          </button>
          <div style={{
            padding: '9px 16px', borderTop: '1px solid var(--color-border)',
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11.5,
            color: 'var(--color-muted)', background: 'var(--color-cream)',
          }}>
            Reads like a question, so we&apos;ll answer it — not just match names.
          </div>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && !inquiry && (
        <div
          role="listbox"
          id="aa-listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            zIndex: 100,
            maxHeight: '380px',
            overflowY: 'auto',
          }}
        >
          {TYPE_ORDER.map(type => {
            const items = grouped[type]
            if (!items || items.length === 0) return null
            const config = TYPE_CONFIG[type]

            return (
              <div key={type}>
                {/* Section header */}
                <div style={{
                  padding: '8px 16px 4px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-muted)',
                }}>
                  {config.heading}
                </div>

                {/* Items */}
                {items.map((item, idx) => {
                  const itemIndex = indexMap[`${type}-${idx}`]
                  const isActive = itemIndex === activeIndex

                  return (
                    <button
                      key={`${type}-${item.label}-${item.slug || item.id || idx}`}
                      id={`aa-opt-${itemIndex}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 16px',
                        border: 'none',
                        background: isActive ? 'var(--color-cream)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                    >
                      <span style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                        <config.Icon />
                      </span>

                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 400,
                          fontSize: '14px',
                          color: 'var(--color-ink)',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {item.label}
                        </span>

                        <span style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 300,
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {getMetaText(item)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

/**
 * Build a flat list of all dropdown entries for keyboard nav indexing.
 */
function buildFlatList(results) {
  const grouped = {}
  for (const item of results) {
    if (!grouped[item.type]) {
      grouped[item.type] = []
    }
    grouped[item.type].push(item)
  }

  const flat = []
  for (const type of TYPE_ORDER) {
    const items = grouped[type]
    if (!items || items.length === 0) continue
    flat.push({ kind: 'header', type })
    for (const item of items) {
      flat.push({ kind: 'item', data: item })
    }
  }
  return flat
}

/**
 * Produce a subtitle string from item metadata.
 */
function getMetaText(item) {
  const parts = []
  if (item.type === 'place') {
    if (item.suburb) parts.push(item.suburb)
    if (item.region) parts.push(item.region)
    if (item.state) parts.push(item.state)
  } else if (item.type === 'suburb') {
    if (item.region) parts.push(item.region)
    if (item.state) parts.push(item.state)
  } else if (item.type === 'region') {
    if (item.state) parts.push(item.state)
  }
  return parts.join(' \u00B7 ')
}
