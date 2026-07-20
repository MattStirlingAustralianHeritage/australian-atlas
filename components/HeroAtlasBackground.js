'use client'
// Rotating decorative background for the homepage hero — a suite of drafted
// survey-sheet charts in the Atlas gold / warm-grey palette. One variant is
// picked at random on each visit (client-side, because the homepage is
// ISR-cached — a server-side pick would freeze for every visitor for 30
// minutes) and fades in softly after mount.
//
// The four sheets share one design grammar so the rotation reads as a set:
//   · solid gold "index" lines vs dashed warm-grey auxiliary lines
//   · the surveyor's graticule crosses
//   · the compass rose, always anchored at the same spot
//   · four-point Atlas stars (the ✦ motif above the H1) as markers
//   · serif-italic lettering (the rose's N, star names)
//   · the same radial legibility mask, thinning to a whisper behind the copy
//
// Variants: highlands (contour landforms), township (streets, river, rail),
// coastline (harbour chart with water-lining), southern-sky (Crux and the
// Pointers). Preview a specific sheet with ?chart=<key>.
//
// The layer sits at z-index -1, so the parent <section> must set
// position: relative PLUS isolation: isolate — without the stacking context
// the negative z-index would drop it behind the section background.
//
// All geometry below is deterministic module-level code (no randomness in
// paths, no Date.now) — randomness is confined to the variant pick.

import { useEffect, useState } from 'react'

const TAU = Math.PI * 2

const GOLD = '#C4973B'
const WARM_GREY = '#8A7A5A'
const SAGE = '#5F8A7E' // water only — the site's --color-sage

// Thins the layer behind the hero copy (ellipse centre) while leaving the
// edges soft-but-present. Alpha here multiplies the stroke opacities below.
const CENTER_MASK =
  'radial-gradient(ellipse 64% 58% at 50% 40%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0.95) 75%, rgb(0,0,0) 100%)'

/* ── shared geometry helpers ─────────────────────────────────────────── */

// Catmull-Rom smoothing over a closed ring of [x, y] points → cubic Bézier path.
function closedPath(pts) {
  const n = pts.length
  const d = [`M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`]
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    )
  }
  return d.join(' ') + ' Z'
}

// Radius modulation: fixed sine harmonics make rings organic rather than
// circular; the per-ring phase shift keeps siblings from being scaled copies.
function ringMod(harmonics, f, i, t) {
  let m = 1
  for (const [k, amp, ph] of harmonics) {
    m += amp * (0.7 + 0.3 * f) * Math.sin(k * t + ph + i * 0.35)
  }
  return m
}

// Points of one modulated ring (used for landform rings, blobs, echoes).
function ringPoints({ cx, cy, R, squash = 0.78, harmonics }, f, i, scale = 1) {
  const pts = []
  const steps = 26
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * TAU
    const r = R * f * scale * ringMod(harmonics, f, i, t)
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t) * squash])
  }
  return pts
}

// One landform = nested contour rings around a drifting centre (the drift
// packs one flank tighter — the steep face of a survey-map hill).
function landform(config) {
  const { cx, cy, rings, drift = [0, 0] } = config
  const paths = []
  for (let i = 0; i < rings; i++) {
    const f = 1 - (i * 0.82) / (rings - 1)
    const pts = ringPoints({ ...config, cx: cx + drift[0] * i, cy: cy + drift[1] * i }, f, i)
    paths.push({ d: closedPath(pts), index: i % 3 === 0 })
  }
  return paths
}

// Sample a chain of cubic Bézier segments → [x, y, tx, ty] points (position +
// unit tangent). Used for railway sleepers and coastal hachures.
function sampleCubics(segs, n) {
  const out = []
  const per = Math.ceil(n / segs.length)
  for (const [p0, c1, c2, p1] of segs) {
    for (let j = 0; j < per; j++) {
      const t = (j + 0.5) / per
      const u = 1 - t
      const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0]
      const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]
      const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0])
      const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1])
      const L = Math.hypot(dx, dy) || 1
      out.push([x, y, dx / L, dy / L])
    }
  }
  return out
}

function cubicsToPath(segs) {
  const [first] = segs
  const d = [`M ${first[0][0]} ${first[0][1]}`]
  for (const [, c1, c2, p1] of segs) {
    d.push(`C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p1[0]} ${p1[1]}`)
  }
  return d.join(' ')
}

// Four-point Atlas star (the ✦ motif above the H1).
function starPath(x, y, s) {
  return (
    `M ${x} ${y - s} ` +
    `C ${x + s * 0.18} ${y - s * 0.3}, ${x + s * 0.3} ${y - s * 0.18}, ${x + s} ${y} ` +
    `C ${x + s * 0.3} ${y + s * 0.18}, ${x + s * 0.18} ${y + s * 0.3}, ${x} ${y + s} ` +
    `C ${x - s * 0.18} ${y + s * 0.3}, ${x - s * 0.3} ${y + s * 0.18}, ${x - s} ${y} ` +
    `C ${x - s * 0.3} ${y - s * 0.18}, ${x - s * 0.18} ${y - s * 0.3}, ${x} ${y - s} Z`
  )
}

// Survey trig-station symbol: small open triangle over a centre dot.
function TrigStation({ x, y }) {
  return (
    <g>
      <path d={`M ${x} ${y - 7} L ${x + 6.1} ${y + 3.5} L ${x - 6.1} ${y + 3.5} Z`} stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.2" />
      <circle cx={x} cy={y} r="1.3" fill={WARM_GREY} fillOpacity="0.25" />
    </g>
  )
}

/* ── shared frame: graticule crosses + compass rose ──────────────────── */

const CROSSES = (() => {
  const marks = []
  for (let x = 120; x <= 1400; x += 320) {
    for (let y = 70; y <= 620; y += 190) {
      marks.push(`M ${x - 5} ${y} H ${x + 5} M ${x} ${y - 5} V ${y + 5}`)
    }
  }
  return marks.join(' ')
})()

// The rose never moves — it is the fixed point the rotating sheets share.
const ROSE = { x: 1210, y: 462 }
const ROSE_TICKS = (() => {
  const segs = []
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * TAU
    const outer = k % 2 === 0 ? 54 : 48
    segs.push(
      `M ${(ROSE.x + 44 * Math.cos(t)).toFixed(1)} ${(ROSE.y + 44 * Math.sin(t)).toFixed(1)} ` +
      `L ${(ROSE.x + outer * Math.cos(t)).toFixed(1)} ${(ROSE.y + outer * Math.sin(t)).toFixed(1)}`
    )
  }
  return segs.join(' ')
})()

function SharedFrame() {
  return (
    <>
      <path d={CROSSES} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.12" />
      <g>
        <circle cx={ROSE.x} cy={ROSE.y} r="44" stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.13" />
        <circle cx={ROSE.x} cy={ROSE.y} r="33" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.16" strokeDasharray="2 5" strokeLinecap="round" />
        <path d={ROSE_TICKS} stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.16" />
        <path d={starPath(ROSE.x, ROSE.y, 24)} fill={GOLD} fillOpacity="0.16" />
        <path d={starPath(ROSE.x, ROSE.y, 10)} fill={GOLD} fillOpacity="0.32" />
        <text x={ROSE.x} y={ROSE.y - 62} textAnchor="middle" fontFamily="var(--font-display), Georgia, serif" fontStyle="italic" fontSize="15" fill={WARM_GREY} fillOpacity="0.42">
          N
        </text>
      </g>
    </>
  )
}

// Full-width flowing sweeps — terrain texture, and the element narrow
// viewports rely on (the slice crop keeps only the centre band on phones).
const SWEEPS = [
  { d: 'M -40 66 C 300 24, 620 108, 900 70 C 1140 38, 1330 52, 1480 86', color: GOLD, width: 1, opacity: 0.1 },
  { d: 'M -40 118 C 340 78, 660 156, 960 116 C 1180 88, 1350 104, 1480 132', color: WARM_GREY, width: 0.9, opacity: 0.1, dash: '7 5' },
  { d: 'M -40 596 C 360 556, 700 628, 1020 584 C 1240 556, 1380 572, 1480 600', color: WARM_GREY, width: 0.9, opacity: 0.09 },
]

function Sweeps() {
  return SWEEPS.map((s, i) => (
    <path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeOpacity={s.opacity} strokeDasharray={s.dash} />
  ))
}

/* ── variant 1: highlands — the original contour sheet ───────────────── */

const FORM_LEFT = {
  cx: 150, cy: 430, R: 400, rings: 9, drift: [10, 6],
  harmonics: [[2, 0.09, 0.8], [3, 0.06, 2.1], [5, 0.035, 4.4]],
}
const FORM_RIGHT = {
  cx: 1310, cy: 120, R: 310, rings: 7, drift: [-8, 7], squash: 0.85,
  harmonics: [[2, 0.08, 3.6], [4, 0.05, 1.2], [6, 0.03, 5.0]],
}
const FORM_KNOLL = {
  cx: 760, cy: 660, R: 240, rings: 6, drift: [6, -4], squash: 0.7,
  harmonics: [[3, 0.07, 0.4], [5, 0.04, 2.9]],
}

const HL_LANDFORMS = [landform(FORM_LEFT), landform(FORM_RIGHT), landform(FORM_KNOLL)]
const HL_ECHOES = [closedPath(ringPoints(FORM_LEFT, 1, 0, 1.14)), closedPath(ringPoints(FORM_RIGHT, 1, 0, 1.16))]

const HL_HACHURES = (() => {
  const segs = []
  for (let j = 0; j < 19; j++) {
    const t = 2.2 + (j / 18) * 1.7
    const r = FORM_LEFT.R * ringMod(FORM_LEFT.harmonics, 1, 0, t)
    const px = FORM_LEFT.cx + r * Math.cos(t)
    const py = FORM_LEFT.cy + r * Math.sin(t) * 0.78
    const L = Math.hypot(FORM_LEFT.cx - px, FORM_LEFT.cy - py)
    const ux = (FORM_LEFT.cx - px) / L
    const uy = (FORM_LEFT.cy - py) / L
    segs.push(`M ${(px + ux * 4).toFixed(1)} ${(py + uy * 4).toFixed(1)} L ${(px + ux * 14).toFixed(1)} ${(py + uy * 14).toFixed(1)}`)
  }
  return segs.join(' ')
})()

const HL_ROUTE =
  'M 230 478 C 380 560, 560 606, 740 596 C 900 588, 1080 560, 1200 546 C 1300 535, 1400 538, 1480 544'

function ContourRings({ rings }) {
  return rings.map((ring, ri) => (
    <path
      key={ri}
      d={ring.d}
      stroke={ring.index ? GOLD : WARM_GREY}
      strokeWidth={ring.index ? 1.2 : 0.9}
      strokeOpacity={ring.index ? 0.2 : 0.13}
      strokeDasharray={ring.index ? undefined : '7 5'}
    />
  ))
}

function Highlands() {
  return (
    <>
      <Sweeps />
      {HL_ECHOES.map((d, i) => (
        <path key={`e${i}`} d={d} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.09" strokeDasharray="2 7" strokeLinecap="round" />
      ))}
      {HL_LANDFORMS.map((rings, li) => <ContourRings key={li} rings={rings} />)}
      <path d={HL_HACHURES} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.13" strokeLinecap="round" />
      <path d={HL_ROUTE} stroke={GOLD} strokeWidth="1.6" strokeOpacity="0.2" strokeDasharray="0.5 8" strokeLinecap="round" />
      <TrigStation x={790} y={634} />
      <TrigStation x={365} y={128} />
      <path d={starPath(230, 478, 9)} fill={GOLD} fillOpacity="0.38" />
      <path d={starPath(1262, 162, 7)} fill={GOLD} fillOpacity="0.38" />
    </>
  )
}

/* ── variant 2: township — streets, river, rail ──────────────────────── */

const TOWN = { cx: 300, cy: 430, rot: -12 * (Math.PI / 180) }
const TU = [Math.cos(TOWN.rot), Math.sin(TOWN.rot)] // main-street axis
const TV = [-Math.sin(TOWN.rot), Math.cos(TOWN.rot)] // cross-street axis

const TOWN_BLOB = { cx: TOWN.cx, cy: TOWN.cy, R: 250, squash: 0.8, harmonics: [[2, 0.08, 1.1], [3, 0.05, 3.0], [5, 0.03, 0.5]] }
const TOWN_CLIP = closedPath(ringPoints(TOWN_BLOB, 1, 0))
const TOWN_BOUNDARY = closedPath(ringPoints(TOWN_BLOB, 1, 0, 1.12))

function gridLine(axis, cross, k, half) {
  const ox = TOWN.cx + cross[0] * k
  const oy = TOWN.cy + cross[1] * k
  return `M ${(ox - axis[0] * half).toFixed(1)} ${(oy - axis[1] * half).toFixed(1)} L ${(ox + axis[0] * half).toFixed(1)} ${(oy + axis[1] * half).toFixed(1)}`
}

const TOWN_MINOR = (() => {
  const segs = []
  for (let k = -7; k <= 7; k++) {
    if (k !== 0) segs.push(gridLine(TU, [TV[0] * 36, TV[1] * 36], k, 300))
  }
  for (let j = -6; j <= 6; j++) {
    if (j !== 0) segs.push(gridLine(TV, [TU[0] * 44, TU[1] * 44], j, 260))
  }
  return segs.join(' ')
})()

const TOWN_MAIN = `${gridLine(TU, [0, 0], 0, 320)} ${gridLine(TV, [0, 0], 0, 280)}`

// Arterials leaving town, the river, and the railway.
const ROAD_EAST = 'M 540 378 C 720 350, 950 330, 1480 296'
const ROAD_NORTH = 'M 245 171 C 320 90, 480 10, 620 -40'
const LANE_WEST = 'M 60 482 C 20 490, -10 495, -40 500'
const RIVER = 'M 1150 -40 C 1020 160, 880 260, 820 360 C 770 445, 780 560, 760 690'
const RIVER_ECHO = 'M 1162 -40 C 1032 158, 892 258, 832 358 C 782 443, 792 558, 772 690'

const RAIL_SEGS = [[[620, 690], [900, 600], [1160, 585], [1480, 565]]]
const RAIL_PATH = cubicsToPath(RAIL_SEGS)
const RAIL_TICKS = sampleCubics(RAIL_SEGS, 30)
  .map(([x, y, tx, ty]) => `M ${(x - ty * 4).toFixed(1)} ${(y + tx * 4).toFixed(1)} L ${(x + ty * 4).toFixed(1)} ${(y - tx * 4).toFixed(1)}`)
  .join(' ')

// Cadastral paddocks in the rural north-east.
const PADDOCKS = 'M 950 84 L 1140 60 L 1176 196 L 980 214 Z M 1176 196 L 1140 60 L 1332 84 L 1356 208 Z'

const ROUNDABOUT = { x: TOWN.cx + TU[0] * 180, y: TOWN.cy + TU[1] * 180 }

function Township() {
  return (
    <>
      <Sweeps />
      <defs>
        <clipPath id="aa-town-clip">
          <path d={TOWN_CLIP} />
        </clipPath>
      </defs>
      {/* municipal boundary + street fabric */}
      <path d={TOWN_BOUNDARY} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.11" strokeDasharray="10 6" />
      <g clipPath="url(#aa-town-clip)">
        <path d={TOWN_MINOR} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.12" />
        <path d={TOWN_MAIN} stroke={GOLD} strokeWidth="1.4" strokeOpacity="0.2" />
      </g>
      {/* arterials, lanes, river, rail */}
      <path d={ROAD_EAST} stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.18" />
      <path d={ROAD_NORTH} stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.14" />
      <path d={LANE_WEST} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.12" strokeDasharray="7 5" />
      <path d={RIVER} stroke={SAGE} strokeWidth="1.2" strokeOpacity="0.14" />
      <path d={RIVER_ECHO} stroke={SAGE} strokeWidth="0.8" strokeOpacity="0.08" strokeDasharray="2 6" strokeLinecap="round" />
      {/* bridge ticks where the east road crosses the river */}
      <path d="M 800 330 L 806 346 M 816 327 L 822 343" stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.18" />
      <path d={RAIL_PATH} stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.14" />
      <path d={RAIL_TICKS} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.12" />
      <path d={PADDOCKS} stroke={WARM_GREY} strokeWidth="0.9" strokeOpacity="0.1" strokeDasharray="7 5" />
      {/* town square, roundabout, survey points */}
      <path d={starPath(TOWN.cx, TOWN.cy, 8)} fill={GOLD} fillOpacity="0.38" />
      <circle cx={ROUNDABOUT.x} cy={ROUNDABOUT.y} r="9" stroke={WARM_GREY} strokeWidth="1" strokeOpacity="0.16" />
      <path d={starPath(ROUNDABOUT.x, ROUNDABOUT.y, 4)} fill={GOLD} fillOpacity="0.3" />
      <TrigStation x={620} y={120} />
      <TrigStation x={1060} y={610} />
    </>
  )
}

/* ── variant 3: coastline — harbour chart with water-lining ──────────── */

const COAST_SEGS = [
  [[-40, 300], [200, 220], [380, 180], [560, 210]],
  [[560, 210], [700, 235], [760, 300], [860, 330]],
  [[860, 330], [1000, 370], [1200, 330], [1480, 390]],
]
const COAST_PATH = cubicsToPath(COAST_SEGS)

// Water-lining: the coast repeated at increasing offsets into the water.
const WATER_LINES = [
  { dx: 8, dy: 16, opacity: 0.12 },
  { dx: 18, dy: 34, opacity: 0.1 },
  { dx: 30, dy: 56, opacity: 0.08 },
  { dx: 44, dy: 82, opacity: 0.06 },
]

// Coastal hachures on the land side.
const COAST_TICKS = sampleCubics(COAST_SEGS, 26)
  .map(([x, y, tx, ty]) => `M ${(x + ty * 3).toFixed(1)} ${(y - tx * 3).toFixed(1)} L ${(x + ty * 11).toFixed(1)} ${(y - tx * 11).toFixed(1)}`)
  .join(' ')

// Inland relief along the top edge. The innermost ring of each form is
// dropped — at the canvas edge it would render as a tiny floating oval
// instead of a cropped arc.
const COAST_FORMS = [
  landform({ cx: 220, cy: -20, R: 300, rings: 4, drift: [8, 4], squash: 0.7, harmonics: [[2, 0.08, 1.4], [4, 0.05, 3.3]] }).slice(0, 3),
  landform({ cx: 620, cy: -10, R: 170, rings: 3, drift: [-6, 5], squash: 0.7, harmonics: [[3, 0.07, 0.7], [5, 0.04, 2.2]] }).slice(0, 2),
]

// Soundings: deterministic scatter of depth dots in the water.
const SOUNDINGS = (() => {
  const dots = []
  for (let i = 0; i < 18; i++) {
    const x = 90 + ((i * 277) % 1360)
    const y = 470 + ((i * 137) % 130)
    dots.push([x, y])
  }
  return dots
})()

// Shipping route out of the harbour, and rhumb rays from the rose.
const SHIP_ROUTE = 'M -40 560 C 300 520, 700 500, 1000 516 C 1180 526, 1350 496, 1480 470'
const RHUMB_RAYS = (() => {
  const segs = []
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * TAU + TAU / 16
    segs.push(
      `M ${(ROSE.x + 58 * Math.cos(t)).toFixed(1)} ${(ROSE.y + 58 * Math.sin(t)).toFixed(1)} ` +
      `L ${(ROSE.x + 150 * Math.cos(t)).toFixed(1)} ${(ROSE.y + 150 * Math.sin(t)).toFixed(1)}`
    )
  }
  return segs.join(' ')
})()

// Lighthouse: a star on the eastern headland (clear of the centre mask)
// with three faint rays seaward.
const LIGHT = { x: 1310, y: 352 }
const LIGHT_RAYS = [1.8, 2.2, 2.6]
  .map(t => `M ${(LIGHT.x + 14 * Math.cos(t)).toFixed(1)} ${(LIGHT.y + 14 * Math.sin(t)).toFixed(1)} L ${(LIGHT.x + 30 * Math.cos(t)).toFixed(1)} ${(LIGHT.y + 30 * Math.sin(t)).toFixed(1)}`)
  .join(' ')

function Coastline() {
  return (
    <>
      {COAST_FORMS.map((rings, li) => <ContourRings key={li} rings={rings} />)}
      <path d={COAST_PATH} stroke={GOLD} strokeWidth="1.3" strokeOpacity="0.2" />
      <path d={COAST_TICKS} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.11" strokeLinecap="round" />
      {WATER_LINES.map((w, i) => (
        <path key={i} d={COAST_PATH} transform={`translate(${w.dx} ${w.dy})`} stroke={SAGE} strokeWidth="0.9" strokeOpacity={w.opacity} />
      ))}
      {SOUNDINGS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.2" fill={WARM_GREY} fillOpacity="0.2" />
      ))}
      <path d={SHIP_ROUTE} stroke={GOLD} strokeWidth="1.6" strokeOpacity="0.2" strokeDasharray="0.5 8" strokeLinecap="round" />
      <path d={RHUMB_RAYS} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.07" />
      <path d={LIGHT_RAYS} stroke={GOLD} strokeWidth="0.9" strokeOpacity="0.16" strokeLinecap="round" />
      <path d={starPath(LIGHT.x, LIGHT.y, 8)} fill={GOLD} fillOpacity="0.38" />
      <TrigStation x={150} y={262} />
    </>
  )
}

/* ── variant 4: southern sky — Crux and the Pointers ─────────────────── */

// Celestial graticule arcs.
const SKY_ARCS = [
  { d: 'M -40 120 C 400 40, 1000 40, 1480 130', color: GOLD, opacity: 0.12 },
  { d: 'M -40 330 C 400 240, 1000 240, 1480 330', color: WARM_GREY, opacity: 0.09, dash: '7 5' },
  { d: 'M -40 560 C 420 470, 1020 470, 1480 560', color: WARM_GREY, opacity: 0.1, dash: '7 5' },
]

// Crux — the Southern Cross — with its Greek letters, plus the Pointers.
const CRUX = [
  { x: 1010, y: 120, s: 7, label: 'γ' },
  { x: 1080, y: 330, s: 9, label: 'α' },
  { x: 940, y: 230, s: 7, label: 'β' },
  { x: 1130, y: 190, s: 6, label: 'δ' },
  { x: 1075, y: 255, s: 3.5, label: null }, // ε
]
const CRUX_AXES = 'M 1010 120 L 1080 330 M 940 230 L 1130 190'
const POINTERS = [
  { x: 700, y: 180, s: 8, label: 'α Cen' },
  { x: 800, y: 160, s: 6, label: null },
]
const POINTER_LINE = 'M 700 180 L 930 208'

// Star trails: dotted arc fragments circling the south celestial pole.
const POLE = { x: 260, y: 470 }
const TRAILS = [40, 70, 100, 130]
  .map((r, i) => {
    const a0 = -0.4 + i * 0.5
    const a1 = a0 + 2.1 - i * 0.15
    const x0 = POLE.x + r * Math.cos(a0)
    const y0 = POLE.y + r * Math.sin(a0)
    const x1 = POLE.x + r * Math.cos(a1)
    const y1 = POLE.y + r * Math.sin(a1)
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  })
  .join(' ')

// Minor stars: deterministic scatter, skipping the masked centre ellipse.
const MINOR_STARS = (() => {
  const stars = []
  for (let i = 0; i < 22; i++) {
    const x = 40 + ((i * 211) % 1380)
    const y = 30 + ((i * 89) % 590)
    const inCentre = ((x - 720) / 620) ** 2 + ((y - 256) / 300) ** 2 < 1
    if (!inCentre) stars.push({ x, y, big: i % 3 === 0 })
  }
  return stars
})()

function SouthernSky() {
  return (
    <>
      {SKY_ARCS.map((a, i) => (
        <path key={i} d={a.d} stroke={a.color} strokeWidth="0.9" strokeOpacity={a.opacity} strokeDasharray={a.dash} />
      ))}
      <path d={TRAILS} stroke={GOLD} strokeWidth="0.9" strokeOpacity="0.12" strokeDasharray="1 6" strokeLinecap="round" />
      <circle cx={POLE.x} cy={POLE.y} r="2.2" fill={GOLD} fillOpacity="0.3" />
      {MINOR_STARS.map((st, i) =>
        st.big ? (
          <path key={i} d={starPath(st.x, st.y, 3)} fill={GOLD} fillOpacity="0.2" />
        ) : (
          <circle key={i} cx={st.x} cy={st.y} r="1.2" fill={WARM_GREY} fillOpacity="0.2" />
        )
      )}
      <path d={CRUX_AXES} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.14" strokeDasharray="3 5" />
      <path d={POINTER_LINE} stroke={WARM_GREY} strokeWidth="0.8" strokeOpacity="0.12" strokeDasharray="3 5" />
      {[...CRUX, ...POINTERS].map((st, i) => (
        <g key={i}>
          <path d={starPath(st.x, st.y, st.s)} fill={GOLD} fillOpacity="0.38" />
          {st.label && (
            <text
              x={st.x + st.s + 6}
              y={st.y + 4}
              fontFamily="var(--font-display), Georgia, serif"
              fontStyle="italic"
              fontSize="11"
              fill={WARM_GREY}
              fillOpacity="0.4"
            >
              {st.label}
            </text>
          )}
        </g>
      ))}
      <text x={1060} y={92} textAnchor="middle" fontFamily="var(--font-display), Georgia, serif" fontStyle="italic" fontSize="12" fill={WARM_GREY} fillOpacity="0.38">
        Crux
      </text>
    </>
  )
}

/* ── the rotating wrapper ────────────────────────────────────────────── */

const VARIANTS = {
  highlands: Highlands,
  township: Township,
  coastline: Coastline,
  'southern-sky': SouthernSky,
}
const VARIANT_KEYS = Object.keys(VARIANTS)

export default function HeroAtlasBackground() {
  // Picked on mount only, so SSR renders nothing and there is no hydration
  // mismatch; the layer then fades in like the hero-rise entrance above it.
  const [variant, setVariant] = useState(null)

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('chart')
    setVariant(
      VARIANTS[forced] ? forced : VARIANT_KEYS[Math.floor(Math.random() * VARIANT_KEYS.length)]
    )
  }, [])

  if (!variant) return null
  const Sheet = VARIANTS[variant]

  return (
    <div
      aria-hidden="true"
      className="hero-chart-fade"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
        WebkitMaskImage: CENTER_MASK,
        maskImage: CENTER_MASK,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" fill="none">
        <SharedFrame />
        <Sheet />
      </svg>
    </div>
  )
}
