'use client'

import { useState, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import ListingCard from '@/components/ListingCard'

// ============================================================
// SearchAssistant — the optional "help me choose" panel on lookup results.
//
// A plain keyword search ("museums in hobart") returns a set of places; this
// panel OFFERS to whittle them down. Engaging it fetches 3-5 grounded
// directions from /api/search/assist (read from the actual result set), and a
// chosen direction — or free text — comes back as a short answer plus 2-5
// picked cards with venue-bound reasons. Earlier refinements travel with each
// follow-up, so "somewhere for the kids" then "rainy day" narrows, not resets.
//
// Deliberately additive: the full results always remain below, dismissing it
// costs nothing, and it never renders in concierge (inquiry) mode where the
// answer panel already does this job.
//
// When the post-search concierge brief lands (`intro`), it renders INSIDE this
// panel — one gold-edged voice reading the results and offering to help, not
// two stacked AI panels talking over each other.
// ============================================================

const star = (size, color) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color, flexShrink: 0 }} aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </svg>
)

export default function SearchAssistant({ query, listings, placeLabel, intro, dimmed, onTrackClick }) {
  const t = useTranslations('search')
  const locale = useLocale()
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [greeting, setGreeting] = useState(null)
  const [angles, setAngles] = useState([])
  const [shortlist, setShortlist] = useState(null)  // { answer, picks: [{listing, why}], followUp }
  const [history, setHistory] = useState([])
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  if (dismissed || !Array.isArray(listings) || listings.length < 2) return null

  const ids = listings.map((l) => l.id).filter(Boolean).slice(0, 30)
  const byId = new Map(listings.map((l) => [l.id, l]))

  async function callAssist(extra) {
    const res = await fetch('/api/search/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ids, place: placeLabel || undefined, locale, ...extra }),
    })
    if (!res.ok) throw new Error('assist failed')
    return res.json()
  }

  async function engage() {
    setOpen(true)
    setBusy(true)
    setUnavailable(false)
    try {
      const d = await callAssist({})
      const got = d && d.available !== false && Array.isArray(d.angles) && d.angles.length
      if (got) {
        setAngles(d.angles)
        setGreeting(d.greeting || null)
        setTimeout(() => inputRef.current?.focus(), 50)
      } else {
        setUnavailable(true)
      }
    } catch {
      setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }

  async function refine(need) {
    const cleanNeed = String(need || '').trim()
    if (!cleanNeed || busy) return
    setBusy(true)
    setUnavailable(false)
    setText('')
    try {
      const d = await callAssist({ need: cleanNeed, history })
      if (d && d.available !== false) {
        const picks = (Array.isArray(d.picks) ? d.picks : [])
          .map((p) => ({ listing: byId.get(p.id), why: p.why }))
          .filter((p) => p.listing)
        setShortlist({ answer: d.answer || null, picks, followUp: d.followUp || null })
        setHistory((h) => [...h, cleanNeed].slice(-3))
      } else {
        setUnavailable(true)
      }
    } catch {
      setUnavailable(true)
    } finally {
      setBusy(false)
    }
  }

  const chip = {
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
    padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
    background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)',
    transition: 'all 0.15s',
  }
  const dismissBtn = (
    <button
      type="button"
      aria-label={t('assistDismiss')}
      onClick={() => setDismissed(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 6, marginLeft: 'auto', flexShrink: 0, display: 'flex' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )

  return (
    <div
      className="mt-5"
      style={{
        padding: open || intro ? '1.15rem 1.3rem 1.25rem' : '0.8rem 1.3rem',
        borderRadius: '1rem',
        background: 'var(--color-cream)',
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-gold)',
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity 0.15s',
        pointerEvents: dimmed ? 'none' : 'auto',
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {star(15, 'var(--color-gold)')}
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>
          {t('assistLabel')}
        </span>
        {!open && !intro && (
          <>
            <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13.5, color: 'var(--color-ink)' }}>
              {t('assistOfferBody')}
            </span>
            <button type="button" onClick={engage} style={{ ...chip, background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' }}>
              {t('assistOfferCta')}
            </button>
          </>
        )}
        {dismissBtn}
      </div>
      {/* Small screens get the offer line under the label row */}
      {!open && !intro && (
        <p className="sm:hidden" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13, color: 'var(--color-ink)', margin: '7px 0 0' }}>
          {t('assistOfferBody')}
        </p>
      )}

      {/* Concierge note about THESE results, with the offer sitting quietly
          beneath it — one panel, one voice. Engaging swaps to the live view. */}
      {!open && intro && (
        <div style={{ animation: 'search-card-in 0.35s ease both' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1rem, 2.2vw, 1.2rem)', lineHeight: 1.5, color: 'var(--color-ink)', margin: '9px 0 0' }}>
            {intro}
          </p>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={engage} style={{ ...chip, background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' }}>
              {t('assistOfferCta')}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Greeting / answer / status line */}
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1rem, 2.2vw, 1.2rem)', lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
            {busy
              ? (shortlist || history.length ? t('assistChoosing') : t('assistThinking'))
              : unavailable
                ? t('assistUnavailable')
                : shortlist
                  ? (shortlist.answer || (shortlist.picks.length ? '' : t('assistNoPicks')))
                  : (greeting || t('assistOfferTitle'))}
          </p>

          {/* Shortlist — the whittled-down ideas, reasons bound to each card */}
          {!busy && shortlist && shortlist.picks.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {shortlist.picks.map((p, idx) => (
                <div key={p.listing.id}>
                  <ListingCard
                    listing={p.listing}
                    onClick={onTrackClick ? () => onTrackClick(p.listing, idx + 1) : undefined}
                  />
                  {p.why && (
                    <p style={{ margin: '9px 2px 0', display: 'flex', gap: 7, alignItems: 'flex-start', fontFamily: 'var(--font-body)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-muted)' }}>
                      <span style={{ marginTop: 2, display: 'flex' }}>{star(13, 'var(--color-gold)')}</span>
                      <span>{p.why}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Direction chips — hidden once a shortlist is up (followUp takes over) */}
          {!busy && !unavailable && !shortlist && angles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {angles.map((a) => (
                <button key={a.label} type="button" onClick={() => refine(a.hint ? `${a.label} — ${a.hint}` : a.label)} style={chip} title={a.hint || undefined}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Free-text refine — always available while the assistant is open */}
          {!unavailable && (
            <form
              onSubmit={(e) => { e.preventDefault(); refine(text) }}
              style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', maxWidth: 560 }}
            >
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={shortlist ? t('assistFollowUpPlaceholder') : t('assistInputPlaceholder')}
                disabled={busy}
                style={{
                  flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13.5,
                  padding: '9px 14px', borderRadius: 999, border: '1px solid var(--color-border)',
                  background: '#fff', color: 'var(--color-ink)', outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                style={{
                  ...chip,
                  background: text.trim() && !busy ? 'var(--color-ink)' : '#fff',
                  color: text.trim() && !busy ? '#fff' : 'var(--color-muted)',
                  cursor: text.trim() && !busy ? 'pointer' : 'default',
                }}
              >
                {t('assistSend')}
              </button>
            </form>
          )}

          {/* Follow-up nudge + a way back to the broader directions */}
          {!busy && shortlist && (
            <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {shortlist.followUp && <span>{shortlist.followUp}</span>}
              {angles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShortlist(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-accent)', fontWeight: 500, fontSize: 12.5, fontFamily: 'var(--font-body)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {t('assistOtherIdeas')}
                </button>
              )}
            </p>
          )}

          {/* Grounding note — the assistant only ever picks from what's here */}
          <p style={{ margin: '12px 0 0', fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)' }}>
            {t('assistGroundedNote')}
          </p>
        </div>
      )}
    </div>
  )
}
