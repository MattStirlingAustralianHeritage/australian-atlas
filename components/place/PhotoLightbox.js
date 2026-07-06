'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Full-screen photo viewer for a listing's photo library.
 *
 * Replaces the modal half of the old GalleryLightbox with a richer viewer:
 * a thumbnail filmstrip for direct navigation, swipe gestures on touch,
 * adjacent-image preloading so arrows feel instant, and a warm-ink backdrop
 * (the brand's near-black, not pure black) so the room matches the house.
 *
 * Controlled by the parent: render it only when open, pass the startIndex,
 * and take it down via onClose. Keyboard: Esc closes, arrows navigate.
 */
export default function PhotoLightbox({ images, name, startIndex = 0, onClose }) {
  const t = useTranslations('placePanels')
  const [index, setIndex] = useState(startIndex)
  const [loaded, setLoaded] = useState(false)
  const count = images.length
  const closeRef = useRef(null)
  const openerRef = useRef(null)
  const filmstripRef = useRef(null)
  const touchX = useRef(null)

  const goTo = useCallback(i => {
    setIndex(prev => {
      const next = (i + count) % count
      if (next !== prev) setLoaded(false)
      return next
    })
  }, [count])
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  // Keyboard nav + body scroll lock; restore focus to the opener on close.
  useEffect(() => {
    openerRef.current = document.activeElement
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      if (openerRef.current?.focus) openerRef.current.focus()
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, next, prev])

  // Preload the neighbours so arrow/swipe steps land instantly.
  useEffect(() => {
    if (count < 2) return
    for (const i of [index + 1, index - 1]) {
      const img = new window.Image()
      img.src = images[(i + count) % count]
    }
  }, [index, images, count])

  // Keep the active thumbnail in view as the reader steps through.
  useEffect(() => {
    const strip = filmstripRef.current
    const active = strip?.querySelector('[data-active="true"]')
    if (active?.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }, [index])

  function onTouchStart(e) { touchX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) next(); else prev()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('galleryLabel', { name })}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(20, 18, 14, 0.96)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Top bar — venue name, counter, close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '14px 16px',
        }}
      >
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.65)', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
          {count > 1 && (
            <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
              {index + 1} / {count}
            </span>
          )}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('closeGallery')}
          style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white',
            fontSize: 22, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          &times;
        </button>
      </div>

      {count > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); prev() }} aria-label={t('previousPhoto')} style={arrowStyle('left')}>
          &#8249;
        </button>
      )}

      {/* Stage */}
      <figure
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          margin: 0, padding: '0 16px',
          maxWidth: '100vw',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // Leave room for the top bar and the filmstrip.
          height: count > 1 ? 'calc(100dvh - 170px)' : 'calc(100dvh - 130px)',
        }}
      >
        <img
          key={images[index]}
          src={images[index]}
          alt={t('photoAlt', { name, index: index + 1 })}
          onLoad={() => setLoaded(true)}
          style={{
            maxWidth: 'min(1280px, calc(100vw - 32px))', maxHeight: '100%',
            objectFit: 'contain', borderRadius: 8,
            boxShadow: '0 12px 48px rgba(0,0,0,0.55)',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease',
          }}
        />
      </figure>

      {count > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); next() }} aria-label={t('nextPhoto')} style={arrowStyle('right')}>
          &#8250;
        </button>
      )}

      {/* Filmstrip */}
      {count > 1 && (
        <div
          ref={filmstripRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
            display: 'flex', gap: 8, overflowX: 'auto',
            padding: '10px 16px 14px',
            scrollbarWidth: 'none',
            // Centre short strips; long strips scroll from the left edge.
            justifyContent: 'safe center',
          }}
        >
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              data-active={i === index ? 'true' : 'false'}
              onClick={() => goTo(i)}
              aria-label={t('viewPhotoOf', { name, index: i + 1, count })}
              aria-current={i === index}
              style={{
                width: 72, height: 50, flexShrink: 0,
                padding: 0, cursor: 'pointer',
                borderRadius: 6, overflow: 'hidden',
                border: i === index ? '2px solid var(--color-gold)' : '2px solid transparent',
                opacity: i === index ? 1 : 0.55,
                transition: 'opacity 0.15s ease',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function arrowStyle(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 16, zIndex: 2,
    width: 48, height: 48, borderRadius: '50%',
    border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white',
    fontSize: 30, lineHeight: 1, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
