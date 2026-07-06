'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import OptimizedImage from '@/components/OptimizedImage'
import PhotoLightbox from './PhotoLightbox'

/**
 * Photo-first hero for claimed (paid) listings — the operator's own photo
 * library promoted to the top of the page instead of a lone hero image.
 *
 * Desktop: an editorial mosaic — the hero at two-thirds width with two
 * gallery photos stacked beside it (a 60/40 split when there are only two
 * photos), hairline gaps in the page background so it reads as one plate.
 * Mobile: a swipeable full-bleed carousel with a photo counter.
 * Every photo opens the shared PhotoLightbox at its own index.
 *
 * The title overlay matches the unclaimed hero exactly (same type, same
 * gradient) so claimed pages stay in the family — the photography is the
 * distinction, not a new identity.
 */
export default function PlacePhotoHero({ photos, name, nameKo, overline, location }) {
  const t = useTranslations('placePanels')
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [slide, setSlide] = useState(0)
  const trackRef = useRef(null)
  const count = photos.length
  const sideCount = count >= 3 ? 2 : 1

  function onTrackScroll() {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== slide) setSlide(Math.max(0, Math.min(count - 1, i)))
  }

  // Shared title overlay — non-interactive so clicks fall through to the
  // photo buttons underneath.
  const titleOverlay = (
    <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 2 }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,26,23,0.6) 0%, rgba(28,26,23,0.15) 40%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-12">
        <div className="max-w-4xl mx-auto">
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 500,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)', marginBottom: '12px',
          }}>
            {overline}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1,
            color: '#fff', margin: 0,
          }}>
            {name}
          </h1>
          {nameKo && (
            <p lang="ko" style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontStyle: 'italic',
              fontSize: 'clamp(1.05rem, 2.4vw, 1.6rem)', lineHeight: 1.2,
              color: 'rgba(255,255,255,0.82)', margin: '6px 0 0',
            }}>
              {nameKo}
            </p>
          )}
          {location && (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300,
              color: 'rgba(255,255,255,0.7)', marginTop: '8px',
            }}>
              {location}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  const viewAllPill = (
    <button
      type="button"
      onClick={() => setLightboxIndex(0)}
      className="absolute inline-flex items-center gap-2 rounded-full transition-opacity hover:opacity-90"
      style={{
        bottom: 16, right: 16, zIndex: 3,
        padding: '8px 14px', border: 'none', cursor: 'pointer',
        background: 'rgba(250,248,245,0.94)', color: 'var(--color-ink)',
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
        letterSpacing: '0.02em', boxShadow: '0 2px 10px rgba(28,26,23,0.25)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
      {t('viewAllPhotos', { count })}
    </button>
  )

  return (
    <>
      {/* ── Desktop mosaic ── */}
      <div
        className="atlas-hero-band w-full relative overflow-hidden hidden md:grid"
        style={{
          gridTemplateColumns: sideCount === 2 ? '2fr 1fr' : '3fr 2fr',
          gridTemplateRows: sideCount === 2 ? '1fr 1fr' : '1fr',
          gap: 2, background: 'var(--color-bg)',
        }}
      >
        <div className="relative" style={{ gridRow: sideCount === 2 ? 'span 2' : 'auto' }}>
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={t('viewPhotoOf', { name, index: 1, count })}
            className="absolute inset-0 w-full h-full overflow-hidden"
            style={{ padding: 0, border: 'none', cursor: 'pointer', background: 'var(--color-cream)' }}
          >
            <OptimizedImage
              src={photos[0]}
              alt={t('photoAlt', { name, index: 1 })}
              priority
              sizes="(min-width: 768px) 62vw, 100vw"
              className="w-full h-full object-cover absolute inset-0"
            />
          </button>
          {titleOverlay}
        </div>
        {photos.slice(1, 1 + sideCount).map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setLightboxIndex(i + 1)}
            aria-label={t('viewPhotoOf', { name, index: i + 2, count })}
            className="relative overflow-hidden"
            style={{ padding: 0, border: 'none', cursor: 'pointer', background: 'var(--color-cream)' }}
          >
            <OptimizedImage
              src={url}
              alt={t('photoAlt', { name, index: i + 2 })}
              sizes="(min-width: 768px) 38vw, 100vw"
              className="w-full h-full object-cover absolute inset-0"
            />
          </button>
        ))}
        {viewAllPill}
      </div>

      {/* ── Mobile carousel ── */}
      <div className="atlas-hero-band w-full relative overflow-hidden md:hidden">
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          className="absolute inset-0 flex overflow-x-auto"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
        >
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={t('viewPhotoOf', { name, index: i + 1, count })}
              className="relative h-full w-full flex-shrink-0"
              style={{ scrollSnapAlign: 'center', padding: 0, border: 'none', background: 'var(--color-cream)' }}
            >
              <img
                src={url}
                alt={t('photoAlt', { name, index: i + 1 })}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
        {titleOverlay}
        {count > 1 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 3,
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(28,26,23,0.55)', color: 'rgba(255,255,255,0.9)',
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.06em',
            }}
          >
            {slide + 1} / {count}
          </span>
        )}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          images={photos}
          name={name}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
