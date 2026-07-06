'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import PhotoLightbox from './PhotoLightbox'

/**
 * The listing's photo library — the in-page half of the gallery perk.
 *
 * Replaces the old uniform thumbnail grid with an editorial plate: the first
 * photo runs large (two columns, two rows), the rest sit as 4:3 tiles beside
 * and below it. At most five tiles show; when the library is deeper, the
 * last tile carries a "+N" scrim and the lightbox filmstrip takes over from
 * there. Clicking any tile opens the shared PhotoLightbox at that photo.
 */
const MAX_TILES = 5

export default function PlacePhotoLibrary({ images, name }) {
  const t = useTranslations('placePanels')
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const count = images.length
  const visible = count > MAX_TILES ? images.slice(0, MAX_TILES) : images
  const hiddenCount = count - visible.length

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {visible.map((url, i) => {
          const isLead = i === 0
          const isOverflowTile = hiddenCount > 0 && i === visible.length - 1
          return (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={isOverflowTile
                ? t('viewAllPhotos', { count })
                : t('viewPhotoOf', { name, index: i + 1, count })}
              className={`relative overflow-hidden rounded-lg group ${isLead ? 'col-span-2 sm:row-span-2 aspect-[3/2] sm:aspect-auto' : 'aspect-[4/3]'}`}
              style={{
                padding: 0, cursor: 'pointer', width: '100%',
                border: '1px solid var(--color-border)',
                background: 'var(--color-cream)',
              }}
            >
              <img
                src={url}
                alt={t('photoAlt', { name, index: i + 1 })}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              {isOverflowTile && (
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(28,26,23,0.55)' }}
                >
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400,
                    fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', color: '#fff',
                  }}>
                    +{hiddenCount + 1}
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          images={images}
          name={name}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
