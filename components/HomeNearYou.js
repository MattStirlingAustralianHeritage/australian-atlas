'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import LocalizedLink from '@/components/LocalizedLink'
import { useLocation } from '@/components/LocationProvider'
import { subTypeLabel } from '@/lib/subTypeLabels'
import { getVerticalBadge, VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { MapPin, LocateFixed, BadgeCheck } from 'lucide-react'

const GOLD = 'var(--color-gold)'

// ─────────────────────────────────────────────────────────────────
// "Near you" — the signed-in shelf that replaced the ingredients
// grid. Renders only when the server confirmed a session (page.js
// gates the mount), and only becomes a collection once the reader's
// location is known: from their profile, their last visit, or the
// one-tap browser prompt. Listings come from /api/nearby (adaptive
// radius, capped per vertical), which already prefers featured and
// operator-managed venues — so the shelf is the good stuff close by,
// not just the closest anything.
// ─────────────────────────────────────────────────────────────────
export default function HomeNearYou() {
  const t = useTranslations('home')
  const locale = useLocale()
  const { location, status, detectLocation, isReady } = useLocation()
  const [listings, setListings] = useState(null) // null = not fetched yet
  const [radiusUsed, setRadiusUsed] = useState(null)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef(null)

  // Refetch only when the reader actually moves (~100 m), not on
  // every context identity change.
  const locKey = useMemo(() => (
    location ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : null
  ), [location])

  useEffect(() => {
    if (!isReady || !locKey) return
    const [lat, lng] = locKey.split(',')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setFailed(false)
    fetch(`/api/nearby?lat=${lat}&lng=${lng}&adaptive=true&min_results=6&limit=9&max_per_vertical=2`, {
      signal: controller.signal,
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`nearby ${res.status}`))))
      .then(data => {
        setListings(Array.isArray(data.listings) ? data.listings : [])
        setRadiusUsed(data.radius_used || null)
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [isReady, locKey])

  // A signed-in reader outside Australia gets the map, not an empty
  // shelf; a failed fetch keeps quiet rather than apologising loudly.
  const overseas = status === 'overseas'
  const denied = status === 'denied' || status === 'unavailable'
  const detecting = status === 'detecting' || (isReady && listings === null && !failed)
  const empty = isReady && Array.isArray(listings) && listings.length === 0

  const placeName = location?.name || null

  return (
    <div>
      <div className="reveal" style={{ maxWidth: '640px', marginBottom: '32px' }}>
        <p className="section-dateline" style={{ marginBottom: '14px' }}>
          {t('nearYouKicker')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(28px, 3.6vw, 46px)', color: 'var(--color-ink)', lineHeight: 1.1,
          margin: 0,
        }}>
          {t('nearYouTitle')}
        </h2>
        <p className="mt-3" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15.5px',
          color: 'var(--color-muted)', margin: '12px 0 0', lineHeight: 1.65,
        }}>
          {placeName
            ? t('nearYouIntroPlace', { place: placeName })
            : t('nearYouIntro')}
        </p>
      </div>

      {/* ── The invitation: no location yet ── */}
      {!isReady && !detecting && !overseas && !denied && (
        <div className="reveal near-you-invite">
          <MapPin size={20} strokeWidth={1.6} aria-hidden="true" style={{ color: GOLD }} />
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
            lineHeight: 1.6, color: 'var(--color-ink)', margin: 0, maxWidth: '46ch',
          }}>
            {t('nearYouInviteBody')}
          </p>
          <button type="button" className="near-you-detect" onClick={detectLocation}>
            <LocateFixed size={14} strokeWidth={2} aria-hidden="true" />
            {t('nearYouInviteCta')}
          </button>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
            color: 'var(--color-muted)', margin: 0,
          }}>
            {t('nearYouPrivacyNote')}
          </p>
        </div>
      )}

      {/* ── Denied / unavailable / overseas: point at the map instead ── */}
      {(denied || overseas) && (
        <p className="reveal" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
          color: 'var(--color-muted)', margin: 0, lineHeight: 1.6,
        }}>
          {overseas ? t('nearYouOverseas') : t('nearYouDenied')}{' '}
          <LocalizedLink href="/map" style={{
            fontWeight: 500, color: 'var(--color-ink)',
            borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
          }}>
            {t('nearYouOpenMap')} <span style={{ color: GOLD }}>&rarr;</span>
          </LocalizedLink>
        </p>
      )}

      {/* ── Detecting / fetching: the shelf as a shimmer ── */}
      {detecting && !overseas && !denied && (
        <div className="near-you-grid" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`near-you-skel${i === 0 ? ' near-you-hero' : ''}`} />
          ))}
        </div>
      )}

      {/* ── The shelf ── */}
      {isReady && Array.isArray(listings) && listings.length > 0 && (
        <>
          <div className="near-you-grid">
            {listings.map((l, i) => {
              const tokens = VERTICAL_CARD_TOKENS[l.vertical] || VERTICAL_CARD_TOKENS.portal
              const kind = subTypeLabel(l.vertical, l.sub_type) ||
                localizeVerticalKicker(l.vertical, getVerticalBadge(l.vertical), locale)
              const hero = i === 0
              return (
                <LocalizedLink
                  key={l.id}
                  href={`/place/${l.slug}`}
                  className={`near-you-card${hero ? ' near-you-hero' : ''}${l.is_claimed ? ' is-claimed' : ''}`}
                  style={{ background: tokens.bg, color: tokens.text }}
                >
                  {l.image_url && (
                    <>
                      {/* A dead image URL falls back to the typographic
                          ground rather than a broken-image glyph. */}
                      <img
                        src={l.image_url}
                        alt=""
                        loading="lazy"
                        className="near-you-photo"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                      <span aria-hidden="true" className="near-you-scrim" />
                    </>
                  )}
                  <div className="near-you-card-top">
                    <span
                      className="near-you-kind"
                      style={l.image_url
                        ? { color: 'rgba(250,248,244,0.85)' }
                        : { color: VERTICAL_ACCENTS[l.vertical] || GOLD }}
                    >
                      {kind}
                    </span>
                    {l.is_claimed && (
                      <span
                        className="day-claimed-chip"
                        role="img"
                        aria-label={t('dayClaimedChip')}
                        title={t('dayClaimedChip')}
                      >
                        <BadgeCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="near-you-card-foot">
                    <h3 className="near-you-name">{l.name}</h3>
                    {hero && l.description && (
                      <p className="near-you-desc">{l.description}</p>
                    )}
                    <p className="near-you-meta">
                      <MapPin size={11} strokeWidth={1.8} aria-hidden="true" />
                      {typeof l.distance_km === 'number'
                        ? t('nearYouDistance', { km: l.distance_km < 1 ? '<1' : Math.round(l.distance_km) })
                        : (l.region || l.state || '')}
                    </p>
                  </div>
                </LocalizedLink>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', flexWrap: 'wrap', marginTop: '26px' }}>
            <LocalizedLink href="/near-me" className="hover:opacity-80 transition-opacity" style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
              color: 'var(--color-ink)', borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
            }}>
              {t('nearYouSeeAll')} <span style={{ color: GOLD }}>&rarr;</span>
            </LocalizedLink>
            {radiusUsed && (
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '12px',
                color: 'var(--color-muted)',
              }}>
                {t('nearYouRadius', { km: radiusUsed })}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Nothing close enough ── */}
      {(empty || failed) && !detecting && !overseas && !denied && isReady && (
        <p className="reveal" style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px',
          color: 'var(--color-muted)', margin: 0, lineHeight: 1.6,
        }}>
          {t('nearYouEmpty')}{' '}
          <LocalizedLink href="/map" style={{
            fontWeight: 500, color: 'var(--color-ink)',
            borderBottom: '1px solid var(--color-gold)', paddingBottom: 1,
          }}>
            {t('nearYouOpenMap')} <span style={{ color: GOLD }}>&rarr;</span>
          </LocalizedLink>
        </p>
      )}
    </div>
  )
}
