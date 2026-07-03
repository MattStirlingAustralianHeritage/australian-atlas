'use client'

// NearbyExplorer — the place-page "Nearby on Australian Atlas" surface.
//
// Pairs the embedded Mapbox map with a ranked, distance-stamped list of the
// nearest places. The list is the important half: it makes the nearby venues
// crawlable (SSR-less canvas pins are invisible to search engines), keyboard-
// navigable and screen-reader-legible, and lets a reader scan what's around
// without clicking every pin. Hovering or focusing a list row opens the
// matching pin's popup on the map (focusListingId → MapClient), so the two
// halves stay in sync.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import EmbeddedNearbyMap from '@/components/EmbeddedNearbyMap'
import { getVerticalBrandColour, getVerticalBadge } from '@/lib/verticalUrl'
import { subTypeLabel } from '@/lib/subTypeLabels'
import { isApprovedImageSource } from '@/lib/image-utils'

const PRIMARY = '#5f8a7e'
const LIST_MAX = 8

function fmtDistance(km, t) {
  if (km == null || Number.isNaN(km)) return null
  if (km < 1) return t('underOneKmAway')
  return t('kmAway', { distance: km < 10 ? km.toFixed(1) : Math.round(km) })
}

export default function NearbyExplorer({
  listings = [],
  initialBounds = null,
  highlightListingId = null,
  radiusKm = null,
  accent = PRIMARY,
  originName = '',
}) {
  const t = useTranslations('cards')
  const [focusId, setFocusId] = useState(null)

  // The list shows neighbours only — drop the current listing (it's the map's
  // highlighted "you are here" pin) — ranked nearest-first.
  const neighbours = listings
    .filter(l => l.id !== highlightListingId)
    .sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity))
  const shown = neighbours.slice(0, LIST_MAX)
  const total = neighbours.length

  return (
    <div className="nbx-grid">
      <div
        className="atlas-nearby-map rounded-xl overflow-hidden nbx-map"
        style={{ border: '1px solid var(--color-border)' }}
        role="region"
        aria-label={radiusKm
          ? t('mapAriaLabelRadius', { origin: originName || t('thisPlace'), radius: radiusKm })
          : t('mapAriaLabel', { origin: originName || t('thisPlace') })}
      >
        <EmbeddedNearbyMap
          prefilteredListings={listings}
          initialBounds={initialBounds}
          highlightListingId={highlightListingId}
          focusListingId={focusId}
        />
      </div>

      {shown.length > 0 ? (
        <div className="nbx-list-wrap">
          <ul
            className="nbx-list"
            aria-label={t('nearbyPlacesNearestFirst')}
            onMouseLeave={() => setFocusId(null)}
          >
            {shown.map(l => {
              const color = getVerticalBrandColour(l.vertical) || PRIMARY
              const category = subTypeLabel(l.vertical, l.sub_type) || getVerticalBadge(l.vertical)
              const dist = fmtDistance(l._dist, t)
              const hasImg = isApprovedImageSource(l.hero_image_url)
              return (
                <li key={l.id}>
                  <a
                    href={`/place/${l.slug}`}
                    className="nbx-card"
                    onMouseEnter={() => setFocusId(l.id)}
                    onFocus={() => setFocusId(l.id)}
                  >
                    {hasImg ? (
                      <img className="nbx-thumb" src={l.hero_image_url} alt="" loading="lazy" />
                    ) : (
                      <span className="nbx-thumb nbx-thumb-fallback" style={{ background: `${color}18`, color }} aria-hidden="true">
                        {(l.name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="nbx-body">
                      <span className="nbx-name">
                        <span className="nbx-dot" style={{ background: color }} aria-hidden="true" />
                        {l.name}
                      </span>
                      <span className="nbx-meta">
                        {category}{dist ? <> · <span className="nbx-dist">{dist}</span></> : null}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
          {total > 0 && (
            <div className="nbx-foot">
              {total > shown.length
                ? (radiusKm
                    ? t('nearestOfPlacesRadius', { shown: shown.length, total, radius: radiusKm })
                    : t('nearestOfPlaces', { shown: shown.length, total }))
                : (radiusKm
                    ? t('placesNearbyRadius', { count: total, radius: radiusKm })
                    : t('placesNearby', { count: total }))}
            </div>
          )}
        </div>
      ) : (
        <div className="nbx-empty">
          {t('noOtherListingsNearby')}
        </div>
      )}

      <style>{`
        .nbx-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
        .nbx-list-wrap { display: flex; flex-direction: column; min-width: 0; }
        .nbx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .nbx-card {
          display: flex; gap: 11px; align-items: center; padding: 8px;
          border: 1px solid var(--color-border); border-radius: 10px;
          background: var(--color-paper, #fff); text-decoration: none;
          transition: border-color 0.15s, background 0.15s, transform 0.15s;
        }
        .nbx-card:hover, .nbx-card:focus-visible {
          border-color: ${accent}; background: ${accent}0a; outline: none;
          transform: translateY(-1px);
        }
        .nbx-thumb { width: 54px; height: 54px; flex-shrink: 0; border-radius: 8px; object-fit: cover; display: block; }
        .nbx-thumb-fallback {
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 22px; line-height: 1;
        }
        .nbx-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .nbx-name {
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          color: var(--color-ink); line-height: 1.25;
          display: flex; align-items: center; gap: 7px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nbx-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .nbx-meta { font-family: var(--font-body); font-size: 12px; color: var(--color-muted); line-height: 1.3; }
        .nbx-dist { color: ${accent}; font-weight: 500; }
        .nbx-foot { margin-top: 10px; font-family: var(--font-body); font-size: 12px; color: var(--color-muted); }
        .nbx-empty {
          display: flex; align-items: center; justify-content: center; text-align: center;
          font-family: var(--font-body); font-size: 13px; color: var(--color-muted);
          border: 1px dashed var(--color-border); border-radius: 12px; padding: 20px;
        }
        @media (max-width: 899px) {
          .nbx-grid { grid-template-columns: 1fr; }
          .nbx-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .nbx-empty { min-height: 0; }
        }
        @media (max-width: 520px) {
          .nbx-list { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
