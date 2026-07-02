import { getVerticalUrl, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import VerticalBadge from '@/components/VerticalBadge'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { getListingRegion } from '@/lib/regions'

// ============================================================
// ListingCard — Bespoke typographic card replacing all photography
// Used across the entire Australian Atlas Network.
// ============================================================

export const VERTICAL_TOKENS = VERTICAL_CARD_TOKENS

const CATEGORY_LABELS = {
  winery: 'Winery', distillery: 'Distillery', brewery: 'Brewery',
  cidery: 'Cidery', non_alcoholic: 'Non-Alcoholic', meadery: 'Meadery', sake_brewery: 'Sake Brewery',
  archive: 'Archive', cultural_centre: 'Cultural Centre', gallery: 'Gallery',
  botanical_garden: 'Botanical Garden', heritage_site: 'Heritage Site', museum: 'Museum',
  sculpture_park: 'Sculpture Park', cinema: 'Cinema', drive_in: 'Drive-In Cinema',
  live_music_venue: 'Live Music Venue', comedy_club: 'Comedy Club', theatre: 'Theatre',
  ceramics_clay: 'Ceramics & Clay', visual_art: 'Visual Art', jewellery_metalwork: 'Jewellery & Metalwork',
  textile_fibre: 'Textile & Fibre', wood_furniture: 'Wood & Furniture', glass: 'Glass', printmaking: 'Printmaking',
  leathermaker: 'Leatherwork', shoemaker: 'Shoemaking',
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
  size = 'card',
  aspectRatio = '4/5',
  showVerticalTag = false,
  align = 'center',
  ground,
  textColor,
  eyebrow,
  mobile = false,
}) {
  const tokens = VERTICAL_TOKENS[vertical] || VERTICAL_TOKENS.portal
  // Callers may override the ground/text (e.g. the events surface drives the
  // ground off event category, not vertical). Defaults preserve the listing
  // treatment exactly.
  const bg = ground || tokens.bg
  const text = textColor || tokens.text
  const isField = vertical === 'field'
  const isHero = size === 'hero'
  const categoryLabel = formatCategory(category)

  // ── Poster variant: eyebrow top-left, serif title lower-left, cream on the
  // ground. Used by the events surface; listings use the centred default
  // below (unchanged). ──
  if (align === 'poster') {
    const posterEyebrow = (eyebrow != null ? eyebrow : categoryLabel) || null
    const padding = isHero ? 'clamp(1.75rem, 5vw, 4rem)' : '1.25rem'
    const eyebrowSize = isHero ? 12 : 10
    const titleSize = isHero ? 'clamp(2.25rem, 5.5vw, 4rem)' : 'clamp(1.4rem, 4.5vw, 1.9rem)'
    const titleLineHeight = isHero ? 1.06 : 1.15
    const posterStyle = {
      position: 'relative',
      ...(isHero ? {} : { aspectRatio }),
      borderRadius: isHero ? 0 : 'var(--radius-card)',
      overflow: 'hidden',
      background: bg,
      color: text,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding,
      textAlign: 'left',
    }
    return (
      <div className={isHero ? 'atlas-hero-band' : undefined} style={posterStyle}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, ${text} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
          opacity: isHero ? 0.06 : 0.08,
          pointerEvents: 'none',
        }} />
        {isField && <TopoLines color={text} />}

        {/* Eyebrow — category, top-left */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          {posterEyebrow && (
            <p style={{
              fontFamily: 'var(--font-body, "DM Sans", system-ui)',
              fontSize: eyebrowSize, fontWeight: 500, letterSpacing: '0.15em',
              textTransform: 'uppercase', opacity: isHero ? 0.7 : 0.6,
              margin: 0, lineHeight: 1.4,
            }}>
              {posterEyebrow}
            </p>
          )}
        </div>

        {/* Title — display serif, roman, lower-left (poster style) */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: isHero ? 880 : '100%' }}>
          {isHero ? (
            <h1 style={{
              fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
              fontSize: titleSize, fontWeight: 400, fontStyle: 'normal', margin: 0,
              lineHeight: titleLineHeight, letterSpacing: '0.005em',
            }}>
              {name}
            </h1>
          ) : (
            <p style={{
              fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
              fontSize: titleSize, fontWeight: 400, fontStyle: 'normal', margin: 0,
              lineHeight: titleLineHeight, letterSpacing: '0.005em',
            }}>
              {name}
            </p>
          )}
        </div>
      </div>
    )
  }
  const topLine = showVerticalTag
    ? `${tokens.label}${categoryLabel ? `  \u00B7  ${categoryLabel}` : ''}`.toUpperCase()
    : categoryLabel
      ? categoryLabel.toUpperCase()
      : null

  const [line1, line2] = splitName(name)
  const bottomLine = [region, state].filter(Boolean).join(', ').toUpperCase()

  // Hero height is delegated to the .atlas-hero-band class so it can use
  // breakpoint-aware media queries the inline style can't carry. The class
  // is defined once on the consumer page (e.g. /place/[slug]).
  const containerStyle = isHero
    ? {
        position: 'relative',
        width: '100%',
        borderRadius: 0,
        overflow: 'hidden',
        background: tokens.bg,
        color: tokens.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
      }
    : {
        position: 'relative',
        aspectRatio,
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: tokens.bg,
        color: tokens.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
      }

  const tagFontSize = isHero ? 11 : 9
  const tagOpacity = isHero ? 0.5 : 0.4
  const tagMarginBottom = isHero ? '1.5rem' : '1.25rem'
  const ruleWidth = isHero ? 32 : 20
  const ruleOpacity = isHero ? 0.35 : 0.3
  const nameFontSize = isHero ? 'clamp(2rem, 5vw, 3.5rem)' : 19
  const nameLineHeight = isHero ? 1.1 : 1.25
  const nameLetterSpacing = isHero ? '0.005em' : '0.01em'
  const dotOpacity = isHero ? 0.06 : 0.08
  const contentMaxWidth = isHero ? 720 : '100%'
  const bottomGap = isHero ? '1.75rem' : '1.25rem'

  return (
    <div className={isHero ? 'atlas-hero-band' : undefined} style={containerStyle}>
      {/* Dot grid texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${tokens.text} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
        opacity: dotOpacity,
        pointerEvents: 'none',
      }} />
      {isField && <TopoLines color={tokens.text} />}

      {/* Ghost initial — the venue's first letter at display scale, barely
          above the ground (hero only). Same device as the discover cards and
          the footer wordmark: quiet drama, zero information cost. */}
      {isHero && name && (
        <span aria-hidden="true" style={{
          position: 'absolute',
          right: 'clamp(-40px, -2vw, 0px)',
          bottom: '-0.28em',
          fontFamily: 'var(--font-display, Georgia)',
          fontStyle: 'italic',
          fontWeight: 380,
          fontSize: 'clamp(260px, 38vw, 560px)',
          lineHeight: 1,
          color: tokens.text,
          opacity: 0.05,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: contentMaxWidth }}>
        {topLine && (
          <p style={{
            fontFamily: 'var(--font-body, "DM Sans", system-ui)',
            fontSize: tagFontSize, fontWeight: 500, letterSpacing: '0.15em',
            textTransform: 'uppercase', opacity: tagOpacity,
            margin: `0 0 ${tagMarginBottom}`, lineHeight: 1.4,
          }}>
            {topLine}
          </p>
        )}
        {!topLine && <div style={{ height: '0.5rem' }} />}

        {/* Rule line */}
        <div style={{
          width: ruleWidth, height: 1,
          background: tokens.text, opacity: ruleOpacity,
          margin: '0 auto 0.875rem',
        }} />

        {/* Name — wrapped in <h1> at hero size so the venue name acts as the
            page heading; cards use a non-heading element so they don't pollute
            the page outline when many cards share a grid. */}
        {isHero ? (
          <h1 style={{
            fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
            fontSize: nameFontSize, fontWeight: 400, margin: 0,
            lineHeight: nameLineHeight, letterSpacing: nameLetterSpacing,
          }}>
            <span style={{ display: 'block' }}>{line1}</span>
            {line2 && (
              <span style={{ display: 'block', fontStyle: 'italic', marginTop: '0.2rem' }}>
                {line2}
              </span>
            )}
          </h1>
        ) : (
          <>
            <p style={{
              fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
              fontSize: nameFontSize, fontWeight: 400, margin: 0,
              lineHeight: nameLineHeight, letterSpacing: nameLetterSpacing,
            }}>
              {line1}
            </p>
            {line2 && (
              <p style={{
                fontFamily: 'var(--font-display, "Playfair Display", Georgia)',
                fontSize: nameFontSize, fontWeight: 400, fontStyle: 'italic',
                margin: '0.2rem 0 0', lineHeight: nameLineHeight, letterSpacing: nameLetterSpacing,
              }}>
                {line2}
              </p>
            )}
          </>
        )}

        <div style={{ height: bottomGap }} />

        {bottomLine && (
          <p style={{
            fontFamily: 'var(--font-body, "DM Sans", system-ui)',
            fontSize: tagFontSize, fontWeight: 400, letterSpacing: '0.15em',
            textTransform: 'uppercase', opacity: tagOpacity,
            margin: 0, lineHeight: 1.4,
          }}>
            {bottomLine}{mobile ? '  ·  Mobile' : ''}
          </p>
        )}
        {!bottomLine && mobile && (
          <p style={{
            fontFamily: 'var(--font-body, "DM Sans", system-ui)',
            fontSize: tagFontSize, fontWeight: 400, letterSpacing: '0.15em',
            textTransform: 'uppercase', opacity: tagOpacity,
            margin: 0, lineHeight: 1.4,
          }}>
            Mobile
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

// Formats an as-the-crow-flies distance for the corner chip. Sub-kilometre
// distances read in metres (rounded to 50 m) so very-near venues don't all
// collapse to a single bucket; one decimal under 10 km; whole km beyond.
function formatDistance(km) {
  if (km == null || !isFinite(km)) return null
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export default function ListingCard({ listing, meta, linkToVertical = false, distanceKm = null, onClick }) {
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
  // Moderation gate is fail-open on absent field: a card whose query didn't
  // select image_moderation_status behaves exactly as before; only an explicit
  // flagged/held verdict swaps the photo for the typographic card.
  const hasRealImage = listing.hero_image_url && isApprovedImageSource(listing.hero_image_url) && isHeroDisplayable(listing)
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const region = getListingRegion(listing)
  const distanceLabel = formatDistance(distanceKm)
  // Mobile venues (food trucks, carts) carry a subtle "Mobile" marker in place
  // of a precise location. Fail-safe: absent on queries that don't select it.
  const isMobile = listing.presence_type === 'mobile'

  return (
    <a
      href={url}
      {...(linkToVertical ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...(onClick ? { onClick } : {})}
      className="group listing-card block overflow-hidden"
      style={{ borderRadius: 'var(--radius-card)', border: '0.5px solid var(--color-border)', position: 'relative' }}
    >
      <div style={{ position: 'relative' }}>
        {hasRealImage ? (
          <div style={{ aspectRatio: '4/5', overflow: 'hidden', position: 'relative' }}>
            <img
              src={listing.hero_image_url}
              alt={listing.name}
              loading="lazy"
              decoding="async"
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
              {(region?.name || listing.state || isMobile) && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '11px',
                  color: 'rgba(255,255,255,0.6)', margin: '4px 0 0',
                  letterSpacing: '0.04em',
                }}>
                  {[region?.name, listing.state].filter(Boolean).join(', ')}
                  {isMobile ? `${(region?.name || listing.state) ? '  ·  ' : ''}Mobile` : ''}
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
            mobile={isMobile}
          />
        )}

        {/* Vertical badge — smaller, more subtle */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 3 }}>
          <VerticalBadge vertical={listing.vertical} size="sm" />
        </div>

        {/* Distance chip — mirrors the vertical badge in the opposite corner.
            Frosted-glass pill echoing the verification badge treatment. */}
        {distanceLabel && (
          <div
            title={`${distanceLabel} from here`}
            style={{
              position: 'absolute', bottom: 10, right: 10, zIndex: 3,
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '4px 9px 4px 7px', borderRadius: 100,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
              fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)',
              fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.01em',
              color: '#2A2925', lineHeight: 1, whiteSpace: 'nowrap',
            }}
          >
            <svg width="10" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--color-accent, #C4603A)" />
              <circle cx="12" cy="9" r="2.6" fill="#fff" />
            </svg>
            {distanceLabel}
          </div>
        )}

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
