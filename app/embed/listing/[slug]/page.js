import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { excludeNeedsReview } from '@/lib/listings/publicFilter'
import { isApprovedImageSource, isHeroDisplayable } from '@/lib/image-utils'
import { subTypeLabel } from '@/lib/subTypeLabels'

// ============================================================
// Embeddable Atlas card — /embed/listing/[slug]
//
// A minimal, self-contained card operators paste into their OWN websites via
// an <iframe> (snippet generated at /dashboard/embed). Renders with no site
// chrome, inline styles only, and a transparent page background so it sits on
// any host-site background. The whole card links to the listing's place page
// in a new tab.
//
// Framing: middleware.js sets `Content-Security-Policy: frame-ancestors *` on
// /embed/* so third-party sites can iframe this route despite the global
// X-Frame-Options: SAMEORIGIN header.
//
// Integrity: this is a plain, read-only rendering of already-public listing
// fields — it has no effect on search, map, or discovery ranking. Only
// status='active' listings render (needs_review and non-public verticals 404,
// mirroring the place-page gate); the hero thumb obeys the same
// approved-source + moderation gates as /place/[slug].
// ============================================================

export const revalidate = 3600

// Embeds are for operators' own sites, not search engines — never index the
// iframe document itself (the place page is the canonical URL).
export const metadata = {
  robots: { index: false, follow: false },
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// Literal palette (mirrors the globals.css tokens) — the card must not depend
// on site-level CSS variables, so every colour is inlined here.
const INK = '#1C1A17'
const MUTED = '#6B6459'
const BORDER = '#E5E0D6'
const CARD_BG = '#FDFCF9'
const GOLD = '#C4973B'

// System-first stack with DM Sans when the layout's font variable is present.
const FONT_STACK = "var(--font-body, 'DM Sans'), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const getEmbedListing = cache(async function getEmbedListing(slug) {
  const sb = getSupabaseAdmin()
  // slug is NOT unique across verticals — limit(1) instead of .single(), same
  // as the place page.
  const { data, error } = await excludeNeedsReview(
    sb
      .from('listings')
      .select('id, name, slug, vertical, sub_type, sub_types, suburb, state, hero_image_url, status')
      .eq('slug', slug)
      .eq('status', 'active')
  )
    .in('vertical', getPublicVerticals())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[embed] Listing query failed for slug:', slug, '—', error.message)
    return null
  }
  if (!data) return null

  // Hero moderation status (migration 164) — read separately + guarded so a
  // pre-migration deploy can't 404 the embed (matches the place-page pattern).
  try {
    const { data: mod, error: modErr } = await sb
      .from('listings')
      .select('image_moderation_status')
      .eq('id', data.id)
      .maybeSingle()
    if (!modErr && mod) data.image_moderation_status = mod.image_moderation_status
  } catch { /* column absent pre-migration — leave undefined (displayable) */ }

  return data
})

// The compass-star mark from the site wordmark, at embed scale.
function CompassStar({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
    </svg>
  )
}

export default async function EmbedListingPage({ params }) {
  const { slug } = await params
  const listing = await getEmbedListing(slug)
  if (!listing) notFound()

  const showHero = isApprovedImageSource(listing.hero_image_url) && isHeroDisplayable(listing)
  const categoryLabel = subTypeLabel(
    listing.vertical,
    listing.sub_type || (Array.isArray(listing.sub_types) ? listing.sub_types[0] : null)
  )
  const location = [listing.suburb, listing.state].filter(Boolean).join(', ')
  const placeUrl = `${SITE_URL}/place/${listing.slug}`

  return (
    <>
      {/* Strip the portal chrome for this document only: the root layout wraps
          every route in Nav/Footer, but an embed must render the bare card on
          a transparent ground. Scoped to direct body children so nothing
          inside the card is ever affected. */}
      <style>{`
        html, body { background: transparent !important; }
        body { min-height: 0 !important; }
        body > nav, body > footer, body > .skip-link { display: none !important; }
        #main-content { padding: 0 !important; margin: 0 !important; }
      `}</style>

      <a
        href={placeUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: 360,
          boxSizing: 'border-box',
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          overflow: 'hidden',
          textDecoration: 'none',
          fontFamily: FONT_STACK,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Venue row: thumb + text. The thumb is a fixed 92px square so the
            card height is constant whether or not a hero image exists. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
          {showHero ? (
            /* Plain <img>, not next/image — the embed must stay a tiny,
               dependency-free document. Approved-source + moderation gated above. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.hero_image_url}
              alt=""
              width={92}
              height={92}
              loading="eager"
              style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 8, flexShrink: 0, display: 'block', background: '#EFE7D8' }}
            />
          ) : (
            /* Typographic fallback tile — same treatment family as the place
               page's TypographicCard: ink ground, gold compass star. */
            <span style={{
              width: 92, height: 92, borderRadius: 8, flexShrink: 0,
              background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CompassStar size={22} color={GOLD} />
            </span>
          )}

          <span style={{ display: 'block', minWidth: 0 }}>
            {categoryLabel && (
              <span style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: GOLD,
                marginBottom: 4,
              }}>
                {categoryLabel}
              </span>
            )}
            <span style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.25,
              color: INK,
            }}>
              {listing.name}
            </span>
            {location && (
              <span style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 400,
                color: MUTED,
                marginTop: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {location}
              </span>
            )}
          </span>
        </span>

        {/* Wordmark strip */}
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderTop: `1px solid ${BORDER}`,
        }}>
          <CompassStar size={10} color={GOLD} />
          <span style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: INK,
          }}>
            Australian Atlas
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 400, color: MUTED, letterSpacing: '0.02em' }}>
            — Verified independent
          </span>
        </span>
      </a>
    </>
  )
}
