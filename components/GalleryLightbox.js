'use client'

import { useState, useEffect, useCallback } from 'react'

export default function GalleryLightbox({ images, name }) {
  const [openIndex, setOpenIndex] = useState(null)
  const isOpen = openIndex !== null
  const count = images.length

  const close = useCallback(() => setOpenIndex(null), [])
  const next = useCallback(() => setOpenIndex(i => (i + 1) % count), [count])
  const prev = useCallback(() => setOpenIndex(i => (i - 1 + count) % count), [count])

  // Keyboard nav + body scroll lock while the lightbox is open.
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, close, next, prev])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(i)}
            aria-label={`View ${name} — photo ${i + 1} of ${count}`}
            className="overflow-hidden rounded-lg"
            style={{
              aspectRatio: '4 / 3',
              border: '1px solid var(--color-border)',
              background: 'var(--color-cream)',
              padding: 0,
              cursor: 'pointer',
              display: 'block',
              width: '100%',
            }}
          >
            <img
              src={url}
              alt={`${name} — photo ${i + 1}`}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} gallery`}
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            aria-label="Close gallery"
            style={{
              position: 'absolute', top: 16, right: 16, zIndex: 2,
              width: 44, height: 44, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white',
              fontSize: 22, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            &times;
          </button>

          {count > 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); prev() }}
              aria-label="Previous photo"
              style={arrowStyle('left')}
            >
              &#8249;
            </button>
          )}

          <figure
            onClick={e => e.stopPropagation()}
            style={{
              margin: 0, maxWidth: '90vw', maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}
          >
            <img
              src={images[openIndex]}
              alt={`${name} — photo ${openIndex + 1}`}
              style={{
                maxWidth: '90vw', maxHeight: count > 1 ? '80vh' : '86vh',
                objectFit: 'contain', borderRadius: 8,
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
            />
            {count > 1 && (
              <figcaption style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
                color: 'rgba(255,255,255,0.8)', letterSpacing: '0.04em',
              }}>
                {openIndex + 1} / {count}
              </figcaption>
            )}
          </figure>

          {count > 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); next() }}
              aria-label="Next photo"
              style={arrowStyle('right')}
            >
              &#8250;
            </button>
          )}
        </div>
      )}
    </>
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
