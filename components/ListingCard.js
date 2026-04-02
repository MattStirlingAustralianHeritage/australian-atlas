'use client'

import { getVerticalUrl } from '@/lib/verticalUrl'
import VerticalBadge, { VERTICAL_STYLES } from '@/components/VerticalBadge'

export default function ListingCard({ listing, meta }) {
  const url = getVerticalUrl(listing.vertical, listing.slug, meta)
  const vertStyle = VERTICAL_STYLES[listing.vertical]

  // Only show Featured badge if genuinely featured AND claimed
  const showFeatured = listing.is_featured && listing.is_claimed

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-[var(--color-card-bg)] rounded-xl overflow-hidden transition-colors duration-200"
      style={{ border: '0.5px solid var(--color-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(28,26,23,0.28)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
    >
      {/* Image */}
      <div className="aspect-[16/10] overflow-hidden relative">
        {listing.hero_image_url ? (
          <img
            src={listing.hero_image_url}
            alt={listing.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          /* Typographic fallback card */
          <div
            className="w-full h-full flex items-center justify-center px-6"
            style={{
              backgroundColor: vertStyle ? vertStyle.bg : '#F1EFE8',
            }}
          >
            <span
              className="text-center leading-snug"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '20px',
                color: vertStyle ? vertStyle.text : 'var(--color-muted)',
                opacity: 0.7,
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

        {/* Featured badge — top-right, only for genuinely featured+claimed */}
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
