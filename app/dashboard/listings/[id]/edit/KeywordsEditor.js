'use client'

import { useCallback, useRef, useState } from 'react'
import { inspectKeyword, cleanKeyword, MAX_KEYWORDS } from '@/lib/search-keywords/normalize'

/**
 * Search keywords editor — operator-authored, search-only terms.
 *
 * A paid, claimed operator adds up to 15 short keywords (styles, products,
 * techniques, materials) that make the listing more findable. The terms feed the
 * listing's embedding and the lexical search document on the server; they are
 * NEVER shown on the public page.
 *
 * Self-contained, mirroring HighlightsEditor: loads from listing.search_keywords,
 * tracks its own dirty state, and saves through the same PATCH
 * /api/dashboard/listing contract (master-only write, owner + paid gated
 * server-side). Client validation reuses lib/search-keywords/normalize so the
 * chip rules match the server exactly.
 *
 * The whole editor page is already gated to paid owners (an unpaid operator gets
 * the payment challenge instead of this section), and the PATCH route re-checks
 * ownership + active standard claim — so this section needs no gate of its own.
 */
export default function KeywordsEditor({ listingId, token, initialKeywords, accent }) {
  const vertColor = accent || 'var(--color-sage)'

  const initial = Array.isArray(initialKeywords)
    ? initialKeywords.map(k => String(k ?? '').trim()).filter(Boolean)
    : []

  const [chips, setChips] = useState(initial)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const baselineRef = useRef(JSON.stringify(initial))
  const inputRef = useRef(null)

  const atMax = chips.length >= MAX_KEYWORDS
  const dirty = JSON.stringify(chips) !== baselineRef.current || !!input.trim()

  // Fold one or more comma/newline-separated terms into the current chips,
  // applying the shared validation + dedupe + 15 cap. Surfaces the first
  // problem (invalid term, duplicate, or cap reached) inline.
  const commit = useCallback((rawText) => {
    const pieces = String(rawText).split(/[,\n]/).map(p => p.trim()).filter(Boolean)
    if (!pieces.length) { setInput(''); return }
    setChips(prev => {
      const next = [...prev]
      const seen = new Set(next)
      let err = null
      for (const piece of pieces) {
        if (next.length >= MAX_KEYWORDS) { err = `You can add up to ${MAX_KEYWORDS} keywords.`; break }
        const { value, reason } = inspectKeyword(piece)
        if (value == null) { if (reason) err = `Keyword ${reason}.`; continue }
        if (seen.has(value)) { err = `“${value}” is already in your list.`; continue }
        seen.add(value)
        next.push(value)
      }
      setError(err)
      return next
    })
    setInput('')
  }, [])

  const removeChip = useCallback((i) => {
    setChips(prev => prev.filter((_, idx) => idx !== i))
    setError(null)
  }, [])

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) commit(input)
    } else if (e.key === 'Backspace' && !input && chips.length) {
      removeChip(chips.length - 1)
    }
  }

  async function handleSave() {
    // Fold any typed-but-not-yet-entered text into the list first, so a term the
    // operator left in the input isn't silently dropped on save.
    let finalChips = chips
    if (input.trim()) {
      const merged = [...chips]
      const seen = new Set(merged)
      for (const piece of input.split(/[,\n]/).map(s => s.trim()).filter(Boolean)) {
        if (merged.length >= MAX_KEYWORDS) break
        const v = cleanKeyword(piece)
        if (v && !seen.has(v)) { seen.add(v); merged.push(v) }
      }
      finalChips = merged
      setChips(merged)
      setInput('')
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId, search_keywords: finalChips }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save your keywords.')
      } else {
        const saved = Array.isArray(data.listing?.search_keywords) ? data.listing.search_keywords : finalChips
        setChips(saved)
        baselineRef.current = JSON.stringify(saved)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2500)
      }
    } catch {
      setError('Could not save your keywords.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`
        .aa-kw-box:focus-within { border-color: ${vertColor}; box-shadow: 0 0 0 3px ${vertColor}22; }
        .aa-kw-input::placeholder { color: var(--color-muted); }
        .aa-kw-save:not(:disabled):hover { opacity: 0.9; }
        .aa-kw-chip-x:hover { background: rgba(0,0,0,0.12); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>
          Search keywords
        </h2>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: atMax ? '#b45309' : 'var(--color-muted)' }}>
          {chips.length} / {MAX_KEYWORDS}
        </span>
      </div>

      <label htmlFor="aa-kw-input" style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>
        Also known for
      </label>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 12px', lineHeight: 1.5, maxWidth: 580 }}>
        Add up to {MAX_KEYWORDS} short terms people might search to find you — styles, products, techniques,
        materials. e.g. witbier, wheat beer, barrel-aged. These improve search; they don’t appear on your public page.
      </p>

      <div
        className="aa-kw-box"
        style={chipBox}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((k, i) => (
          <span key={k} style={chipStyle}>
            {k}
            <button
              type="button"
              className="aa-kw-chip-x"
              onClick={(e) => { e.stopPropagation(); removeChip(i) }}
              aria-label={`Remove ${k}`}
              title={`Remove ${k}`}
              style={chipX}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="aa-kw-input"
          ref={inputRef}
          className="aa-kw-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (input.trim()) commit(input) }}
          placeholder={atMax ? '' : (chips.length ? 'Add another…' : 'e.g. witbier, wheat beer, barrel-aged')}
          disabled={atMax}
          aria-label="Also known for"
          style={chipInput}
        />
      </div>

      <div style={{ marginTop: 8, minHeight: 18 }}>
        {atMax ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#b45309' }}>
            You’ve reached the {MAX_KEYWORDS}-keyword limit. Remove one to add another.
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
            Press Enter or comma to add each keyword.
          </span>
        )}
      </div>

      {/* ── Save row ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="aa-kw-save"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: dirty ? 'var(--color-ink)' : 'var(--color-border)',
            color: dirty ? '#fff' : 'var(--color-muted)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: saving || !dirty ? 'default' : 'pointer', transition: 'opacity 0.12s ease',
          }}
        >
          {saving ? 'Saving…' : 'Save keywords'}
        </button>
        {error ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#c62828' }}>{error}</span>
        ) : justSaved ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>✓ Keywords saved</span>
        ) : dirty ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Unsaved keyword changes</span>
        ) : null}
      </div>
    </div>
  )
}

// ── Styles (match HighlightsEditor's card aesthetic) ─────────
const chipBox = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
  minHeight: 48, padding: '8px 10px', borderRadius: 10,
  border: '1px solid var(--color-border)', background: '#fff',
  cursor: 'text', transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
}
const chipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 6px 4px 12px', borderRadius: 999,
  background: 'var(--color-cream)', border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
  whiteSpace: 'nowrap',
}
const chipX = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 18, height: 18, borderRadius: '50%', border: 'none', padding: 0,
  background: 'transparent', color: 'var(--color-muted)',
  fontSize: 15, lineHeight: 1, cursor: 'pointer', transition: 'background 0.12s ease',
}
const chipInput = {
  flex: 1, minWidth: 140, border: 'none', outline: 'none', background: 'transparent',
  padding: '6px 4px', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)',
}
