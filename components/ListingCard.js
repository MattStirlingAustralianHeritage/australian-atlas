import { getVerticalUrl, getVerticalBadge } from '@/lib/verticalUrl'

const BADGE_COLORS = {
  sba: 'bg-amber-100 text-amber-800',
  collection: 'bg-purple-100 text-purple-800',
  craft: 'bg-rose-100 text-rose-800',
  fine_grounds: 'bg-orange-100 text-orange-800',
  rest: 'bg-blue-100 text-blue-800',
  field: 'bg-green-100 text-green-800',
  corner: 'bg-cyan-100 text-cyan-800',
  found: 'bg-yellow-100 text-yellow-800',
  table: 'bg-red-100 text-red-800',
}

const VERTICAL_ACCENT = {
  sba: '#C49A3C',
  collection: '#7A6B8A',
  craft: '#C1603A',
  fine_grounds: '#8A7055',
  rest: '#5A8A9A',
  field: '#4A7C59',
  corner: '#5F8A7E',
  found: '#D4956A',
  table: '#C4634F',
}

const VERTICAL_ICON = {
  sba: 'M12 2C8 2 4.5 5.5 4.5 10c0 3 1.5 5.5 3.5 7l4 4 4-4c2-1.5 3.5-4 3.5-7C19.5 5.5 16 2 12 2zm0 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
  collection: 'M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z',
  craft: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  fine_grounds: 'M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3',
  rest: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  field: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.3 6.8L22 12l-6.7 2.2L13 21l-2.3-6.8L4 12l6.7-2.2L13 3z',
  corner: 'M12 6.253v13m0-13C10.8 5.4 8.2 4 5.3 4 3.8 4 2.4 4.3 1.2 4.9A1 1 0 000 5.8v12.5a1 1 0 001.3.9C2.4 18.7 3.8 18.4 5.3 18.4c2.9 0 5.5 1.4 6.7 2.2 1.2-.8 3.8-2.2 6.7-2.2 1.5 0 2.9.3 4.1.9a1 1 0 001.2-.9V5.8a1 1 0 00-1.2-.9C21.6 4.3 20.2 4 18.7 4c-2.9 0-5.5 1.4-6.7 2.3z',
  found: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  table: 'M3 3h18v18H3V3zm3 6h12M3 15h18M9 9v12',
}

function FallbackImage({ vertical }) {
  const accent = VERTICAL_ACCENT[vertical] || '#5f8a7e'
  const icon = VERTICAL_ICON[vertical]
  const badge = getVerticalBadge(vertical)

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${accent}18 0%, ${accent}30 50%, ${accent}12 100%)`,
      }}
    >
      <svg
        className="w-10 h-10 mb-2 opacity-30"
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={icon} />
      </svg>
      <span
        className="text-xs font-medium opacity-40 tracking-wider uppercase"
        style={{ color: accent }}
      >
        {badge}
      </span>
    </div>
  )
}

export default function ListingCard({ listing, meta }) {
  const url = getVerticalUrl(listing.vertical, listing.slug, meta)
  const badge = getVerticalBadge(listing.vertical)
  const badgeColor = BADGE_COLORS[listing.vertical] || 'bg-gray-100 text-gray-800'
  const accent = VERTICAL_ACCENT[listing.vertical] || '#5f8a7e'

  // Only show Featured badge if genuinely featured AND claimed
  const showFeatured = listing.is_featured && listing.is_claimed

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-[var(--color-card-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
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
          <FallbackImage vertical={listing.vertical} />
        )}

        {/* Vertical badge — bottom-left overlay on image */}
        <span
          className="absolute bottom-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm"
          style={{
            backgroundColor: `${accent}dd`,
            color: '#fff',
          }}
        >
          {badge}
        </span>

        {/* Featured badge — top-right, only for genuinely featured+claimed */}
        {showFeatured && (
          <span className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-sage)] text-white backdrop-blur-sm">
            Featured
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold leading-tight group-hover:text-[var(--color-sage)] transition-colors">
          {listing.name}
        </h3>
        {(listing.region || listing.state) && (
          <p className="text-xs text-[var(--color-muted)] mt-1">
            {[listing.region, listing.state].filter(Boolean).join(', ')}
          </p>
        )}
        {listing.description && (
          <p className="text-sm text-[var(--color-muted)] mt-2 line-clamp-2 leading-relaxed">
            {listing.description}
          </p>
        )}

        {/* CTA arrow */}
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--color-sage)] opacity-0 group-hover:opacity-100 transition-opacity">
          View listing
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </a>
  )
}
