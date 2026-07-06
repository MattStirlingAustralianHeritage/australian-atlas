'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import SearchAutocomplete from '@/components/SearchAutocomplete'

const ROLL_MS = 3200

// Hint typography — matched to the real input's native placeholder (DM Sans 300
// / 16px / muted at 60%) so the animated overlay reads as a true placeholder and
// the hand-off to typed text is seamless. The 0.6 opacity lives on the wrapper;
// the roll keyframes animate each line's own opacity within it.
const HINT_TEXT_STYLE = {
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: '17px',
  color: 'var(--color-muted)',
}

export default function HomeSearchBar() {
  const t = useTranslations('home')
  // Example queries cycled through the hero placeholder while the field is empty —
  // they teach the plain-English query patterns by example. The first line is a
  // generic opener (never submitted); the rest are real "Try …" queries.
  const PLACEHOLDER_EXAMPLES = [
    t('phOpener'),
    t('phBakery'),
    t('phWine'),
    t('phGift'),
    t('phBirthday'),
    t('phGalleries'),
  ]
  const [query, setQuery] = useState('')
  // The two lines currently on stage: `curr` rolls in, `prev` rolls out.
  // prev === null on first paint so the opening hint appears without a roll.
  const [pair, setPair] = useState({ prev: null, curr: 0 })
  const [reduceMotion, setReduceMotion] = useState(false)
  // Spotlight: while the field holds focus the page dims behind the bar.
  const [spotlight, setSpotlight] = useState(false)
  const router = useRouter()

  // Honour prefers-reduced-motion: the CSS already disables the roll, but we
  // also drop the outgoing line so the hint simply swaps in place.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Cross-roll the hint while the field is empty; pause the moment a value is
  // typed (the overlay is hidden then anyway).
  useEffect(() => {
    if (query) return
    const id = setInterval(() => {
      setPair(p => ({ prev: p.curr, curr: (p.curr + 1) % PLACEHOLDER_EXAMPLES.length }))
    }, ROLL_MS)
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
    if (item.type === 'ask') {
      router.push(`/search?q=${encodeURIComponent(item.query || query.trim())}`)
    } else if (item.type === 'place' && item.slug) {
      router.push(`/place/${item.slug}`)
    } else if (item.type === 'suburb') {
      router.push(`/search?q=${encodeURIComponent(item.label)}`)
    } else if (item.type === 'category') {
      router.push(`/search?q=${encodeURIComponent(item.query || item.label)}`)
    } else if (item.type === 'region' && item.slug) {
      router.push(`/regions/${item.slug}`)
    }
  }

  // Animated hint overlaid on the empty input. Keyed by `curr` so each cycle
  // remounts both lines and re-fires the CSS roll animations. The opening line
  // (prev === null) renders un-animated so the page doesn't roll on load.
  const animateIn = !reduceMotion && pair.prev !== null
  const hintOverlay = (
    <div className="rph-window" aria-hidden="true" style={{ ...HINT_TEXT_STYLE, opacity: 0.6 }}>
      {!reduceMotion && pair.prev !== null && (
        <span key={`out-${pair.curr}`} className="rph-out">
          <span>{PLACEHOLDER_EXAMPLES[pair.prev]}</span>
        </span>
      )}
      <span key={`in-${pair.curr}`} className={animateIn ? 'rph-in' : undefined}>
        <span>{PLACEHOLDER_EXAMPLES[pair.curr]}</span>
      </span>
    </div>
  )

  return (
    <>
      {/* Spotlight scrim — dims the whole page (nav included) while the field
          holds focus. Clicking it is a natural blur: it's not focusable, so
          the mousedown moves focus off the input and the lights come back up. */}
      <div className={spotlight ? 'search-scrim is-active' : 'search-scrim'} aria-hidden="true" />
    <form
      onSubmit={handleSubmit}
      className={`search-spotlight mt-4 w-full mx-auto${spotlight ? ' is-active' : ''}`}
      style={{ maxWidth: '780px' }}
      onFocusCapture={() => setSpotlight(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSpotlight(false) }}
      onKeyDown={(e) => {
        // Escape past a closed dropdown puts the room lights back on (the
        // autocomplete preventDefaults Escape while its dropdown is open).
        if (e.key === 'Escape' && !e.defaultPrevented && e.target instanceof HTMLElement) e.target.blur()
      }}
    >
      {/* Border, shadow, and the gold focus-within glow live on the
          .home-search-shell class — inline border/shadow here would beat the
          :focus-within rule and kill the glow. */}
      <div
        className="home-search-shell flex items-center gap-3 rounded-2xl px-5 sm:px-6 group"
        style={{ height: '68px' }}
      >
        <svg className="search-shell-icon w-[24px] h-[24px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-gold)' }} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <SearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={handleAutocompleteSelect}
          placeholder=""
          overlay={hintOverlay}
          inputStyle={{ fontSize: '17px', border: 'none', background: 'transparent', padding: 0, borderRadius: 0 }}
          ariaLabel={t('searchAriaLabel')}
        />
        <button
          type="submit"
          className="search-shell-submit shrink-0 rounded-full"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14.5px',
            background: 'var(--color-gold)', color: '#FAF8F4',
            padding: '12px 26px',
          }}
        >
          {t('searchButton')}
        </button>
      </div>
    </form>
    </>
  )
}
