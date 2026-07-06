'use client'

// ============================================================
// "Worth Finding This Week" — homepage section 3.
//
// Server-side the page hands us the cached editorial picks (lead + rail),
// which render exactly as they always have — that cached path is shared by
// every visitor and must never become per-user. The personalisation happens
// here, after hydration: when the visitor is signed in AND has already shared
// a location (LocationProvider hydrates a previously granted location from
// localStorage / their profile — we never trigger a fresh permission prompt),
// we ask /api/home/worth-finding for picks within 100 km, ranked by their
// taste profile when they've contributed to Discover. Anything short of that
// bar — signed out, no location, sparse area, API failure — leaves the
// editorial selection untouched.
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import LocalizedLink from '@/components/LocalizedLink'
import ScrollReveal from '@/components/ScrollReveal'
import { useLocation } from '@/components/LocationProvider'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { readDiscoveryPicks } from '@/lib/discover/sessionPicks'
import { getListingRegion } from '@/lib/regions'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'

const GOLD = 'var(--color-gold)'

const VERTICAL_CARD_COLORS = VERTICAL_CARD_TOKENS

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
  atlas: 'Journal',
}

const RADIUS_KM = 100

function firstSentence(text) {
  if (!text) return null
  const match = text.match(/^(.+?[.!?])\s/)
  return match ? match[1] : text.slice(0, 160)
}

export default function WorthFindingSection({ featured, locale, editionDate }) {
  const t = useTranslations('home')
  const tCards = useTranslations('cards')
  const { location, isReady } = useLocation()
  const supabase = getAuthSupabase()
  const [authed, setAuthed] = useState(false)
  const [personal, setPersonal] = useState(null)
  const fetchedRef = useRef(null)

  // Signed-in state, mirroring DiscoverDeck: initial getUser + auth listener.
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setAuthed(!!data?.user) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthed(!!session?.user)
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [supabase])

  // Personalise once both gates are open: signed in + location already shared.
  useEffect(() => {
    if (!authed || !isReady || !location) return
    const coordKey = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`
    if (fetchedRef.current === coordKey) return
    fetchedRef.current = coordKey

    const params = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng) })
    // Session Discover picks (onboarding deck) count as taste contributions
    // even before the persisted profile clears its confidence floor.
    const picks = readDiscoveryPicks()
    if (picks.length > 0) params.set('picks', picks.slice(0, 50).join(','))
    if (locale && locale !== 'en') params.set('locale', locale)

    fetch(`/api/home/worth-finding?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // A lead needs at least one rail card to compose the band; anything
        // thinner keeps the editorial selection.
        if (data?.listings?.length >= 2) setPersonal(data)
      })
      .catch(() => {})
  }, [authed, isReady, location, locale])

  const isPersonal = !!personal
  const picks = isPersonal ? personal.listings : featured
  if (!picks || picks.length === 0) return null

  const lead = picks[0]
  const rail = picks.slice(1, 4)
  const leadColors = VERTICAL_CARD_COLORS[lead.vertical] || { bg: '#333', text: '#FAF8F4' }
  // Editorial rows carry no joined region relations (kicker shows the vertical
  // alone — unchanged); the nearby RPC rows carry the plain-text region.
  const regionLabel = (l) => getListingRegion(l)?.name || (isPersonal ? l.region || null : null)
  const distanceLabel = (l) => {
    if (!isPersonal || l.distance_km == null) return null
    return tCards('km', { distance: l.distance_km < 10 ? l.distance_km.toFixed(1) : Math.round(l.distance_km) })
  }
  const kicker = (l) => {
    const parts = [localizeVerticalKicker(l.vertical, VERTICAL_LABELS[l.vertical] || l.vertical, locale)]
    const r = regionLabel(l)
    if (r) parts.push(r)
    const d = distanceLabel(l)
    if (d) parts.push(d)
    return parts.join('  ·  ')
  }
  const title = isPersonal
    ? (location?.name ? t('worthFindingNearTown', { town: location.name }) : t('worthFindingNearTitle'))
    : t('worthFindingTitle')
  const intro = isPersonal
    ? t(personal.tasteApplied ? 'worthFindingNearIntroTaste' : 'worthFindingNearIntro', { radius: RADIUS_KM })
    : t('worthFindingIntro')
  // Swapped-in cards mount after ScrollReveal has already observed the
  // original children, so they self-reveal instead of waiting on an observer
  // that will never fire for them.
  const revealClass = isPersonal ? 'reveal revealed' : 'reveal'

  return (
    <ScrollReveal as="section" style={{
      paddingBlock: '80px',
      background: 'linear-gradient(180deg, #FBF8F2 0%, #F8F4EB 100%)',
      borderTop: '1px solid rgba(28,26,23,0.06)',
      borderBottom: '1px solid rgba(28,26,23,0.08)',
    }}>
      <div className="max-w-5xl mx-auto px-6 sm:px-12">
        <div className="reveal" style={{ marginBottom: '36px', maxWidth: '560px' }}>
          <p className="section-dateline" style={{ marginBottom: '16px' }}>
            {t('thisWeekDateline', { date: editionDate })}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(30px, 4vw, 50px)', color: 'var(--color-ink)',
            lineHeight: 1.1, marginBottom: '12px',
          }}>
            {title}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            color: 'var(--color-muted)', margin: 0,
          }}>
            {intro}
          </p>
        </div>

        {/* LEAD + RAIL: the first listing is the dominant cover story (1.6fr,
            full-bleed ground or its photo); the rest stack as a compact
            coloured rail (1fr). Scale contrast carries hierarchy. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
          {/* LEAD */}
          <LocalizedLink
            key={lead.id}
            href={`/place/${lead.slug}`}
            className={`${revealClass} group listing-card block overflow-hidden`}
            data-reveal-index={1}
            style={{
              background: lead.hero_image_url ? '#1A1A1A' : leadColors.bg,
              border: '1px solid transparent',
              borderRadius: 'var(--radius-lg)',
              display: 'flex', flexDirection: 'column',
              minHeight: 'clamp(300px, 40vw, 440px)',
            }}
          >
            {lead.hero_image_url && (
              <div className="overflow-hidden" style={{ flex: '1 1 55%', minHeight: '180px' }}>
                <img
                  src={lead.hero_image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                />
              </div>
            )}
            <div style={{ padding: '30px 30px 32px', display: 'flex', flexDirection: 'column', flex: lead.hero_image_url ? '0 0 auto' : 1 }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: GOLD, marginBottom: '10px',
              }}>
                {kicker(lead)}
              </p>
              {!lead.hero_image_url && <div style={{ flex: 1, minHeight: 20 }} />}
              <h3 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(26px, 3.2vw, 36px)', lineHeight: 1.12,
                color: '#FAF8F4', marginBottom: '12px',
              }}>
                {lead.name}
              </h3>
              {lead.description && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
                  lineHeight: 1.65, color: 'rgba(250,248,244,0.62)', margin: 0, maxWidth: '46ch',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {firstSentence(lead.description)}
                </p>
              )}
            </div>
          </LocalizedLink>

          {/* RAIL */}
          {rail.length > 0 && (
            <div className="flex flex-col gap-4">
              {rail.map((listing, ri) => {
                const colors = VERTICAL_CARD_COLORS[listing.vertical] || { bg: '#333', text: '#FAF8F4' }
                return (
                  <LocalizedLink
                    key={listing.id}
                    href={`/place/${listing.slug}`}
                    className={`${revealClass} group listing-card block overflow-hidden`}
                    data-reveal-index={ri + 2}
                    style={{
                      background: colors.bg,
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-card)',
                      padding: '18px 20px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      flex: '1 1 0', minHeight: '104px',
                    }}
                  >
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: 'rgba(250,248,244,0.5)', margin: 0,
                    }}>
                      {kicker(listing)}
                    </p>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400,
                      fontSize: '19px', lineHeight: 1.22,
                      color: colors.text, margin: '8px 0 0',
                    }}>
                      {listing.name}
                    </h3>
                  </LocalizedLink>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollReveal>
  )
}
