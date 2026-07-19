'use client'

/**
 * IntakeArt — the cartographic side panel of the intake wizard, and the faint
 * corner contours that texture the page. Pure decoration (aria-hidden): a
 * winding dashed road threading numbered day-stops across topographic
 * contours, with spot heights and a compass — the Atlas map language,
 * redrawn as illustration.
 */

const GOLD = '#C49A3C'
const SAGE = '#5F8A7E'
const TERRA = '#C4603A'
const INK = '#1C1A17'

export function IntakeArt() {
  return (
    <div className="ie-art" aria-hidden="true">
      <svg viewBox="0 0 420 600" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* ── Contour cluster, top right ── */}
        <g stroke={GOLD} strokeWidth="1">
          <path opacity="0.5" d="M292 44c38-14 84-8 104 16 21 25 14 62-9 82-24 21-63 24-92 10-30-14-46-44-38-70 6-20 17-31 35-38z" />
          <path opacity="0.4" d="M300 62c28-10 62-5 77 13 15 18 10 45-7 60-18 15-46 17-68 7-22-10-34-32-28-51 4-14 13-24 26-29z" />
          <path opacity="0.32" d="M309 80c19-7 42-3 52 9 10 12 7 30-5 40-12 10-31 12-46 5-15-7-23-22-19-35 3-9 9-16 18-19z" />
          <path opacity="0.24" d="M317 97c10-4 22-2 27 5 5 6 4 16-3 21-6 5-16 6-24 3-8-4-12-12-10-19 2-5 5-8 10-10z" />
        </g>

        {/* ── Contour cluster, mid left ── */}
        <g stroke={SAGE} strokeWidth="1">
          <path opacity="0.42" d="M-30 268c30-26 78-32 108-13 31 19 40 57 21 84-19 28-60 37-93 22-25-11-42-33-42-56 0-14 6-27 6-37z" />
          <path opacity="0.34" d="M-16 284c22-19 57-23 79-9 23 14 30 42 16 62-14 20-44 27-68 16-19-8-31-24-31-41 0-10 4-20 4-28z" />
          <path opacity="0.26" d="M-2 300c14-12 36-15 50-6 14 9 19 26 10 39-9 13-28 17-43 10-12-5-20-15-20-26 0-6 3-12 3-17z" />
        </g>

        {/* ── Contour cluster, bottom right ── */}
        <g stroke={GOLD} strokeWidth="1">
          <path opacity="0.4" d="M330 470c34-8 72 4 84 28 12 25-2 56-30 69-29 14-65 6-81-17-16-23-8-53 12-68 5-4 10-9 15-12z" />
          <path opacity="0.3" d="M340 490c23-6 49 3 57 19 8 17-1 38-20 47-20 9-44 4-55-12-11-15-6-36 8-46 3-3 7-6 10-8z" />
          <path opacity="0.22" d="M350 510c12-3 26 1 30 10 4 9 0 20-11 25-10 5-23 2-29-6-6-8-3-19 5-24 1-2 3-4 5-5z" />
        </g>

        {/* ── Spot heights ── */}
        <g fill="none" stroke={INK} strokeWidth="1" opacity="0.3" strokeLinecap="round">
          <path d="M84 122v8M80 126h8" />
          <path d="M356 260v8M352 264h8" />
          <path d="M96 448v8M92 452h8" />
        </g>
        <g fill={INK} opacity="0.32" fontFamily="DM Sans, system-ui, sans-serif" fontSize="9">
          <text x="94" y="130">427</text>
          <text x="366" y="268">618</text>
          <text x="106" y="456">305</text>
        </g>

        {/* ── The road: a dotted route threading the day ── */}
        <path
          d="M64 556 C 130 512, 78 448, 140 408 C 206 366, 258 400, 300 344 C 344 286, 250 252, 210 214 C 168 174, 224 120, 296 96"
          stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 9" opacity="0.75"
        />

        {/* Trailhead */}
        <circle cx="64" cy="556" r="5" fill="none" stroke={INK} strokeWidth="1.5" opacity="0.6" />
        <circle cx="64" cy="556" r="1.8" fill={INK} opacity="0.6" />

        {/* Day stops along the way */}
        <g fontFamily="DM Sans, system-ui, sans-serif" fontSize="11" fontWeight="700">
          <circle cx="140" cy="408" r="13" fill={GOLD} stroke="#FAF8F4" strokeWidth="2.5" />
          <text x="140" y="412.5" textAnchor="middle" fill="#fff">1</text>
          <circle cx="300" cy="344" r="13" fill={TERRA} stroke="#FAF8F4" strokeWidth="2.5" />
          <text x="300" y="348.5" textAnchor="middle" fill="#fff">2</text>
          <circle cx="210" cy="214" r="13" fill={SAGE} stroke="#FAF8F4" strokeWidth="2.5" />
          <text x="210" y="218.5" textAnchor="middle" fill="#fff">3</text>
        </g>

        {/* The night's rest, at the end of the road */}
        <circle cx="296" cy="96" r="15" fill={INK} stroke="#FAF8F4" strokeWidth="2.5" />
        <path
          d="M296 89.5l1.9 4.2 4.4.4-3.3 3 1 4.5-4-2.4-4 2.4 1-4.5-3.3-3 4.4-.4z"
          fill={GOLD}
        />

        {/* ── Compass ── */}
        <g opacity="0.55">
          <circle cx="58" cy="60" r="17" stroke={INK} strokeWidth="1" fill="none" />
          <path d="M58 47l4 13-4 13-4-13z" fill="none" stroke={INK} strokeWidth="1" />
          <path d="M58 47l4 13h-8z" fill={TERRA} opacity="0.85" />
          <text x="58" y="38" textAnchor="middle" fill={INK} fontSize="9" fontFamily="DM Sans, system-ui, sans-serif" opacity="0.8">N</text>
        </g>
      </svg>
      <p className="ie-art-caption">Ten atlases, one map — every stop checked.</p>
    </div>
  )
}

/** A faint contour cluster for page corners — pure texture. */
export function TopoCorner({ flip = false }) {
  return (
    <svg
      className={`ie-topo-corner${flip ? ' flip' : ''}`}
      viewBox="0 0 300 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g stroke={GOLD} strokeWidth="1">
        <path opacity="0.30" d="M18 36c44-30 112-32 152 0 41 33 46 92 12 130-35 39-100 46-146 17C-6 156-16 96 14 58c1-2 3-15 4-22z" />
        <path opacity="0.24" d="M40 62c32-22 82-23 111 0 30 24 34 67 9 95-26 28-73 33-107 12-31-19-38-63-16-91 1-2 2-11 3-16z" />
        <path opacity="0.18" d="M62 88c21-14 53-15 72 0 19 15 22 43 6 61-17 18-47 21-69 8-20-12-25-40-11-58 1-2 1-7 2-11z" />
        <path opacity="0.12" d="M84 114c11-8 28-8 38 0 10 8 11 23 3 32-9 10-25 11-37 4-10-6-13-21-5-31v-5z" />
      </g>
    </svg>
  )
}
