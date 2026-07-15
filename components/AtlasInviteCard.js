'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useLocation } from './LocationProvider'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import AuthModal from './AuthModal'

/**
 * AtlasInviteCard — a small, dismissible corner card that invites visitors
 * to (a) share their location and (b) create a free account, in whichever
 * order suits where they already are.
 *
 * Deliberately NOT a modal: Google treats content-covering signup
 * interstitials as a negative ranking signal, and NN/g's login-wall research
 * says value has to come before the ask. So this waits for an engagement
 * signal (second pageview of the session), sits in the corner without
 * blocking anything, and leads with what the visitor gets.
 *
 * Geolocation is only ever requested from the button tap (browsers punish
 * no-gesture prompts with ~1/3 the grant rate), and the card's own copy is
 * the pre-permission primer. A hard browser-level deny is detected via the
 * Permissions API so we never show a dead button.
 *
 * Frequency rules: never on first pageview, at most one card per session,
 * dismissal suppresses it for 30 days, conversion (signed in + located)
 * retires it permanently.
 */

const DISMISS_KEY = 'atlas_invite_dismissed_at'
const DONE_KEY = 'atlas_invite_done' // sessionStorage — resolved this session
const PV_KEY = 'atlas_invite_pv' // sessionStorage pageview counter
const PV_PATH_KEY = 'atlas_invite_pv_path' // last counted pathname
const DISMISS_DAYS = 30
const MIN_PAGEVIEWS = 2
const ENTRANCE_DELAY_MS = 1400

// Route prefixes where an invitation is noise: auth flows, role dashboards,
// admin surfaces, council embeds.
const EXCLUDED_PREFIXES = [
  '/admin', '/council', '/newsroom', '/dashboard', '/login', '/auth',
  '/account', '/operators', '/embed',
]

function stripLocale(pathname) {
  return pathname.replace(/^\/(ko|zh)(?=\/|$)/, '') || '/'
}

function isExcludedRoute(pathname) {
  const path = stripLocale(pathname)
  return EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch { return false }
}

export default function AtlasInviteCard() {
  const t = useTranslations('invite')
  const pathname = usePathname()
  const { location, status, detectLocation } = useLocation()

  const [user, setUser] = useState(undefined) // undefined = not yet known
  const [permission, setPermission] = useState('prompt')
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false) // drives the slide-up
  const [authOpen, setAuthOpen] = useState(false)
  const [justAuthed, setJustAuthed] = useState(false)
  const [justLocated, setJustLocated] = useState(false)
  const prevStatusRef = useRef(status)
  // Whether the location flow was started from THIS card — the provider's
  // status is global (NearbySection shares it), and the card should only
  // narrate an attempt it initiated.
  const interactedRef = useRef(false)

  // ── Auth state (same idiom as Nav) ──
  useEffect(() => {
    const supabase = getAuthSupabase()
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) setUser(user ?? null)
    }).catch(() => { if (mounted) setUser(null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null)
    })
    return () => { mounted = false; sub?.subscription?.unsubscribe() }
  }, [])

  // ── Geolocation permission state (never show a button that can't work) ──
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let mounted = true
    let statusObj = null
    navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (!mounted) return
      statusObj = p
      setPermission(p.state)
      p.onchange = () => { if (mounted) setPermission(p.state) }
    }).catch(() => {})
    return () => { mounted = false; if (statusObj) statusObj.onchange = null }
  }, [])

  // ── Count pageviews per session (engagement signal) ──
  // Guarded by last-counted pathname so StrictMode's double effect run and
  // same-page reloads don't inflate the count.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PV_PATH_KEY) === pathname) return
      sessionStorage.setItem(PV_PATH_KEY, pathname)
      const n = Number(sessionStorage.getItem(PV_KEY) || 0) + 1
      sessionStorage.setItem(PV_KEY, String(n))
    } catch {}
  }, [pathname])

  // ── Watch for the detecting → ready transition = fresh grant ──
  // Only celebrate a grant this card asked for; the provider status is shared
  // with NearbySection, so a grant elsewhere shouldn't hijack the card copy.
  useEffect(() => {
    if (interactedRef.current && prevStatusRef.current === 'detecting' && status === 'ready') {
      setJustLocated(true)
    }
    prevStatusRef.current = status
  }, [status])

  const hasLocation = status === 'ready' && !!location

  // ── Eligibility ──
  useEffect(() => {
    if (user === undefined) return // wait for auth to resolve
    if (isExcludedRoute(pathname)) { setVisible(false); setEntered(false); return }

    // Already showing (e.g. mid-flow success states) — keep it up.
    if (visible) return

    let pv = 0
    try { pv = Number(sessionStorage.getItem(PV_KEY) || 0) } catch {}
    let done = false
    try { done = sessionStorage.getItem(DONE_KEY) === '1' } catch {}

    if (done || recentlyDismissed() || pv < MIN_PAGEVIEWS) return
    if (user && hasLocation) return // fully converted — nothing to invite
    if (user && permission === 'denied') return // nothing useful left to ask

    const timer = setTimeout(() => {
      setVisible(true)
      requestAnimationFrame(() => setEntered(true))
    }, ENTRANCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pathname, user, hasLocation, permission, visible])

  const markDone = useCallback(() => {
    try { sessionStorage.setItem(DONE_KEY, '1') } catch {}
  }, [])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    markDone()
    setVisible(false)
    setEntered(false)
  }, [markDone])

  // Close without the 30-day stamp — for links that resolve the invitation.
  const closeForSession = useCallback(() => {
    markDone()
    setVisible(false)
    setEntered(false)
  }, [markDone])

  const handleAuthSuccess = useCallback(() => {
    setJustAuthed(true)
    // Conversion via the card: retire the invitation, keep the card up for
    // its thanks / next-step state until the visitor closes it.
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    markDone()
  }, [markDone])

  if (!visible) return null

  const signedIn = !!user

  // ── Resolve which face of the card to show ──
  const interacted = interactedRef.current
  let stage
  if (interacted && status === 'detecting') stage = 'detecting'
  else if (interacted && status === 'denied') stage = 'denied'
  else if (interacted && status === 'overseas') stage = 'overseas'
  else if (interacted && status === 'unavailable') stage = 'unavailable'
  else if (justLocated) stage = 'located'
  else if (justAuthed) stage = signedIn && !hasLocation && permission !== 'denied' ? 'signedIn' : 'thanks'
  else if (hasLocation) stage = signedIn ? 'thanks' : 'accountPitch'
  else if (permission === 'denied') stage = signedIn ? 'thanks' : 'accountPitch'
  else stage = signedIn ? 'locationPitch' : 'fullPitch'

  const canAskLocation = permission !== 'denied'

  const locationButton = (
    <button
      type="button"
      onClick={() => { interactedRef.current = true; detectLocation() }}
      className="invite-card-primary"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
      {t('useMyLocation')}
    </button>
  )

  const accountButton = (primary) => (
    <button
      type="button"
      onClick={() => setAuthOpen(true)}
      className={primary ? 'invite-card-primary' : 'invite-card-secondary'}
    >
      {t('createAccount')}
    </button>
  )

  let title = null
  let body = null
  let actions = null
  let note = null

  if (stage === 'fullPitch') {
    title = t('titleBoth')
    body = t('bodyBoth')
    actions = <>{canAskLocation && locationButton}{accountButton(!canAskLocation)}</>
    if (canAskLocation) note = t('privacyNote')
  } else if (stage === 'locationPitch') {
    title = t('titleLocation')
    body = t('bodyLocation')
    actions = locationButton
  } else if (stage === 'accountPitch') {
    title = t('titleAccount')
    body = t('bodyAccount')
    actions = accountButton(true)
  } else if (stage === 'detecting') {
    body = t('detecting')
  } else if (stage === 'located') {
    title = t('locatedTitle')
    body = location?.name ? t('locatedBody', { town: location.name }) : t('locatedBodyNoName')
    actions = (
      <>
        <Link href="/near-me" className="invite-card-primary" onClick={closeForSession}>
          {t('seeNearby')}
        </Link>
        {!signedIn && accountButton(false)}
      </>
    )
    if (!signedIn) note = t('locatedAccountNudge')
  } else if (stage === 'signedIn') {
    title = t('signedInTitle')
    body = t('signedInBody')
    actions = locationButton
  } else if (stage === 'thanks') {
    title = t('thanksTitle')
    body = t('thanksBody')
  } else if (stage === 'denied') {
    title = t('deniedTitle')
    body = t('deniedBody')
    actions = (
      <Link href="/near-me" className="invite-card-primary" onClick={dismiss}>
        {t('browseBySuburb')}
      </Link>
    )
  } else if (stage === 'overseas') {
    title = t('overseasTitle')
    body = t('overseasBody')
    actions = (
      <Link href="/regions" className="invite-card-primary" onClick={dismiss}>
        {t('browseByRegion')}
      </Link>
    )
  } else if (stage === 'unavailable') {
    title = t('unavailableTitle')
    body = t('unavailableBody')
    actions = (
      <Link href="/near-me" className="invite-card-primary" onClick={dismiss}>
        {t('browseBySuburb')}
      </Link>
    )
  }

  return (
    <>
      <aside
        className={`invite-card${entered ? ' invite-card-entered' : ''}`}
        aria-label={t('kicker')}
      >
        <div className="invite-card-head">
          <p className="invite-card-kicker">{t('kicker')}</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('dismiss')}
            className="invite-card-close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {title && <h2 className="invite-card-title">{title}</h2>}
        {body && <p className="invite-card-body">{body}</p>}
        {actions && <div className="invite-card-actions">{actions}</div>}
        {note && <p className="invite-card-note">{note}</p>}
      </aside>
      {authOpen && (
        <AuthModal
          open
          initialMode="signup"
          onClose={() => setAuthOpen(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </>
  )
}
