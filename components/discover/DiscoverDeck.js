'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { useLocation } from '@/components/LocationProvider'
import AuthModal from '@/components/AuthModal'
import DiscoverCard from './DiscoverCard'
import './discover.css'

const BATCH_LIMIT = 10
const SWIPE_THRESHOLD = 80
const EXIT_MS = 280
// Drag only becomes a drag after this much horizontal travel — anything less
// is a click (the More tab and View listing link must stay tappable).
const DRAG_SLOP = 8
// A fast flick commits even before the distance threshold (px per ms).
const FLICK_VELOCITY = 0.55
const FLICK_MIN_DX = 30
// Hard guarantee on the SERVED sequence: never show more than this many of one
// vertical in a row. Enforced client-side (we know exactly what's been shown),
// independent of server ranking — reorders the buffer to pull up a different
// vertical before a 4th-in-a-row would appear.
const CLIENT_MAX_RUN = 3

function uniq(arr) {
  return [...new Set(arr)]
}

/**
 * Reorder `queue` (upcoming cards) so the served sequence never exceeds
 * `maxRun` of one vertical consecutively, continuing the run already shown
 * (`servedVerticals`). queue[0] (the current/just-advanced card) is kept in
 * place; only later cards are pulled up. If the buffer has no different-vertical
 * card to pull (rare — the server returns cross-sections), the run is left as-is
 * and a top-up fetch brings diversity.
 */
function capConsecutive(queue, servedVerticals, maxRun) {
  if (!Array.isArray(queue) || queue.length < 2) return queue
  const out = queue.slice()
  // Seed the run from what's already been shown.
  let rv = null, rc = 0
  for (let i = servedVerticals.length - 1; i >= 0; i--) {
    if (rv === null) { rv = servedVerticals[i]; rc = 1 }
    else if (servedVerticals[i] === rv) rc += 1
    else break
  }
  // queue[0] is current. If it isn't the last-shown vertical, it starts a new run.
  if (out[0].vertical !== rv) { rv = out[0].vertical; rc = 1 }
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].vertical === rv && rc >= maxRun) {
      let alt = -1
      for (let j = i + 1; j < out.length; j += 1) {
        if (out[j].vertical !== rv) { alt = j; break }
      }
      if (alt === -1) break // nothing different left to pull up
      const [c] = out.splice(alt, 1)
      out.splice(i, 0, c)
    }
    if (out[i].vertical === rv) rc += 1
    else { rv = out[i].vertical; rc = 1 }
  }
  return out
}

/**
 * DiscoverDeck — the whole Discover mechanic in one reusable component.
 *
 *  §2 adaptive feed   — posts in-memory pickedIds/skippedIds/seenIds to
 *                       /api/discover/feed, which ranks by taste-vector
 *                       distance and excludes seen. Re-ranks on every pick.
 *  §3 save-gated wall  — anonymous picks accrue in memory ONLY (never written
 *                       to user_saves); a non-blocking counter induces sign-in;
 *                       on sign-in the picks flush in one batch; logged-in
 *                       picks persist immediately.
 *  §4 taste-reflection — the server returns a true, specific sentence once the
 *                       threshold is met; shown as the sign-in copy.
 *  §1 redesign         — renders the floating <DiscoverCard> (photographic
 *                       when the hero passes the image gates, tinted
 *                       typographic otherwise) with unified pointer-drag
 *                       physics (mouse + touch), keyboard arrows, verdict
 *                       stamps, undo, and button fallback.
 *
 * variant: 'fullscreen' (the /discover page) | 'band' (homepage taster)
 *          | 'onboarding' (inside the planner popup — the surrounding
 *            PlannerDiscoveryGate owns the sign-in / account chrome, so the
 *            deck suppresses its own counter, reflection and AuthModal here).
 * Identical mechanic in all three; only the chrome differs.
 *
 * onPicksChange(pickedIds): optional. Fired whenever the in-memory pick set
 *          changes, so a host (the planner gate) can mirror the picks out to
 *          the trip it is about to build.
 */
// hideHead: suppress the band's own kicker/title block when a parent section
// (e.g. the homepage "Make it yours" band) provides the masthead instead.
export default function DiscoverDeck({ variant = 'fullscreen', onPicksChange, hideHead = false }) {
  const t = useTranslations('discover')
  const locale = useLocale()
  const supabase = getAuthSupabase()
  const { location } = useLocation()
  const isOnboarding = variant === 'onboarding'

  const [queue, setQueue] = useState([])
  const [pickedIds, setPickedIds] = useState([])
  const [skippedIds, setSkippedIds] = useState([])
  const [reflection, setReflection] = useState(null)
  const [authed, setAuthed] = useState(null) // null = unknown
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState('')
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState(null)
  const [justKept, setJustKept] = useState(false)
  // The last committed swipe, restorable with one tap. Cleared on undo.
  const [lastAction, setLastAction] = useState(null)

  // Refs to read latest values inside async callbacks without stale closures.
  const queueRef = useRef([])
  const hasFetched = useRef(false)
  const locRef = useRef(null)
  // Active locale, read inside the async feed callback (like locRef) so the
  // server can overlay translated listing content for /ko without adding the
  // locale to loadFeed's deps (which would re-fire the mount effect).
  const localeRef = useRef(locale)
  // Verticals the user has actually been SHOWN (most recent last). Sent to the
  // feed so the server caps single-vertical runs across the whole session, not
  // just within one batch (otherwise re-rank-on-pick walls up one category).
  const servedRef = useRef([])
  const lastServedId = useRef(null)
  // Monotonic fetch sequence — an older response must never clobber the queue
  // a newer one built (rapid swipes can race rerank/append responses).
  const fetchSeq = useRef(0)
  const reducedMotion = useRef(false)
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { locRef.current = location }, [location])
  useEffect(() => { localeRef.current = locale }, [locale])
  useEffect(() => {
    reducedMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  }, [])

  // Mirror the live pick set out to a host (the planner onboarding gate), which
  // carries it into the trip the visitor is about to build.
  useEffect(() => { onPicksChange?.(pickedIds) }, [pickedIds, onPicksChange])

  const cardWrapRef = useRef(null)
  const stampPickRef = useRef(null)
  const stampSkipRef = useRef(null)
  // Pointer-drag state machine (mouse + touch unified). Lives in a ref and
  // mutates DOM styles directly so a 120Hz drag never re-renders React.
  const drag = useRef({ pointerId: null, startX: 0, startY: 0, dx: 0, active: false, lastX: 0, lastT: 0, vx: 0 })
  const suppressClick = useRef(false)

  const current = queue[0] || null
  const nextHint = queue[1] || null
  const deepHint = queue[2] || null
  const pickCount = pickedIds.length

  // Record each card the user is shown (its vertical) for the run cap.
  useEffect(() => {
    if (current && current.id !== lastServedId.current) {
      lastServedId.current = current.id
      if (current.vertical) servedRef.current.push(current.vertical)
    }
  }, [current])

  // No manual hero preloading: the two hint cards render (and therefore load)
  // the next heroes through the same optimizer pipeline the active card uses —
  // a raw-URL warmup here would fetch multi-MB originals and bypass it.

  // ── Feed fetch ──────────────────────────────────────────────────────
  const loadFeed = useCallback(async ({ picked, skipped, mode }) => {
    const q = queueRef.current
    // 'rerank' (after a pick) and 'init' always fetch; 'append' only when the
    // buffer is running low.
    if (mode === 'append' && q.length > 2) return
    // Never serve a card already swiped OR already sitting in the buffer.
    const queuedIds = q.map((l) => String(l.id))
    const seenIds = uniq([...picked, ...skipped, ...queuedIds])
    const loc = locRef.current

    const seq = ++fetchSeq.current
    setLoading(true)
    try {
      const res = await fetch('/api/discover/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickedIds: picked,
          skippedIds: skipped,
          seenIds,
          swipeCount: picked.length + skipped.length,
          limit: BATCH_LIMIT,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          recentVerticals: servedRef.current.slice(-12),
          locale: localeRef.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      // Superseded by a newer request — its response owns the queue now.
      if (seq !== fetchSeq.current) return
      if (!res.ok) {
        setError(data.error || t('errFeed'))
        return
      }
      setError('')
      setReflection(data.reflection || null)
      const incoming = Array.isArray(data.listings) ? data.listings : []

      setQueue((prev) => {
        let next
        if (mode === 'rerank' && prev.length > 0) {
          // Keep the card now on screen; re-rank everything behind it.
          const head = prev[0]
          const tail = incoming.filter((l) => String(l.id) !== String(head.id))
          next = [head, ...tail]
        } else if (mode === 'init') {
          next = incoming
        } else {
          // append — dedupe against what's already buffered
          const have = new Set(prev.map((l) => String(l.id)))
          next = [...prev, ...incoming.filter((l) => !have.has(String(l.id)))]
        }
        // Hard cap: never more than CLIENT_MAX_RUN of one vertical in a row.
        return capConsecutive(next, servedRef.current, CLIENT_MAX_RUN)
      })
    } catch {
      if (seq === fetchSeq.current) setError(t('errFeedRetry'))
    } finally {
      hasFetched.current = true
      if (seq === fetchSeq.current) setLoading(false)
    }
  }, [t])

  // ── Mount: auth state + first (cold-start) batch ────────────────────
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setAuthed(!!data?.user) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthed(!!session?.user)
    })
    loadFeed({ picked: [], skipped: [], mode: 'init' })
    return () => { active = false; subscription.unsubscribe() }
  }, [supabase, loadFeed])

  // Exhausted = we've fetched, nothing buffered, nothing loading.
  useEffect(() => {
    if (loading) return
    if (queue.length === 0 && hasFetched.current) setExhausted(true)
    else if (queue.length > 0) setExhausted(false)
  }, [queue, loading])

  // ── Persist a single pick immediately (logged-in path) ──────────────
  const persistOne = useCallback(async (listingId) => {
    try {
      const res = await fetch('/api/user/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setError(t('errSave'))
    }
  }, [t])

  // ── Direct-DOM helpers for the drag (no re-render per pointermove) ──
  const setCardTransform = useCallback((dx, transition = 'none') => {
    const el = cardWrapRef.current
    if (!el) return
    el.style.transition = transition
    el.style.transform = dx === 0 ? '' : `translateX(${dx}px) rotate(${dx * 0.045}deg)`
  }, [])

  const setStamps = useCallback((dx) => {
    const opacity = Math.min(Math.abs(dx) / 110, 1)
    if (stampPickRef.current) stampPickRef.current.style.opacity = dx > 0 ? String(opacity) : '0'
    if (stampSkipRef.current) stampSkipRef.current.style.opacity = dx < 0 ? String(opacity) : '0'
  }, [])

  // ── Swipe (pick / skip) ─────────────────────────────────────────────
  const swipe = useCallback((kind) => {
    if (!current || animating) return
    const card = current
    const id = String(card.id)
    const exitMs = reducedMotion.current ? 0 : EXIT_MS

    setDirection(kind === 'pick' ? 'right' : 'left')
    setAnimating(true)
    // Full-strength verdict stamp during the exit (button and keyboard paths
    // get the same feedback a drag builds up gradually).
    setStamps(kind === 'pick' ? 200 : -200)
    if (kind === 'pick') { try { navigator.vibrate?.(12) } catch { /* no haptics */ } }

    const newPicked = kind === 'pick' ? uniq([...pickedIds, id]) : pickedIds
    const newSkipped = kind === 'skip' ? uniq([...skippedIds, id]) : skippedIds
    if (kind === 'pick') setPickedIds(newPicked)
    else setSkippedIds(newSkipped)

    // Logged-in picks persist immediately; anonymous picks stay in memory.
    if (kind === 'pick' && authed) persistOne(id)

    window.setTimeout(() => {
      setAnimating(false)
      setDirection(null)
      setStamps(0)
      setLastAction({ card, kind })
      setQueue((prev) => capConsecutive(prev.slice(1), servedRef.current, CLIENT_MAX_RUN)) // advance + cap runs
      loadFeed({ picked: newPicked, skipped: newSkipped, mode: kind === 'pick' ? 'rerank' : 'append' })
    }, exitMs)
  }, [current, animating, pickedIds, skippedIds, authed, persistOne, loadFeed, setStamps])

  const handlePick = useCallback(() => swipe('pick'), [swipe])
  const handleSkip = useCallback(() => swipe('skip'), [swipe])

  // ── Undo — restore the last swiped card to the top of the deck ──────
  const undo = useCallback(() => {
    if (!lastAction || animating) return
    const { card, kind } = lastAction
    const id = String(card.id)
    setLastAction(null)
    if (kind === 'pick') {
      setPickedIds((ids) => ids.filter((x) => x !== id))
      // A logged-in pick already persisted — un-persist it.
      if (authed) {
        fetch('/api/user/saves', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_id: id }),
        }).catch(() => { /* the save simply stays; harmless */ })
      }
    } else {
      setSkippedIds((ids) => ids.filter((x) => x !== id))
    }
    // Roll back the served-history entry for the card about to re-show, so the
    // run cap doesn't count it twice (the record effect re-adds it on render).
    if (servedRef.current[servedRef.current.length - 1] === card.vertical) servedRef.current.pop()
    lastServedId.current = null
    setQueue((prev) => [card, ...prev.filter((c) => String(c.id) !== id)])
    setExhausted(false)
  }, [lastAction, animating, authed])

  // ── Pointer drag (mouse + touch unified; buttons remain the fallback) ─
  const onPointerDown = useCallback((e) => {
    if (animating || drag.current.pointerId !== null) return
    if (e.button != null && e.button !== 0) return
    // Reading the info panel is not a drag surface (its text scrolls).
    if (e.target.closest?.('.dd-info-panel')) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      active: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
    }
    suppressClick.current = false
    // Capture is deferred to onPointerMove (once the drag activates): capturing
    // here retargets pointerup — and therefore the derived click — to this
    // wrapper, which kills taps on the More tab and View listing link.
  }, [animating])

  const onPointerMove = useCallback((e) => {
    const d = drag.current
    if (d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.active) {
      // Vertical intent → let the page scroll (touch-action: pan-y).
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        d.pointerId = null
        return
      }
      if (Math.abs(dx) < DRAG_SLOP || Math.abs(dx) <= Math.abs(dy)) return
      d.active = true
      // A real drag — own the pointer now so moves keep arriving after the
      // cursor leaves the card. Capturing any earlier (on pointerdown) would
      // retarget the tap's click away from the More tab / View listing link.
      try { cardWrapRef.current?.setPointerCapture(e.pointerId) } catch { /* fine */ }
    }
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.vx = 0.7 * ((e.clientX - d.lastX) / dt) + 0.3 * d.vx
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    d.dx = dx
    setCardTransform(dx)
    setStamps(dx)
  }, [setCardTransform, setStamps])

  const endDrag = useCallback((e, cancelled) => {
    const d = drag.current
    if (d.pointerId !== e.pointerId) return
    const { dx, vx, active } = d
    d.pointerId = null
    try { cardWrapRef.current?.releasePointerCapture(e.pointerId) } catch { /* fine */ }
    if (!active) return
    // A real drag happened — the trailing click must not follow the link.
    suppressClick.current = true
    const commit = !cancelled && (
      Math.abs(dx) > SWIPE_THRESHOLD ||
      (Math.abs(vx) > FLICK_VELOCITY && Math.abs(dx) > FLICK_MIN_DX)
    )
    if (commit) {
      // swipe() takes over: React applies the exit transform, transitioning
      // from wherever the card currently sits.
      swipe(dx > 0 ? 'pick' : 'skip')
    } else {
      // Spring back.
      setCardTransform(0, reducedMotion.current ? 'none' : 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.2)')
      setStamps(0)
    }
  }, [swipe, setCardTransform, setStamps])

  const onPointerUp = useCallback((e) => endDrag(e, false), [endDrag])
  const onPointerCancel = useCallback((e) => endDrag(e, true), [endDrag])

  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  // ── Keyboard: ← skip · → pick (global on the dedicated page; focused
  //    deck elsewhere) ──────────────────────────────────────────────────
  const onDeckKeyDown = useCallback((e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (authModalOpen) return
    if (e.key === 'ArrowRight') { e.preventDefault(); handlePick() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); handleSkip() }
  }, [handlePick, handleSkip, authModalOpen])

  useEffect(() => {
    if (variant !== 'fullscreen') return
    window.addEventListener('keydown', onDeckKeyDown)
    return () => window.removeEventListener('keydown', onDeckKeyDown)
  }, [variant, onDeckKeyDown])

  // ── Sign-in flush (synchronous email/password path) ─────────────────
  const handleAuthSuccess = useCallback(async () => {
    setAuthed(true)
    setAuthModalOpen(false)
    // Flush every in-memory pick to user_saves in ONE batch via the existing
    // save path. This is the only seeding that happens — session-scoped, no
    // client-side persistence, no merge/orphan layer.
    if (pickedIds.length > 0) {
      try {
        const res = await fetch('/api/user/saves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_ids: pickedIds }),
        })
        if (!res.ok) throw new Error('flush failed')
        setJustKept(true)
        setError('')
      } catch {
        setError(t('errFlush'))
      }
    }
  }, [pickedIds, t])

  // returnTo for Google OAuth — a PATH, not the full URL: the auth callback
  // runs it through safeNextPath, which rejects absolute URLs and would
  // strand the visitor on /account. NOTE: OAuth reloads the page, so
  // in-memory picks made before sign-in are intentionally not carried across
  // (the spec forbids any anonymous state surviving a reload). The
  // synchronous email/password path above is the durable flush.
  const returnTo = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : undefined

  // ── Render helpers ──────────────────────────────────────────────────
  const isBand = variant === 'band'
  // Onboarding: the gate renders the tally, account invite and AuthModal, so the
  // deck stays a pure swipe surface (no duplicate sign-in chrome).
  const showReflection = !isOnboarding && !!reflection && authed === false && pickCount > 0

  const counterEl = (() => {
    if (isOnboarding) return null
    if (pickCount === 0) return null
    // key={pickCount} remounts the tally each pick so its pop animation replays.
    if (authed) {
      return (
        <p className="dd-counter dd-counter--static">
          <b key={pickCount}>{pickCount}</b> {justKept ? t('kept') : t('saved')}
        </p>
      )
    }
    // Anonymous: non-blocking inducement. When the reflection block is also
    // shown it carries the CTA, so here we drop to a plain tally.
    return (
      <button type="button" className="dd-counter" onClick={() => setAuthModalOpen(true)}>
        <b key={pickCount}>{pickCount}</b> {t('placesYoudVisit', { count: pickCount })}
        {!showReflection && <> · <u>{t('signInToKeepThem')}</u></>}
      </button>
    )
  })()

  // ── States ──────────────────────────────────────────────────────────
  if (error && !current) {
    return (
      <div className={`dd-stage dd-stage--${variant}`}>
        <div className="dd-empty" role="alert">
          <div className="dd-empty-rule" />
          <h2>{t('somethingWrong')}</h2>
          <p>{error}</p>
          <button className="dd-reflection-cta" onClick={() => loadFeed({ picked: pickedIds, skipped: skippedIds, mode: 'init' })}>
            {t('tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  if (!current && loading) {
    return (
      <div className={`dd-stage dd-stage--${variant}`}>
        <div className="dd-empty">
          <div className="dd-empty-rule" />
          <p style={{ fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{t('findingSomething')}</p>
        </div>
      </div>
    )
  }

  if (!current && exhausted) {
    return (
      <div className={`dd-stage dd-stage--${variant}`}>
        <div className="dd-empty">
          <div className="dd-empty-rule" />
          <h2>{pickCount > 0 ? t('goodListGoing') : t('seenThemAll')}</h2>
          <p>
            {pickCount > 0
              ? (authed ? t('placesSaved', { count: pickCount }) : t('placesYoudVisitSignIn', { count: pickCount }))
              : t('comeBackSoon')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {pickCount > 0 && authed === false && !isOnboarding && (
              <button className="dd-reflection-cta" onClick={() => setAuthModalOpen(true)}>{t('signInToKeepThem')}</button>
            )}
            {!isOnboarding && (
              <Link href="/explore" className="dd-btn dd-btn-skip" style={{ flex: '0 0 auto', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                {t('exploreNetwork')}
              </Link>
            )}
          </div>
        </div>
        {!isOnboarding && <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} returnTo={returnTo} />}
      </div>
    )
  }

  if (!current) return null

  const exitMs = reducedMotion.current ? 0 : EXIT_MS
  const cardExitStyle = animating
    ? {
        transform: direction === 'right' ? 'translateX(120%) rotate(8deg)' : 'translateX(-120%) rotate(-8deg)',
        opacity: 0,
        transition: `transform ${exitMs}ms ease, opacity ${exitMs}ms ease`,
      }
    : { transform: 'translateX(0) rotate(0)', opacity: 1, transition: `transform ${exitMs}ms ease, opacity ${exitMs}ms ease` }

  return (
    <div
      className={`dd-stage dd-stage--${variant}`}
      tabIndex={0}
      aria-label={t('deckAria')}
      onKeyDown={variant === 'fullscreen' ? undefined : onDeckKeyDown}
    >
      <div style={{ width: '100%' }}>
        {isBand && !hideHead && (
          <div className="dd-band-head">
            <p className="dd-band-kicker">{t('kicker')}</p>
            <h2 className="dd-band-title">{t('bandTitle')}</h2>
            <p className="dd-band-sub">{t('bandSub')}</p>
          </div>
        )}

        <div className={`dd-deck${isBand ? ' dd-deck--band' : ''}`}>
          {deepHint && (
            <div className="dd-hint dd-hint--2">
              <DiscoverCard key={deepHint.id} listing={deepHint} variant={variant} hint />
            </div>
          )}
          {nextHint && (
            <div className="dd-hint">
              <DiscoverCard key={nextHint.id} listing={nextHint} variant={variant} hint />
            </div>
          )}
          <div
            ref={cardWrapRef}
            className="dd-card-wrap"
            style={cardExitStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClickCapture={onClickCapture}
          >
            <DiscoverCard key={current.id} listing={current} variant={variant} />
            <span ref={stampSkipRef} className="dd-stamp dd-stamp--skip" aria-hidden="true">{t('stampSkip')}</span>
            <span ref={stampPickRef} className="dd-stamp dd-stamp--pick" aria-hidden="true">{t('stampPick')}</span>
          </div>
        </div>

        {/* What the deck is showing, for assistive tech. */}
        <p className="dd-sr-only" aria-live="polite">
          {current.name}{current.suburb ? `, ${current.suburb}` : current.region ? `, ${current.region}` : ''}
        </p>

        {/* Action row — authoritative fallback on every device. */}
        <div className={`dd-actions${isBand ? ' dd-actions--band' : ''}`}>
          <button className="dd-btn dd-btn-skip" onClick={handleSkip} disabled={animating || loading}>
            {t('next')}
          </button>
          <button
            className="dd-btn dd-btn-pick"
            onClick={handlePick}
            disabled={animating || loading}
          >
            {t('idVisitThis')}
          </button>
        </div>

        {lastAction && !animating && (
          <button type="button" className="dd-undo" onClick={undo}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
            {lastAction.kind === 'pick' ? t('undoPick') : t('undoSkip')}
          </button>
        )}

        <p className="dd-swipe-hint dd-swipe-hint--touch">{t('swipeHint')}</p>
        <p className="dd-swipe-hint dd-swipe-hint--pointer">{t('dragHint')}</p>

        {counterEl}

        {showReflection && (
          <div className={`dd-reflection${isBand ? ' dd-reflection--band' : ''}`}>
            <p>{reflection.descriptor || t('keepPlaces')}</p>
            <button className="dd-reflection-cta" onClick={() => setAuthModalOpen(true)}>
              {reflection.hasPattern ? t('signInKeepTaste') : t('signInKeepPlaces')}
            </button>
          </div>
        )}

        {error && current && (
          <p role="alert" style={{ textAlign: 'center', color: '#b91c1c', fontFamily: 'var(--font-body)', fontSize: 12, marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>

      {!isOnboarding && <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onAuthSuccess={handleAuthSuccess} returnTo={returnTo} />}
    </div>
  )
}
