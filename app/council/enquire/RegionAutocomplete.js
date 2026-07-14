'use client'

import { useState, useEffect, useRef, useMemo, useId } from 'react'

/**
 * Region type-ahead for the council join page. Fetches the live region list once,
 * filters as the user types, and reports the picked region up to the parent as
 * { id, name }. A region that isn't in the list can still be typed free-hand
 * (id stays null) so a council is never blocked — the admin can match it later.
 */
export default function RegionAutocomplete({ value, regionId, onChange, inputStyle, placeholder }) {
  const [regions, setRegions] = useState([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const wrapRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    let alive = true
    fetch('/api/council/regions')
      .then(r => (r.ok ? r.json() : { regions: [] }))
      .then(d => { if (alive) { setRegions(d.regions || []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const query = (value || '').trim().toLowerCase()
  const matches = useMemo(() => {
    if (!regions.length) return []
    if (!query) return regions.slice(0, 8)
    const starts = []
    const contains = []
    for (const r of regions) {
      const n = r.name.toLowerCase()
      if (n.startsWith(query)) starts.push(r)
      else if (n.includes(query) || (r.state && r.state.toLowerCase() === query)) contains.push(r)
    }
    return [...starts, ...contains].slice(0, 8)
  }, [regions, query])

  // An exact (case-insensitive) name match means the current text IS a real region.
  const exact = useMemo(
    () => regions.find(r => r.name.toLowerCase() === query),
    [regions, query]
  )

  function pick(r) {
    onChange({ id: r.id, name: r.name, state: r.state, listing_count: r.listing_count })
    setOpen(false)
  }

  function handleInput(e) {
    const text = e.target.value
    // Typing invalidates a previously-picked id unless it still matches exactly.
    const stillExact = regions.find(r => r.name.toLowerCase() === text.trim().toLowerCase())
    onChange(stillExact
      ? { id: stillExact.id, name: text, state: stillExact.state, listing_count: stillExact.listing_count }
      : { id: null, name: text, state: null, listing_count: null })
    setOpen(true)
    setHighlight(0)
  }

  function handleKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      if (open && matches[highlight]) { e.preventDefault(); pick(matches[highlight]) }
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  const matched = !!regionId || !!exact

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value || ''}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Start typing your region…'}
          style={{ ...inputStyle, paddingRight: matched ? '2.25rem' : inputStyle?.paddingRight }}
        />
        {matched && (
          <span
            aria-hidden
            style={{
              position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)',
              color: '#5F8A7E', fontSize: '1rem', pointerEvents: 'none',
            }}
            title="Matched to an Atlas region"
          >&#10003;</span>
        )}
      </div>

      {open && (matches.length > 0 || (loaded && query && !exact)) && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)',
            margin: 0, padding: '0.25rem', listStyle: 'none',
            background: '#fff', border: '1px solid var(--color-border)', borderRadius: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.10)', maxHeight: '280px', overflowY: 'auto',
          }}
        >
          {matches.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => { e.preventDefault(); pick(r) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                padding: '0.6rem 0.75rem', borderRadius: '7px', cursor: 'pointer',
                background: i === highlight ? 'var(--color-bg, #f6f4ef)' : 'transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ fontSize: '0.95rem', color: 'var(--color-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                {r.state && <span style={{ fontSize: '0.7rem', letterSpacing: '0.06em', color: 'var(--color-muted)', textTransform: 'uppercase', flexShrink: 0 }}>{r.state}</span>}
              </span>
              {typeof r.listing_count === 'number' && r.listing_count > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#5F8A7E', flexShrink: 0 }}>{r.listing_count.toLocaleString()} places</span>
              )}
            </li>
          ))}
          {loaded && query && !exact && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); onChange({ id: null, name: value, state: null, listing_count: null }); setOpen(false) }}
              style={{
                padding: '0.6rem 0.75rem', borderRadius: '7px', cursor: 'pointer',
                borderTop: matches.length ? '1px solid var(--color-border)' : 'none',
                marginTop: matches.length ? '0.25rem' : 0, fontSize: '0.85rem', color: 'var(--color-muted)',
              }}
            >
              Use &ldquo;<strong style={{ color: 'var(--color-ink)' }}>{value}</strong>&rdquo; — we&rsquo;ll match your region for you
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
