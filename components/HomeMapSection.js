import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { VERTICAL_ACCENTS, getVerticalBadge, getPublicVerticals } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS
const ALL_VERTICALS = getPublicVerticals()

// The homepage map strip — an editorial "living atlas" portrait.
//
// Rather than boot an interactive Mapbox GL instance (heavy JS + a /api/map
// fetch every visit), this renders ONE pre-rendered image that IS the data:
// every verified place plotted as a small dot in its vertical's brand colour
// over a warm cream Australia (mapbox/light-v11 tinted to the Atlas palette).
// Dense cities coalesce into colour; the interior shows individual finds.
//
// Design principles applied: (1) data as the hero — the constellation shows the
// network's real reach; (2) honest affordance — it is plainly a picture that
// links to the real interactive /map, not a fake live map, so the whole surface
// is one link with an explicit CTA and no dead clicks; (3) editorial framing —
// a dateline + serif caption, in the site's own voice; (4) restraint — a quiet
// basemap, the colour carried by the data. The ten-colour legend below doubles
// as the key to the dots. Zero client JS.
export default async function HomeMapSection({ listingCount }) {
  const t = await getTranslations('home')
  const count = typeof listingCount === 'number' && listingCount > 0
    ? listingCount.toLocaleString()
    : null

  return (
    <section className="home-map-strip relative w-full overflow-hidden">
      <Link
        href="/map"
        aria-label={t('mapSectionAria')}
        className="home-map-link"
      >
        <picture>
          <source srcSet="/maps/home-map-atlas.webp" type="image/webp" />
          <img
            src="/maps/home-map-atlas.jpg"
            alt={t('mapSectionAlt')}
            className="home-map-img"
            width={2560}
            height={680}
            loading="lazy"
            decoding="async"
          />
        </picture>

        {/* Cream scrims: legibility for caption (top) + blend into section below */}
        <span className="home-map-scrim home-map-scrim-top" aria-hidden="true" />
        <span className="home-map-scrim home-map-scrim-bottom" aria-hidden="true" />

        {/* Editorial caption — top-left, over the open Indian Ocean */}
        <span className="home-map-caption">
          <span className="home-map-overline">{t('livingAtlas')}</span>
          <span className="home-map-headline">
            {count ? t('verifiedPlacesMapped', { count }) : t('everyPlaceMapped')}
          </span>
        </span>

        {/* Legend — keys the dot colours; bottom-left */}
        <span className="home-map-legend">
          {ALL_VERTICALS.map((v) => (
            <span key={v} className="home-map-key">
              <span className="home-map-dot" style={{ backgroundColor: VERTICAL_COLORS[v] }} />
              {getVerticalBadge(v)}
            </span>
          ))}
        </span>

        {/* Open full map — bottom-right */}
        <span className="home-map-cta">
          {t('openFullMapShort')}
          <svg className="home-map-cta-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </Link>

      {/* dangerouslySetInnerHTML (not a text child) — React hydration compares
          style text nodes character-for-character and the streamed RSC payload
          was mismatching in dev; innerHTML-set CSS is skipped by that check. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .home-map-strip { background: #efe6d4; }
        .home-map-link { position: relative; display: block; overflow: hidden; }
        .home-map-img {
          display: block;
          width: 100%;
          height: min(40vh, 460px);
          object-fit: cover;
          object-position: center;
          background: #efe6d4;
          transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .home-map-link:hover .home-map-img { transform: scale(1.02); }

        .home-map-scrim { position: absolute; left: 0; right: 0; pointer-events: none; }
        .home-map-scrim-top {
          top: 0; height: 46%;
          background: linear-gradient(180deg, rgba(248,244,235,0.72) 0%, rgba(248,244,235,0.22) 42%, rgba(248,244,235,0) 100%);
        }
        .home-map-scrim-bottom {
          bottom: 0; height: 42%;
          background: linear-gradient(0deg, rgba(251,248,242,0.96) 0%, rgba(251,248,242,0.5) 38%, rgba(251,248,242,0) 100%);
        }

        .home-map-caption {
          position: absolute;
          top: clamp(18px, 4vw, 40px);
          left: clamp(20px, 5vw, 64px);
          z-index: 3;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: min(46vw, 420px);
        }
        .home-map-overline {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #96743c;
        }
        .home-map-overline::before {
          content: "";
          width: 28px;
          height: 1px;
          background: #96743c;
          opacity: 0.7;
        }
        .home-map-headline {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: clamp(20px, 2.6vw, 34px);
          line-height: 1.08;
          color: var(--color-ink, #1C1A17);
          max-width: 9em;
        }

        .home-map-legend {
          position: absolute;
          bottom: clamp(14px, 2.4vw, 22px);
          left: clamp(20px, 5vw, 64px);
          right: clamp(150px, 22vw, 220px);
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 16px;
        }
        .home-map-key {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 12px;
          line-height: 1;
          color: var(--color-ink, #1C1A17);
          white-space: nowrap;
        }
        .home-map-dot { width: 9px; height: 9px; border-radius: 9999px; flex: none; box-shadow: 0 0 0 2px rgba(251,248,242,0.65); }

        .home-map-cta {
          position: absolute;
          bottom: clamp(14px, 2.4vw, 22px);
          right: clamp(16px, 3vw, 28px);
          z-index: 4;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 17px;
          border-radius: 9999px;
          background: rgba(26,24,21,0.9);
          color: #FAF8F4;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 12.5px;
          line-height: 1;
          box-shadow: 0 8px 24px rgba(28,26,23,0.22);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: transform 250ms ease, box-shadow 250ms ease;
        }
        .home-map-link:hover .home-map-cta {
          transform: translateX(2px);
          box-shadow: 0 10px 30px rgba(28,26,23,0.32);
        }
        .home-map-cta-arrow { width: 15px; height: 15px; }

        @media (max-width: 760px) {
          .home-map-img { height: min(52vh, 360px); }
          .home-map-caption { max-width: 78vw; }
          .home-map-legend { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-map-img, .home-map-cta { transition: none; }
          .home-map-link:hover .home-map-img { transform: none; }
        }
      ` }} />
    </section>
  )
}
