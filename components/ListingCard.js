'use client'

import { useState } from 'react'
import { getVerticalUrl } from '@/lib/verticalUrl'
import VerticalBadge, { VERTICAL_STYLES } from '@/components/VerticalBadge'

export default function ListingCard({ listing, meta, linkToVertical = false }) {
  const [imgError, setImgError] = useState(false)

  // Derive meta from source_id when not explicitly provided (e.g. Fine Grounds cafe vs roaster)
  const derivedMeta = meta || {}
  if (!derivedMeta.entity_type && listing.vertical === 'fine_grounds' && listing.source_id) {
    if (listing.source_id.startsWith('cafe_')) derivedMeta.entity_type = 'cafe'
    else if (listing.source_id.startsWith('roaster_')) derivedMeta.entity_type = 'roaster'
  }

  // Default: link to native /place/[slug] page on the portal
  // Pass linkToVertical={true} to link out to the canonical vertical site instead
  const url = linkToVertical
    ? getVerticalUrl(listing.vertical, listing.slug, derivedMeta)
    : `/place/${listing.slug}`
  const vertStyle = VERTICAL_STYLES[listing.vertical]

  // Badge hierarchy: Atlas Select (editors_pick) > Featured (is_featured + is_claimed)
  const isAtlasSelect = listing.editors_pick
  const showFeatured = !isAtlasSelect && listing.is_featured && listing.is_claimed

  const showImage = listing.hero_image_url && !imgError

  return (
    <a
      href={url}
      {...(linkToVertical ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group block bg-[var(--color-card-bg)] rounded-xl overflow-hidden transition-colors duration-200"
      style={{ border: '0.5px solid var(--color-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.28)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
    >
      {/* Image */}
      <div className="aspect-[16/10] overflow-hidden relative">
        {showImage ? (
          <img
            src={listing.hero_image_url}
            alt={listing.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          /* Typographic fallback card — vertical-colored background with name */
          <div
            className="w-full h-full flex flex-col items-center justify-center px-6 gap-2"
            style={{
              backgroundColor: vertStyle ? vertStyle.bg : '#F1EFE8',
              background: vertStyle
                ? `linear-gradient(135deg, ${vertStyle.bg} 0%, ${vertStyle.bg}dd 100%)`
                : 'linear-gradient(135deg, #F1EFE8 0%, #E8E4DA 100%)',
            }}
          >
            <svg className="w-6 h-6 opacity-30" style={{ color: vertStyle?.text || 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span
              className="text-center leading-snug"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '17px',
                color: vertStyle ? vertStyle.text : 'var(--color-muted)',
                opacity: 0.65,
              }}
            >
              {listing.name}
            </span>
          </div>
        )}

        {/* Vertical badge — bottom-left overlay on image */}
        <div className="absolute bottom-3 left-3">
          <VerticalBadge vertical={listing.vertical} />
        </div>

        {/* Curation badge — top-right: Atlas Select > Featured */}
        {isAtlasSelect && (
          <span className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-full text-white backdrop-blur-sm" style={{ background: 'var(--color-ink)' }}>
            Atlas Select
          </span>
        )}
        {showFeatured && (
          <span className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-accent)] text-white backdrop-blur-sm">
            Featured
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="leading-tight group-hover:text-[var(--color-accent)] transition-colors"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '15px',
          }}
        >
          {listing.name}
        </h3>
        {(listing.region || listing.state) && (
          <p
            className="mt-1"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '12px',
              color: 'var(--color-muted)',
            }}
          >
            {[listing.region, listing.state].filter(Boolean).join(', ')}
          </p>
        )}
        {listing.description && (
          <p
            className="mt-2 line-clamp-2 leading-relaxed"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '13px',
              color: 'var(--color-muted)',
            }}
          >
            {listing.description}
          </p>
        )}

        {/* CTA arrow */}
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
          View listing
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </a>
  )
}
