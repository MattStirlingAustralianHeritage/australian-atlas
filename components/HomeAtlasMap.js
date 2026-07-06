import LocalizedLink from '@/components/LocalizedLink'
import { getTranslations } from 'next-intl/server'
import { projectToImagePct } from '@/lib/map/homeAtlasProjection'

// The homepage "atlas plate" — the living atlas as the hero's ground.
//
// One pre-rendered chart (public/maps/home-map-atlas.*, built by
// scripts/generate-home-map.mjs) plots every verified place as a dot in its
// vertical's brand colour on a warm parchment Australia. This component turns
// that picture into a genuinely navigable surface with zero client JS:
//
//   · capital-city markers are real links that deep-link into the interactive
//     map at that city (/map?lng&lat&zoom — MapClient reads those params)
//   · the newest places pulse gold; hover names them, click opens the place
//   · the legend keys the dot colours AND filters search by that category
//   · the base image itself remains one honest link to /map
//
// All overlay positions are server-projected through the same Web-Mercator
// constants the generator wrote (lib/map/homeAtlasProjection.js), expressed
// as percentages of the image box so they survive any responsive scaling of
// the plate. Interactivity is CSS-only; prefers-reduced-motion stills it.
const CITIES = [
  { name: 'Perth',     lng: 115.86, lat: -31.95, side: 'w' },
  { name: 'Darwin',    lng: 130.84, lat: -12.46, side: 'w' },
  { name: 'Cairns',    lng: 145.77, lat: -16.92, side: 'e' },
  { name: 'Brisbane',  lng: 153.03, lat: -27.47, side: 'e' },
  { name: 'Sydney',    lng: 151.21, lat: -33.87, side: 'e' },
  { name: 'Melbourne', lng: 144.96, lat: -37.81, side: 'w' },
  { name: 'Adelaide',  lng: 138.60, lat: -34.93, side: 'w' },
  { name: 'Hobart',    lng: 147.33, lat: -42.88, side: 'e' },
]
const CITY_ZOOM = 10.5

export default async function HomeAtlasMap({ listingCount, categoryCount, regionCount, freshListings = [] }) {
  const t = await getTranslations('home')
  const count = typeof listingCount === 'number' && listingCount > 0
    ? listingCount.toLocaleString()
    : null
  const showStats = Number(categoryCount) > 0 && Number(regionCount) > 0

  const fresh = (freshListings || [])
    .filter(l => l && l.slug && Number.isFinite(parseFloat(l.lng)) && Number.isFinite(parseFloat(l.lat)))
    .slice(0, 6)

  return (
    <section className="atlas-plate" aria-label={t('mapSectionAria')}>
      {/* Editorial copy — absolute over the open ocean on wide screens,
          normal flow above the chart on small ones. */}
      <div className="atlas-plate-copy">
        <p className="atlas-plate-overline">{t('livingAtlas')}</p>
        <h2 className="atlas-plate-headline">
          {count ? t('verifiedPlacesMapped', { count }) : t('everyPlaceMapped')}
        </h2>
        <p className="atlas-plate-sub">{t('atlasPlateSub')}</p>

        <div className="atlas-plate-actions">
          <LocalizedLink href="/map" className="atlas-plate-cta">
            {t('openFullMap')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </LocalizedLink>
          <LocalizedLink href="/near-me" className="atlas-plate-cta-alt">
            {t('nearMe')}
          </LocalizedLink>
        </div>

        {showStats && (
          <p className="atlas-plate-stats">
            {t('plateStats', {
              categories: Number(categoryCount).toLocaleString(),
              regions: Number(regionCount).toLocaleString(),
            })}
          </p>
        )}
      </div>

      {/* The chart — image box; every overlay is positioned in % of this box.
          The base link blankets the whole frame (not just the picture), so a
          click anywhere on the map surface opens /map; markers and pins sit
          above it on higher z-layers. */}
      <div className="atlas-plate-frame">
        <LocalizedLink href="/map" aria-label={t('heroMapAria')} className="atlas-plate-baselink" />
        <div className="atlas-plate-canvas">
          {/* Versioned filename — the pre-plate homepage HTML hard-codes
              /maps/home-map-atlas.* with cover-crop CSS, and a stale tab
              rendering THESE bytes through THAT layout is a cropped mess
              (seen live 2026-07-06). The legacy path keeps its original
              2560x680 bytes; the plate's chart lives at its own path. */}
          <picture>
            <source srcSet="/maps/home-map-atlas-plate.webp" type="image/webp" />
            <img
              src="/maps/home-map-atlas-plate.jpg"
              alt={t('mapSectionAlt')}
              width={2560}
              height={1040}
              loading="eager"
              fetchPriority="low"
              decoding="async"
            />
          </picture>

          {CITIES.map((c) => {
            const { leftPct, topPct } = projectToImagePct(c.lng, c.lat)
            return (
              <LocalizedLink
                key={c.name}
                href={`/map?lng=${c.lng}&lat=${c.lat}&zoom=${CITY_ZOOM}`}
                className="atlas-city"
                data-side={c.side}
                style={{ left: `${leftPct.toFixed(3)}%`, top: `${topPct.toFixed(3)}%` }}
                aria-label={t('openMapAround', { city: c.name })}
              >
                <span className="atlas-city-dot" aria-hidden="true" />
                <span className="atlas-city-name">{c.name}</span>
              </LocalizedLink>
            )
          })}

          {(() => {
            // Fan near-coincident pins apart (two new places in one city is
            // the norm) so both stay hoverable — same idea as MapClient's
            // pin fan-out, in image-percent space.
            const placed = []
            return fresh.map((l, i) => {
              let { leftPct, topPct } = projectToImagePct(parseFloat(l.lng), parseFloat(l.lat))
              if (leftPct < 0 || leftPct > 100 || topPct < 0 || topPct > 100) return null
              for (let guard = 0; guard < 4 && placed.some(p => Math.abs(p.x - leftPct) < 1.1 && Math.abs(p.y - topPct) < 2.8); guard++) {
                leftPct += 0.6; topPct += 2.9
              }
              placed.push({ x: leftPct, y: topPct })
              return (
              <LocalizedLink
                key={l.id || l.slug}
                href={`/place/${l.slug}`}
                className="atlas-fresh"
                style={{ left: `${leftPct.toFixed(3)}%`, top: `${topPct.toFixed(3)}%`, '--pulse-delay': `${(i * 0.55).toFixed(2)}s` }}
                aria-label={t('newPlaceAria', { name: l.name })}
              >
                <span className="atlas-fresh-ping" aria-hidden="true" />
                <span className="atlas-fresh-dot" aria-hidden="true" />
                <span className="atlas-fresh-tip" role="presentation">
                  <strong>{l.name}</strong>
                  {(l.region || l.state) ? <span>{l.region || l.state}</span> : null}
                </span>
              </LocalizedLink>
              )
            })
          })()}
        </div>
      </div>

      {/* dangerouslySetInnerHTML (not a text child) — hydration compares style
          text nodes character-for-character; innerHTML-set CSS skips that. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .atlas-plate { position: relative; background: #F0EBE3; overflow: hidden; }

        /* ── the chart ─────────────────────────────────────── */
        /* The frame's natural height comes from the image's aspect ratio; the
           min-height floor guards the copy column at narrower desktop widths.
           Any extra frame height reads as more southern ocean — the image's
           sea is the exact section background, so the seam is invisible. */
        .atlas-plate-frame { position: relative; min-height: 460px; }
        .atlas-plate-canvas { position: relative; width: 100%; pointer-events: none; }
        .atlas-plate-canvas img {
          display: block; width: 100%; height: auto;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 100%);
          mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 100%);
        }
        /* One link under everything: any click on the map surface (including
           the ocean and the min-height slack) opens /map. The canvas passes
           pointer events through; markers/pins re-enable their own. */
        .atlas-plate-baselink { position: absolute; inset: 0; z-index: 1; }
        .atlas-city, .atlas-fresh { pointer-events: auto; }

        /* ── editorial copy over the open ocean ────────────── */
        .atlas-plate-copy {
          position: absolute;
          left: clamp(24px, 6vw, 96px);
          top: clamp(24px, 4.5vh, 44px);   /* top-anchored: the column must
             never outgrow the image-derived plate height, so overflow room
             stays at the bottom ocean rather than clipping the dateline */
          z-index: 4;
          max-width: min(34vw, 460px);
          display: flex; flex-direction: column; align-items: flex-start;
        }
        .atlas-plate-overline {
          display: inline-flex; align-items: center; gap: 12px;
          font-family: var(--font-body); font-weight: 600; font-size: 11.5px;
          letter-spacing: 0.2em; text-transform: uppercase; color: #96743C;
        }
        .atlas-plate-overline::before { content: ""; width: 30px; height: 1px; background: #96743C; opacity: 0.7; }
        .atlas-plate-headline {
          margin-top: 12px;
          font-family: var(--font-display); font-weight: 400;
          font-size: clamp(24px, 2.8vw, 40px); line-height: 1.06;
          letter-spacing: -0.015em; color: var(--color-ink, #1C1A17);
          max-width: 10em; text-wrap: balance;
        }
        .atlas-plate-sub {
          margin-top: 11px;
          font-family: var(--font-body); font-weight: 300; font-size: 14px;
          line-height: 1.55; color: var(--color-muted, #6B645A); max-width: 38ch;
        }
        .atlas-plate-actions { margin-top: 22px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .atlas-plate-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 21px; border-radius: 999px;
          background: rgba(26,24,21,0.92); color: #FAF8F4;
          font-family: var(--font-body); font-weight: 500; font-size: 13px; line-height: 1;
          box-shadow: 0 8px 24px rgba(28,26,23,0.2);
          transition: transform 250ms ease, box-shadow 250ms ease;
        }
        .atlas-plate-cta:hover { transform: translateX(2px); box-shadow: 0 10px 30px rgba(28,26,23,0.3); }
        .atlas-plate-cta-alt {
          display: inline-flex; align-items: center;
          padding: 11px 19px; border-radius: 999px;
          font-family: var(--font-body); font-weight: 500; font-size: 13px; line-height: 1;
          color: var(--color-ink, #1C1A17); border: 1px solid rgba(28,26,23,0.22);
          background: rgba(251,248,242,0.5);
          transition: border-color 200ms ease;
        }
        .atlas-plate-cta-alt:hover { border-color: var(--color-ink, #1C1A17); }
        .atlas-plate-stats {
          margin-top: 12px;
          font-family: var(--font-body); font-weight: 400; font-size: 12.5px;
          letter-spacing: 0.02em; color: var(--color-muted, #6B645A);
        }

        /* ── city markers ──────────────────────────────────── */
        .atlas-city {
          position: absolute; z-index: 3;
          display: flex; align-items: center; gap: 6px;
          transform: translate(-50%, -50%);
          padding: 6px; margin: -6px;                 /* honest tap target */
          text-decoration: none;
        }
        .atlas-city[data-side="w"] { flex-direction: row-reverse; transform: translate(calc(-100% + 13px), -50%); }
        .atlas-city-dot {
          width: 8px; height: 8px; border-radius: 999px; flex: none;
          border: 1.6px solid rgba(28,26,23,0.72); background: rgba(251,248,242,0.85);
          transition: background 180ms ease, border-color 180ms ease;
        }
        .atlas-city-name {
          font-family: var(--font-body); font-weight: 600; font-size: 10.5px;
          letter-spacing: 0.13em; text-transform: uppercase;
          color: rgba(28,26,23,0.62);
          text-shadow: 0 0 6px rgba(240,235,227,0.9), 0 0 2px rgba(240,235,227,0.9);
          transition: color 180ms ease;
        }
        .atlas-city:hover .atlas-city-dot,
        .atlas-city:focus-visible .atlas-city-dot { background: #C49A3C; border-color: #1C1A17; }
        .atlas-city:hover .atlas-city-name,
        .atlas-city:focus-visible .atlas-city-name { color: #1C1A17; }

        /* ── just-added pulses ─────────────────────────────── */
        /* Above the city markers: a city link's padded label box must never
           intercept a pin's hover/click (a pin near a capital is the common
           case). Where a pin lands on label text, the label's halo keeps the
           text readable under the 8px dot. */
        .atlas-fresh {
          position: absolute; z-index: 4;
          width: 26px; height: 26px; margin: -13px;   /* centred tap target */
          display: grid; place-items: center;
        }
        .atlas-fresh-dot {
          grid-area: 1/1; width: 8px; height: 8px; border-radius: 999px;
          background: #C49A3C; box-shadow: 0 0 0 1.5px rgba(251,248,242,0.9);
        }
        .atlas-fresh-ping {
          grid-area: 1/1; width: 8px; height: 8px; border-radius: 999px;
          background: rgba(196,154,60,0.55);
          animation: atlas-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
          animation-delay: var(--pulse-delay, 0s);
        }
        .atlas-fresh-tip {
          position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
          background: rgba(26,24,21,0.94); color: #FAF8F4;
          border-radius: 8px; padding: 7px 11px; white-space: nowrap;
          font-family: var(--font-body); font-size: 11.5px; line-height: 1.35;
          opacity: 0; visibility: hidden; pointer-events: none;
          transition: opacity 160ms ease;
          box-shadow: 0 6px 18px rgba(28,26,23,0.25);
        }
        .atlas-fresh-tip strong { font-weight: 600; }
        .atlas-fresh-tip span { opacity: 0.72; font-size: 10.5px; }
        .atlas-fresh:hover .atlas-fresh-tip,
        .atlas-fresh:focus-visible .atlas-fresh-tip { opacity: 1; visibility: visible; }

        @keyframes atlas-ping {
          0% { transform: scale(1); opacity: 0.9; }
          70%, 100% { transform: scale(3.4); opacity: 0; }
        }
        /* ── responsive ────────────────────────────────────── */
        @media (max-width: 1280px) {
          .atlas-plate-sub { display: none; }
        }
        /* Stacked layout — phones and tablets: copy in flow above the chart,
           the chart cropped to Australia (ocean band trimmed) and anchored
           right so the continent fills the viewport. */
        @media (max-width: 980px) {
          .atlas-plate-copy {
            position: static; transform: none; max-width: none;
            padding: 34px 24px 6px; align-items: center; text-align: center;
          }
          .atlas-plate-headline { max-width: none; }
          .atlas-plate-sub { display: block; }
          .atlas-plate-actions { justify-content: center; margin-top: 20px; }
          .atlas-plate-stats { margin-top: 10px; }
          .atlas-plate-frame { height: min(97vw, 430px); min-height: 0; overflow: hidden; }
          .atlas-plate-canvas {
            position: absolute; top: 0; right: -3vw;
            height: 100%; width: auto; aspect-ratio: 2560 / 1040;
          }
          .atlas-plate-canvas img { width: auto; height: 100%; }
          .atlas-city-name { font-size: 9.5px; letter-spacing: 0.1em; }
        }
        @media (prefers-reduced-motion: reduce) {
          .atlas-fresh-ping { animation: none; opacity: 0; }
          .atlas-plate-cta, .atlas-plate-cta-alt, .atlas-city-dot, .atlas-city-name { transition: none; }
        }
      ` }} />
    </section>
  )
}
