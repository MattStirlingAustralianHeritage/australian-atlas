'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

const TYPE_CONFIG = {
  place: { heading: 'Places', Icon: PlaceIcon },
  suburb: { heading: 'Suburbs', Icon: SuburbIcon },
  region: { heading: 'Regions', Icon: RegionIcon },
}

const TYPE_ORDER = ['place', 'suburb', 'region']

export default function SearchAutocomplete({ value, onChange, onSelect, placeholder }) {
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)

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
        setIsOpen((data.results || []).length > 0)
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

  // Debounced trigger on value change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchResults(value)
    }, 200)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, fetchResults])

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
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0 && value.trim().length >= 2) {
            setIsOpen(true)
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none placeholder:text-[var(--color-muted)]/60"
        style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px' }}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />

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

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '-20px',
            right: '-20px',
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
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
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
