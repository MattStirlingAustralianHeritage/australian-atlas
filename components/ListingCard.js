import { getVerticalUrl } from '@/lib/verticalUrl'
import VerticalBadge from '@/components/VerticalBadge'
import { isApprovedImageSource } from '@/lib/image-utils'
import { getListingRegion } from '@/lib/regions'

// ============================================================
// ListingCard — Bespoke typographic card replacing all photography
// Used across the entire Australian Atlas Network.
// ============================================================

export const VERTICAL_TOKENS = {
  sba:          { bg: '#3D2B1F', text: '#FAF8F4', label: 'Small Batch Atlas' },
  collection:   { bg: '#2D3436', text: '#FAF8F4', label: 'Culture Atlas' },
  craft:        { bg: '#4A3728', text: '#FAF8F4', label: 'Craft Atlas' },
  fine_grounds: { bg: '#2C1810', text: '#FAF8F4', label: 'Fine Grounds Atlas' },
  rest:         { bg: '#1B2631', text: '#FAF8F4', label: 'Rest Atlas' },
  field:        { bg: '#1E3A2F', text: '#FAF8F4', label: 'Field Atlas' },
  corner:       { bg: '#3B2F2F', text: '#FAF8F4', label: 'Corner Atlas' },
  found:        { bg: '#2F2B26', text: '#FAF8F4', label: 'Found Atlas' },
  table:        { bg: '#3A2E1F', text: '#FAF8F4', label: 'Table Atlas' },
  portal:       { bg: '#0f0e0c', text: '#FAF8F4', label: 'Australian Atlas' },
}

const CATEGORY_LABELS = {
  winery: 'Winery', distillery: 'Distillery', brewery: 'Brewery',
  cidery: 'Cidery', non_alcoholic: 'Non-Alcoholic', meadery: 'Meadery', sake_brewery: 'Sake Brewery',
  archive: 'Archive', cultural_centre: 'Cultural Centre', gallery: 'Gallery',
  botanical_garden: 'Botanical Garden', heritage_site: 'Heritage Site', museum: 'Museum',
  ceramics_clay: 'Ceramics & Clay', visual_art: 'Visual Art', jewellery_metalwork: 'Jewellery & Metalwork',
  textile_fibre: 'Textile & Fibre', wood_furniture: 'Wood & Furniture', glass: 'Glass', printmaking: 'Printmaking',
  roaster: 'Roaster', cafe: 'Cafe',
  boutique_hotel: 'Boutique Hotel', guesthouse: 'Guesthouse', bnb: 'B&B',
  farm_stay: 'Farm Stay', glamping: 'Glamping', cottage: 'Cottage',
  swimming_hole: 'Swimming Hole', waterfall: 'Waterfall', lookout: 'Lookout',
  gorge: 'Gorge', coastal_walk: 'Coastal Walk', hot_spring: 'Hot Spring',
  cave: 'Cave', national_park: 'National Park',
  wildlife_zoo: 'Wildlife & Zoo', bush_walk: 'Bush Walk',
  botanic_garden: 'Botanic Garden', nature_reserve: 'Nature Reserve',
  bookshop: 'Bookshop', record_store: 'Record Store', homewares: 'Homewares',
  clothing: 'Clothing', gift_shop: 'Gift Shop', general_store: 'General Store',
  stationery: 'Stationery', art_supplies: 'Art Supplies', lifestyle: 'Lifestyle',
  vintage_clothing: 'Vintage Clothing', vintage_furniture: 'Vintage Furniture',
  vintage_store: 'Vintage Store', antiques: 'Antiques', op_shop: 'Op Shop',
  books_ephemera: 'Books & Ephemera', art_objects: 'Art Objects', market: 'Market',
  farm_gate: 'Farm Gate', artisan_producer: 'Artisan Producer',
  specialty_retail: 'Specialty Retail', destination: 'Destination', restaurant: 'Restaurant',
}


function formatCategory(cat) {
  if (!cat) return null
  return CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function splitName(name) {
  if (!name) return ['', '']
  const words = name.split(' ')
  if (words.length <= 2) return [name, '']
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

// ── SVG topographic curves for Field Atlas ──

function TopoLines({ color }) {
  return (
    <svg
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', opacity: 0.07,
      }}
      viewBox="0 0 400 280"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <path d="M-20 180 Q80 120 200 160 Q320 200 420 140" stroke={color} strokeWidth="1.2" />
      <path d="M-20 220 Q100 170 220 200 Q340 230 420 180" stroke={color} strokeWidth="1" />
      <path d="M-20 260 Q120 210 240 240 Q360 270 420 220" stroke={color} strokeWidth="0.8" />
    </svg>
  )
}

// ── TypographicCard: the pure design element ──

export function TypographicCard({
  name,
  vertical = 'portal',
  category,
  region,
  state,
  aspectRatio = '4/5',
  showVerticalTag = false,
}) {
  const tokens = VERTICAL_TOKENS[vertical] || VERTICAL_TOKENS.portal
  const isField = vertical === 'field'
  const categoryLabel = formatCategory(category)
  const topLine = showVerticalTag
    ? `${tokens.label}${categoryLabel ? `  \u00B7  ${categoryLabel}` : ''}`.toUpperCase()
    : categoryLabel
      ? categoryLabel.toUpperCase()
      : null

  const [line1, line2] = splitName(name)
  const bottomLine = [region, state].filter(Boolean).join(', ').toUpperCase()

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio,
        borderRadius: '10px',
        overflow: 'hidden',
        background: tokens.bg,
        color: tokens.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
      }}
    >
      {/* Dot grid texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
        opacity: 0.08,
        pointerEvents: 'none',
      }} />
      {isField && <TopoLines color={tokens.text} />}

      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {topLine && (
          <p style={{
            fontFamily: 'var(--font-body, "DM Sans", system-ui)',
            fontSize: '9px', fontWeight: 500, letterSpacing: '0.15em',
            textTransform: 'uppercase', opacity: 0.4,
            margin: '0 0 1.25rem', lineHeight: 1.4,
          }}>
            {topLine}
          </p>
        )}
        {!topLine && <div style={{ height: '0.5rem' }} />}

        {/* Rule line */}
        <div style={{
          width: 20, height: 1,
          background: tokens.text, opacity: 0.3,
          margin: '0 auto 0.875rem',
        }} />

        {/* Name line 1 */}
        <p style={{
          fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
          fontSize: 19, fontWeight: 400, margin: 0, lineHeight: 1.25, letterSpacing: '0.01em',
        }}>
          {line1}
        </p>
        {/* Name line 2 (italic) */}
        {line2 && (
          <p style={{
            fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
            fontSize: 19, fontWeight: 400, fontStyle: 'italic',
            margin: '0.2rem 0 0', lineHeight: 1.25, letterSpacing: '0.01em',
          }}>
            {line2}
          </p>
        )}

        <div style={{ height: '1.25rem' }} />

        {bottomLine && (
          <p style={{
            fontFamily: 'var(--font-body, "DM Sans", system-ui)',
            fontSize: 9, fontWeight: 400, letterSpacing: '0.15em',
            textTransform: 'uppercase', opacity: 0.4,
            margin: 0, lineHeight: 1.4,
          }}>
            {bottomLine}
          </p>
        )}
      </div>
    </div>
  )
}

// ── VerticalIdentityCard: for homepage sections representing a vertical ──

export function VerticalIdentityCard({ vertical, tagline, aspectRatio = '4/3' }) {
  const tokens = VERTICAL_TOKENS[vertical] || VERTICAL_TOKENS.portal
  const isField = vertical === 'field'

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio,
        borderRadius: '8px',
        overflow: 'hidden',
        background: tokens.bg,
        color: tokens.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem 1.25rem',
        textAlign: 'center',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
        opacity: 0.1,
        pointerEvents: 'none',
      }} />
      {isField && <TopoLines color={tokens.text} />}

      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <p style={{
          fontFamily: 'var(--font-body, "DM Sans", system-ui)',
          fontSize: 8, fontWeight: 500, letterSpacing: '0.14em',
          textTransform: 'uppercase', opacity: 0.55,
          margin: '0 0 1rem', lineHeight: 1.4,
        }}>
          {tokens.label.toUpperCase()}
        </p>

        <div style={{
          width: 20, height: 1,
          background: tokens.text, opacity: 0.35,
          margin: '0 auto 0.75rem',
        }} />

        <p style={{
          fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
          fontSize: 17, fontWeight: 400, margin: 0, lineHeight: 1.3,
        }}>
          {tokens.label}
        </p>
        {tagline && (
          <p style={{
            fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
            fontSize: 17, fontWeight: 400, fontStyle: 'italic',
            margin: '0.15rem 0 0', lineHeight: 1.3,
          }}>
            {tagline}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main ListingCard: the full linked card used in grids ──

export default function ListingCard({ listing, meta, linkToVertical = false }) {
  const derivedMeta = meta || {}
  if (!derivedMeta.entity_type && listing.vertical === 'fine_grounds' && listing.source_id) {
    if (listing.source_id.startsWith('cafe_')) derivedMeta.entity_type = 'cafe'
    else if (listing.source_id.startsWith('roaster_')) derivedMeta.entity_type = 'roaster'
  }

  const url = linkToVertical
    ? getVerticalUrl(listing.vertical, listing.slug, derivedMeta)
    : `/place/${listing.slug}`

  const isAtlasSelect = listing.editors_pick
  const showFeatured = !isAtlasSelect && listing.is_featured && listing.is_claimed
  const hasRealImage = listing.hero_image_url && isApprovedImageSource(listing.hero_image_url)
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const region = getListingRegion(listing)

  return (
    <a
      href={url}
      {...(linkToVertical ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group listing-card block overflow-hidden"
      style={{ borderRadius: '10px', border: '0.5px solid var(--color-border)', position: 'relative' }}
    >
      <div style={{ position: 'relative' }}>
        {hasRealImage ? (
          <div style={{ aspectRatio: '4/5', overflow: 'hidden', position: 'relative' }}>
            <img
              src={listing.hero_image_url}
              alt={listing.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Gradient overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.65) 100%)',
              pointerEvents: 'none',
            }} />
            {/* Vertical label top-left */}
            <p style={{
              position: 'absolute', top: 14, left: 14, zIndex: 2,
              fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 500,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)',
            }}>
              {tokens.label}
            </p>
            {/* Text overlay */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '1.25rem', zIndex: 2,
            }}>
              <h3
                className="group-hover:opacity-90 transition-opacity"
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 400,
                  fontSize: '18px', lineHeight: 1.25, color: '#fff', margin: 0,
                }}
              >
                {listing.name}
              </h3>
              {(region?.name || listing.state) && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '11px',
                  color: 'rgba(255,255,255,0.6)', margin: '4px 0 0',
                  letterSpacing: '0.04em',
                }}>
                  {[region?.name, listing.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <TypographicCard
            name={listing.name}
            vertical={listing.vertical}
            category={derivedMeta.entity_type || derivedMeta.producer_type || derivedMeta.category}
            region={region?.name}
            state={listing.state}
            aspectRatio="4/5"
            showVerticalTag={true}
          />
        )}

        {/* Vertical badge — smaller, more subtle */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 3 }}>
          <VerticalBadge vertical={listing.vertical} size="sm" />
        </div>

        {/* Curation badges */}
        {isAtlasSelect && (
          <span style={{
            position: 'absolute', top: 12, right: 12, zIndex: 3,
            fontSize: '10px', fontWeight: 500, padding: '4px 10px',
            borderRadius: 100, color: '#fff', background: 'var(--color-ink)',
            backdropFilter: 'blur(4px)',
          }}>
            Atlas Select
          </span>
        )}
        {showFeatured && (
          <span style={{
            position: 'absolute', top: 12, right: 12, zIndex: 3,
            fontSize: '10px', fontWeight: 500, padding: '4px 10px',
            borderRadius: 100, color: '#fff', background: 'var(--color-accent)',
            backdropFilter: 'blur(4px)',
          }}>
            Featured
          </span>
        )}
      </div>
    </a>
  )
}
