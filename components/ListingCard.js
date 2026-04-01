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

export default function ListingCard({ listing, meta }) {
  const url = getVerticalUrl(listing.vertical, listing.slug, meta)
  const badge = getVerticalBadge(listing.vertical)
  const badgeColor = BADGE_COLORS[listing.vertical] || 'bg-gray-100 text-gray-800'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-[var(--color-card-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image */}
      <div className="aspect-[16/10] bg-gray-100 overflow-hidden relative">
        {listing.hero_image_url ? (
          <img
            src={listing.hero_image_url}
            alt={listing.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)] text-sm">
            No image
          </div>
        )}
        <span className={`absolute top-3 left-3 text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>
          {badge}
        </span>
        {listing.is_featured && (
          <span className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-sage)] text-white">
            Featured
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-[family-name:var(--font-serif)] text-lg font-semibold leading-tight group-hover:text-[var(--color-sage)] transition-colors">
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
      </div>
    </a>
  )
}
