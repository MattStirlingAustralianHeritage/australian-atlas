import Link from 'next/link'
import { VERTICAL_ACCENTS, getVerticalBadge, getPublicVerticals } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS
const ALL_VERTICALS = getPublicVerticals()

// Static map strip. The homepage no longer boots an interactive Mapbox GL
// instance here (heavy JS bundle + a /api/map fetch on every visit) — it
// renders a pre-rendered Mapbox static image (mapbox/light-v11, warm-toned to
// the Atlas cream palette) that links straight through to the full interactive
// /map. The ten verticals stay as a decorative legend; the whole strip is one
// link, so they're plain spans (an <a> can't nest inside the wrapping <a>).
export default function HomeMapSection() {
  return (
    <section className="home-map-strip relative w-full overflow-hidden">
      <Link
        href="/map"
        aria-label="Explore the full interactive map of Australia"
        className="home-map-link"
      >
        <picture>
          <source srcSet="/maps/home-map-light.webp" type="image/webp" />
          <img
            src="/maps/home-map-light.jpg"
            alt="Map of Australia covering the Australian Atlas network of verified places"
            className="home-map-img"
            width={2560}
            height={680}
            loading="lazy"
            decoding="async"
          />
        </picture>

        {/* Gentle bottom blend into the cream section below */}
        <span className="home-map-overlay" aria-hidden="true" />

        {/* Vertical legend — decorative */}
        <span className="home-map-legend">
          {ALL_VERTICALS.map((v) => (
            <span key={v} className="home-map-pill" style={{ borderColor: VERTICAL_COLORS[v] }}>
              <span className="home-map-dot" style={{ backgroundColor: VERTICAL_COLORS[v] }} />
              {getVerticalBadge(v)}
            </span>
          ))}
        </span>

        {/* Open full map — bottom-right */}
        <span className="home-map-cta">
          Open full map
          <svg className="home-map-cta-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </Link>

      <style>{`
        .home-map-strip { background: #efe6d4; }
        .home-map-link {
          position: relative;
          display: block;
          overflow: hidden;
        }
        .home-map-img {
          display: block;
          width: 100%;
          height: min(32vh, 380px);
          object-fit: cover;
          object-position: center;
          background: #efe6d4;
          transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .home-map-link:hover .home-map-img {
          transform: scale(1.025);
        }
        .home-map-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(0deg, rgba(251,248,242,0.92) 0%, rgba(251,248,242,0) 18%);
        }
        .home-map-legend {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 2;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 14px 16px 0;
        }
        .home-map-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          border: 1px solid;
          background: rgba(255,255,255,0.82);
          color: var(--color-ink, #1C1A17);
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 11px;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(28,26,23,0.10);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .home-map-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          flex: none;
        }
        .home-map-cta {
          position: absolute;
          bottom: 16px; right: 16px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 9999px;
          background: rgba(26,24,21,0.88);
          color: #FAF8F4;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 12px;
          line-height: 1;
          box-shadow: 0 8px 24px rgba(28,26,23,0.22);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: transform 250ms ease, box-shadow 250ms ease;
        }
        .home-map-link:hover .home-map-cta {
          transform: translateX(2px);
          box-shadow: 0 10px 28px rgba(28,26,23,0.30);
        }
        .home-map-cta-arrow { width: 14px; height: 14px; }
        @media (max-width: 640px) {
          .home-map-img { height: min(40vh, 320px); }
          .home-map-legend { gap: 5px; padding: 12px 12px 0; }
          .home-map-pill { font-size: 10px; padding: 3px 8px; }
        }
      `}</style>
    </section>
  )
}
