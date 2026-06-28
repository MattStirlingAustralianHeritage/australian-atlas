import Link from 'next/link'
import { VERTICAL_ACCENTS, getVerticalBadge, getPublicVerticals } from '@/lib/verticalUrl'

const VERTICAL_COLORS = VERTICAL_ACCENTS
const ALL_VERTICALS = getPublicVerticals()

// Static map strip. The homepage no longer boots an interactive Mapbox GL
// instance here (heavy JS bundle + a /api/map fetch on every visit) — it
// renders a pre-rendered Mapbox static image (generated from mapbox/dark-v11)
// that links straight through to the full interactive /map. The ten verticals
// stay as a decorative legend; the whole strip is one link, so they're plain
// spans (an <a> can't nest inside the wrapping <a>).
export default function HomeMapSection() {
  return (
    <section className="home-map-strip relative w-full overflow-hidden">
      <Link
        href="/map"
        aria-label="Explore the full interactive map of Australia"
        className="home-map-link"
      >
        <picture>
          <source srcSet="/maps/home-map.webp" type="image/webp" />
          <img
            src="/maps/home-map.jpg"
            alt="Map of Australia covering the Australian Atlas network of verified places"
            className="home-map-img"
            width={2560}
            height={680}
            loading="lazy"
            decoding="async"
          />
        </picture>

        {/* Warm tint + top/bottom vignette for legend & CTA legibility */}
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
        .home-map-strip { background: #14120e; }
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
          background: #14120e;
          transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1), filter 600ms ease;
        }
        .home-map-link:hover .home-map-img {
          transform: scale(1.025);
          filter: brightness(1.08);
        }
        .home-map-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(20,18,14,0.55) 0%, rgba(20,18,14,0) 30%),
            linear-gradient(0deg, rgba(20,18,14,0.62) 0%, rgba(20,18,14,0) 28%),
            linear-gradient(0deg, rgba(58,46,30,0.18), rgba(58,46,30,0.18));
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
          background: rgba(0,0,0,0.55);
          color: #FAF8F4;
          font-family: var(--font-body);
          font-weight: 400;
          font-size: 11px;
          line-height: 1;
          white-space: nowrap;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
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
          background: rgba(0,0,0,0.7);
          color: #FAF8F4;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 12px;
          line-height: 1;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: transform 250ms ease, box-shadow 250ms ease;
        }
        .home-map-link:hover .home-map-cta {
          transform: translateX(2px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.45);
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
