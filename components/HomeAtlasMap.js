import LocalizedLink from '@/components/LocalizedLink'
import { getTranslations, getLocale } from 'next-intl/server'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'
import { HOME_MAP, projectToImagePct } from '@/lib/map/homeAtlasProjection'

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

export default async function HomeAtlasMap({ listingCount, categoryCount, regionCount, freshListings = [], scopePins = [], typeCounter = null }) {
  const t = await getTranslations('home')
  const locale = await getLocale()
  const count = typeof listingCount === 'number' && listingCount > 0
    ? listingCount.toLocaleString()
    : null
  const showStats = Number(categoryCount) > 0 && Number(regionCount) > 0

  // The rotating type counter under the scope sub: this hour's twelve
  // kinds of place, each with its live count ("1,026 wineries",
  // "71 surf schools"). The rotation is pure CSS — twelve stacked
  // spans on one grid cell, each visible for its twelfth of the cycle
  // — so the plate keeps its zero-JS property. The stack is
  // aria-hidden (a line that swaps every few seconds is noise to a
  // screen reader); the sr-only summary states the same fact once.
  // Reduced motion pins the first entry. Kind labels reuse the ko/zh
  // subcategory dictionary; unmapped kinds fall back to English.
  const TC_PERIOD = 3.2
  const typeEntries = typeCounter?.entries?.length === 12 ? typeCounter.entries : null

  const fresh = (freshListings || [])
    .filter(l => l && l.slug && Number.isFinite(parseFloat(l.lng)) && Number.isFinite(parseFloat(l.lat)))
    .slice(0, 6)

  // The scope proof: real listings from every state and territory,
  // rendered as steady hoverable pins over the chart. Same projection
  // and fan-out treatment as the fresh pins, without the pulse.
  const scope = (scopePins || [])
    .filter(l => l && l.slug && Number.isFinite(parseFloat(l.lng)) && Number.isFinite(parseFloat(l.lat)))
    .slice(0, 32)

  return (
    <section className="atlas-plate" aria-label={t('mapSectionAria')}>
      <div className="atlas-plate-mat">
      {/* Editorial copy — absolute over the open ocean on wide screens,
          normal flow above the chart on small ones. */}
      <div className="atlas-plate-copy">
        <p className="atlas-plate-overline">{t('livingAtlas')}</p>
        <h2 className="atlas-plate-headline">
          {count ? t('plateScopeHeadline', { count }) : t('everyPlaceMapped')}
        </h2>
        <p className="atlas-plate-sub">{t('plateScopeSub')}</p>

        {typeEntries && (
          <p className="atlas-plate-typecount">
            <span aria-hidden="true" className="atlas-tc-line">
              <span className="atlas-tc-lead">{t('typeCounterLead')}</span>
              <span className="atlas-tc-stack">
                {typeEntries.map((e, i) => (
                  <span
                    key={e.key}
                    className="atlas-tc-item"
                    style={{ animationDelay: `${(i * TC_PERIOD).toFixed(1)}s` }}
                  >
                    {t.rich('typeCounterItem', {
                      count: Number(e.count).toLocaleString(locale),
                      label: localizeSubcategory(e.key, e.label, locale),
                      num: (chunks) => <strong className="atlas-tc-num">{chunks}</strong>,
                    })}
                  </span>
                ))}
              </span>
            </span>
            <span className="sr-only">{t('typeCounterSr', { kinds: typeCounter.kinds })}</span>
          </p>
        )}

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
              width={HOME_MAP.width * HOME_MAP.scale}
              height={HOME_MAP.height * HOME_MAP.scale}
              loading="lazy"
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
            // Fan near-coincident pins apart (a state's three sample pins
            // routinely stack in its capital) so both stay hoverable —
            // same idea as MapClient's pin fan-out, in image-percent space.
            // Scope and fresh pins share the placed list so they never sit
            // on each other.
            //
            // The nudge points INLAND — from the pin toward the continental
            // centroid — not a fixed south-east march. The old SE step walked
            // a capital's stacked pins straight off the coast into open water
            // (Melbourne galleries → Bass Strait, Canberra → the Tasman),
            // because every mainland capital sits on the coast and SE is the
            // sea. Stepping toward the interior lands a fanned pin deeper on
            // land instead; small steps keep it from overshooting.
            const CENTROID = projectToImagePct(134.4, -25.6)  // ~Lambert centre
            const placed = []
            const place = (l) => {
              const base = projectToImagePct(parseFloat(l.lng), parseFloat(l.lat))
              if (base.leftPct < 0 || base.leftPct > 100 || base.topPct < 0 || base.topPct > 100) return null
              let vx = CENTROID.leftPct - base.leftPct
              let vy = CENTROID.topPct - base.topPct
              const mag = Math.hypot(vx, vy) || 1
              vx /= mag; vy /= mag
              let { leftPct, topPct } = base
              for (let guard = 0; guard < 4 && placed.some(p => Math.abs(p.x - leftPct) < 0.9 && Math.abs(p.y - topPct) < 1.2); guard++) {
                leftPct += vx * 1.5; topPct += vy * 1.5
              }
              placed.push({ x: leftPct, y: topPct })
              return { leftPct, topPct }
            }
            const scopeEls = scope.map((l) => {
              const pos = place(l)
              if (!pos) return null
              return (
              <LocalizedLink
                key={`scope-${l.id || l.slug}`}
                href={`/place/${l.slug}`}
                className="atlas-fresh atlas-scope"
                style={{ left: `${pos.leftPct.toFixed(3)}%`, top: `${pos.topPct.toFixed(3)}%` }}
                aria-label={l.name}
              >
                <span className="atlas-fresh-dot" aria-hidden="true" />
                <span className="atlas-fresh-tip" role="presentation">
                  <strong>{l.name}</strong>
                  {(l.region || l.state) ? <span>{l.region || l.state}</span> : null}
                </span>
              </LocalizedLink>
              )
            })
            const freshEls = fresh.map((l, i) => {
              const pos = place(l)
              if (!pos) return null
              return (
              <LocalizedLink
                key={l.id || l.slug}
                href={`/place/${l.slug}`}
                className="atlas-fresh"
                style={{ left: `${pos.leftPct.toFixed(3)}%`, top: `${pos.topPct.toFixed(3)}%`, '--pulse-delay': `${(i * 0.55).toFixed(2)}s` }}
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
            return [...scopeEls, ...freshEls]
          })()}
        </div>
      </div>
      </div>

      {/* dangerouslySetInnerHTML (not a text child) — hydration compares style
          text nodes character-for-character; innerHTML-set CSS skips that. */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Mid-page chapter — the section sits directly on the page's stone
           ground; only the framed chart carries the chart's own cream sea. */
        .atlas-plate { position: relative; overflow: hidden; padding-top: clamp(24px, 4vw, 56px); }

        /* ── the mat + framed chart ────────────────────────── */
        /* The map used to be the full-bleed ground of the first screen and
           out-shouted the search bar. Contained on a mat with a hairline
           frame, it reads as an exhibit IN the page — the search stays the
           tool, the chart becomes the proof. Sub-981px keeps the edge-to-edge
           stacked crop (the frame treatment is desktop-only). */
        .atlas-plate-mat {
          position: relative;
          max-width: 1240px; margin: 0 auto;
          padding: clamp(6px, 1.5vw, 18px) clamp(18px, 3vw, 36px) clamp(30px, 4vw, 52px);
        }
        .atlas-plate-frame {
          position: relative; min-height: 460px;
          border-radius: var(--radius-lg, 18px); overflow: hidden;
          border: 1px solid rgba(28,26,23,0.10);
          box-shadow: var(--shadow-md, 0 10px 28px rgba(82,58,30,0.10));
          background: #F0EBE3;
        }
        .atlas-plate-canvas { position: relative; width: 100%; pointer-events: none; }
        .atlas-plate-canvas img { display: block; width: 100%; height: auto; }
        /* One link under everything: any click on the map surface (including
           the ocean and the min-height slack) opens /map. The canvas passes
           pointer events through; markers/pins re-enable their own. */
        .atlas-plate-baselink { position: absolute; inset: 0; z-index: 1; }
        .atlas-city, .atlas-fresh { pointer-events: auto; }

        /* ── editorial copy over the open ocean ────────────── */
        .atlas-plate-copy {
          position: absolute;
          left: clamp(28px, 4.5vw, 72px);
          top: 50%;
          transform: translateY(-50%);     /* centred in the band — since the
             legend went, the column is short enough to centre everywhere,
             and top-anchoring left a dead field under the text (Matt) */
          z-index: 4;
          max-width: min(34vw, 430px);
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
          /* quieter than the masthead + search on purpose — the map is the
             supporting exhibit, not the page's second headline */
          font-size: clamp(22px, 2.3vw, 34px); line-height: 1.1;
          letter-spacing: -0.012em; color: var(--color-ink, #1C1A17);
          max-width: 11em; text-wrap: balance;
        }
        .atlas-plate-sub {
          margin-top: 11px;
          font-family: var(--font-body); font-weight: 300; font-size: 14px;
          line-height: 1.55; color: var(--color-muted, #6B645A); max-width: 38ch;
        }

        /* ── rotating type counter ─────────────────────────── */
        /* Twelve entries share one grid cell; each one's keyframe delay
           staggers it into its own twelfth of a 38.4s cycle (12 × 3.2s),
           so exactly one is on stage at a time and the twelfth hands
           back to the first. The stack sizes itself to the longest
           entry, so the line never reflows as counts swap. */
        .atlas-plate-typecount { margin-top: 13px; }
        .atlas-tc-line {
          display: inline-flex; align-items: baseline; gap: 7px;
          font-family: var(--font-body); font-weight: 400; font-size: 13px;
          line-height: 1.5; color: var(--color-muted, #6B645A);
        }
        .atlas-tc-stack { display: inline-grid; }
        .atlas-tc-item {
          grid-area: 1 / 1; justify-self: start; white-space: nowrap;
          color: var(--color-ink, #1C1A17);
          opacity: 0; transform: translateY(7px);
          animation: atlas-tc-cycle 38.4s infinite;
        }
        .atlas-tc-num {
          font-weight: 600; color: #96743C;
          font-variant-numeric: tabular-nums;
        }
        @keyframes atlas-tc-cycle {
          0%    { opacity: 0; transform: translateY(7px); }
          1.2%  { opacity: 1; transform: none; }
          7.1%  { opacity: 1; transform: none; }
          8.33% { opacity: 0; transform: translateY(-7px); }
          100%  { opacity: 0; transform: translateY(-7px); }
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
        /* scope pins: the same hoverable gold dot, held steady (no ping),
           ringed in ink so it reads over dense dot fields */
        .atlas-scope .atlas-fresh-dot {
          box-shadow: 0 0 0 1.5px rgba(28,26,23,0.55), 0 0 0 3px rgba(251,248,242,0.75);
        }
        .atlas-scope:hover .atlas-fresh-dot,
        .atlas-scope:focus-visible .atlas-fresh-dot { background: #1C1A17; }
        /* ── responsive ────────────────────────────────────── */
        @media (max-width: 1280px) {
          .atlas-plate-sub { display: none; }
        }
        /* Stacked layout — phones and tablets: copy in flow above the chart,
           the chart cropped to Australia (ocean band trimmed) and anchored
           right so the continent fills the viewport. */
        @media (max-width: 980px) {
          .atlas-plate-mat { max-width: none; padding: 0; }
          .atlas-plate-frame {
            border-radius: 0; border: none; box-shadow: none;
          }
          .atlas-plate-copy {
            position: static; transform: none; max-width: none;
            padding: 34px 24px 6px; align-items: center; text-align: center;
          }
          .atlas-plate-headline { max-width: none; }
          .atlas-plate-sub { display: block; }
          .atlas-plate-actions { justify-content: center; margin-top: 20px; }
          .atlas-plate-stats { margin-top: 10px; }
          .atlas-plate-typecount { margin-top: 10px; }
          .atlas-plate-frame { height: min(97vw, 430px); min-height: 0; overflow: hidden; }
          .atlas-plate-canvas {
            position: absolute; top: 0; right: -3vw;
            height: 100%; width: auto;
            aspect-ratio: ${HOME_MAP.width} / ${HOME_MAP.height};
          }
          .atlas-plate-canvas img { width: auto; height: 100%; }
          .atlas-city-name { font-size: 9.5px; letter-spacing: 0.1em; }
        }
        @media (prefers-reduced-motion: reduce) {
          .atlas-fresh-ping { animation: none; opacity: 0; }
          .atlas-plate-cta, .atlas-plate-cta-alt, .atlas-city-dot, .atlas-city-name { transition: none; }
          .atlas-tc-item { animation: none; }
          .atlas-tc-item:first-child { opacity: 1; transform: none; }
        }
      ` }} />
    </section>
  )
}
