#!/usr/bin/env node
// Generates the homepage "living atlas" hero map asset.
//
//   node --env-file=.env.local scripts/generate-home-map.mjs
//
// Pipeline:
//   1. Fit Australia into the right-hand side of a 1280x500@1x canvas (the
//      left band is reserved for the editorial caption the component overlays)
//      and fetch mapbox/light-v11 at that centre/zoom. The custom Atlas Studio
//      style cannot be used here — the Static Images API returns a blank tile
//      for Standard-based (v3 `imports`) styles.
//   2. Re-paint every pixel as a two-tone atlas chart: water → hero cream,
//      land → warm parchment (keeping a whisper of the original luminance so
//      terrain isn't a dead flat). This also erases light-v11's baked labels,
//      roads and shields — the component adds its own crisp, clickable labels.
//   3. Rebuild depth: soft south-east shadow under the landmass (paper
//      cut-out), 1px ink coastline traced from the land/water mask, Natural
//      Earth state borders drawn through the same projection.
//   4. Plot every verified place from /api/map as a halo + core dot in its
//      vertical's brand colour.
//   5. Emit public/maps/home-map-atlas.{webp,jpg} and write the projection
//      constants to lib/map/homeAtlasProjection.js so server components can
//      project overlay coordinates onto the finished image.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
if (!TOKEN) { console.error('NEXT_PUBLIC_MAPBOX_TOKEN missing — run with --env-file=.env.local'); process.exit(1) }

// Two variants share the pipeline:
//   plate (default) — the interactive exhibit: full-strength dots, graticule,
//     paper-cut shadow, Australia pinned right of a caption band. Also emits
//     lib/map/homeAtlasProjection.js for the overlay component.
//   ghost (--ghost) — the hero's watermark: Australia centred, dots and
//     coast at a whisper, no graticule/shadow/borders. Sits UNDER a cream
//     wash behind the masthead + search, so it must murmur, not speak.
//     Never touches the projection module.
const GHOST = process.argv.includes('--ghost')

// ── Canvas + composition ────────────────────────────────────────────────
// Plate: 1180x520 — the continent takes ~42% of the frame width; the left
// band keeps room for the centred copy column.
// Ghost: 1280x680 — hero-ish aspect, continent centred with breathing room
// (it gets cover-cropped as a CSS background, so composition is loose).
const W = GHOST ? 1280 : 1180, H = GHOST ? 680 : 520, SCALE = 2
const AU = { west: 112.8, south: -43.9, east: 154.2, north: -9.8 }
// Vertical padding at 1x; horizontally Australia is pinned toward the right
// edge (plate) or centred (ghost).
const PAD = GHOST ? { top: 56, bottom: 56, oceanRight: null } : { top: 24, bottom: 26, oceanRight: 44 }

// Web Mercator helpers (worldSize = 512 * 2^zoom, the maths verified against
// city positions when the original asset shipped).
const mercX = (lng) => (lng + 180) / 360
const mercY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

// Height-constrained fit (Australia is near-square in Mercator; the strip is
// wide), then pin the landmass to the right of the canvas.
const boxH = H - PAD.top - PAD.bottom
const dx = mercX(AU.east) - mercX(AU.west)
const dy = mercY(AU.south) - mercY(AU.north)
const zoom = Math.log2(boxH / (512 * dy))
const worldSize = 512 * Math.pow(2, zoom)
const auW = worldSize * dx                     // Australia's pixel width @1x
const midX = (mercX(AU.west) + mercX(AU.east)) / 2
const midY = (mercY(AU.north) + mercY(AU.south)) / 2
const auMidPx = GHOST ? W / 2 : W - PAD.oceanRight - auW / 2   // bounds midpoint, x target
const auMidPy = PAD.top + boxH / 2
const centerX = midX + (W / 2 - auMidPx) / worldSize
const centerY = midY + (H / 2 - auMidPy) / worldSize
const centerLng = centerX * 360 - 180
const centerLat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180) / Math.PI
// (verified below by round-tripping the bounds corners)

// Project lng/lat → output px (@SCALE)
function project(lng, lat) {
  const x = (mercX(lng) - centerX) * worldSize + W / 2
  const y = (mercY(lat) - centerY) * worldSize + H / 2
  return [x * SCALE, y * SCALE]
}

// ── Palette ─────────────────────────────────────────────────────────────
// Ghost tones sit barely apart — under the hero wash the land should read
// as a pressure mark in the paper, not a shape with edges.
const OCEAN = GHOST ? { r: 0xF3, g: 0xEE, b: 0xE4 } : { r: 0xF0, g: 0xEB, b: 0xE3 }
const LAND  = GHOST ? { r: 0xEC, g: 0xE4, b: 0xD2 } : { r: 0xE9, g: 0xDF, b: 0xC9 }
const COAST = GHOST ? { r: 0xC9, g: 0xB5, b: 0x92 } : { r: 0xA9, g: 0x8F, b: 0x66 }
const SHADOW = '#A38B62'
const BORDER = '#B7A17B'
const PAPER = '#FBF8F2'
const DOT_HALO_OPACITY = GHOST ? 0 : 0.15
const DOT_CORE_R = GHOST ? 3.0 : 3.6
const DOT_CORE_OPACITY = GHOST ? 0.4 : 0.94
const DOT_STROKE_OPACITY = GHOST ? 0 : 0.9

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A',
  table: '#C4634F', way: '#6B7A4A',
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = process.env.HOME_MAP_CACHE_DIR || path.join(ROOT, '.next-map-cache')
fs.mkdirSync(CACHE, { recursive: true })

async function cachedFetch(name, url, opts) {
  const file = path.join(CACHE, name)
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text().then(t => t.slice(0, 200))}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(file, buf)
  return buf
}

async function main() {
  console.log(`zoom=${zoom.toFixed(4)} centre=${centerLng.toFixed(4)},${centerLat.toFixed(4)}`)
  // sanity: corners round-trip inside canvas
  for (const [lng, lat] of [[AU.west, AU.north], [AU.east, AU.south]]) {
    const [x, y] = project(lng, lat)
    console.log(`  corner ${lng},${lat} → ${(x / SCALE).toFixed(1)},${(y / SCALE).toFixed(1)}`)
  }

  // 1 ── base raster
  const staticUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${centerLng.toFixed(6)},${centerLat.toFixed(6)},${zoom.toFixed(4)},0/${W}x${H}@2x?access_token=${TOKEN}&logo=false&attribution=false`
  const base = await cachedFetch(GHOST ? 'base-light-v11-ghost.png' : 'base-light-v11.png', staticUrl, { headers: { Referer: 'https://australianatlas.com.au/' } })

  const { data: px, info } = await sharp(base).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const OW = info.width, OH = info.height
  if (OW !== W * SCALE || OH !== H * SCALE) throw new Error(`unexpected raster ${OW}x${OH}`)

  // 2 ── classify water vs land, repaint, build masks
  // At this zoom light-v11 is nearly two flat tones: water rgb(219,220,220),
  // land rgb(253,253,254). Everything else (baked labels, admin hairlines,
  // anti-aliased text) is "unknown" and gets resolved by neighbourhood: blur
  // the strict-water mask and threshold. This erases every baked label cleanly.
  const strictWater = Buffer.alloc(OW * OH)
  const known = new Uint8Array(OW * OH)
  for (let i = 0, p = 0; i < OW * OH; i++, p += 3) {
    const r = px[p], g = px[p + 1], b = px[p + 2]
    if (Math.abs(r - 219) <= 12 && Math.abs(g - 220) <= 12 && Math.abs(b - 220) <= 12) {
      strictWater[i] = 255; known[i] = 1
    } else if (r >= 243 && g >= 243 && b >= 243) {
      known[i] = 1                                  // strict land
    }
  }
  const blurred = await sharp(strictWater, { raw: { width: OW, height: OH, channels: 1 } })
    .blur(4).raw().toBuffer()
  let water = new Uint8Array(OW * OH)
  for (let i = 0; i < OW * OH; i++) {
    water[i] = known[i] ? (strictWater[i] ? 1 : 0) : (blurred[i] > 127 ? 1 : 0)
  }

  // ── mask hygiene: erase every trace of light-v11's baked labels ──
  // (a) morphological open-then-close on land kills text-width features in
  //     both directions: label-halo "peninsulas" jutting into the sea and
  //     letter-shaped "lakes" punched into the interior.
  const morph = (src, radius, op) => {
    const pick = op === 'min' ? Math.min : Math.max
    const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length)
    for (let y = 0; y < OH; y++) {
      for (let x = 0; x < OW; x++) {
        let v = src[y * OW + x]
        for (let d = 1; d <= radius; d++) {
          if (x - d >= 0) v = pick(v, src[y * OW + x - d])
          if (x + d < OW) v = pick(v, src[y * OW + x + d])
        }
        tmp[y * OW + x] = v
      }
    }
    for (let x = 0; x < OW; x++) {
      for (let y = 0; y < OH; y++) {
        let v = tmp[y * OW + x]
        for (let d = 1; d <= radius; d++) {
          if (y - d >= 0) v = pick(v, tmp[(y - d) * OW + x])
          if (y + d < OH) v = pick(v, tmp[(y + d) * OW + x])
        }
        out[y * OW + x] = v
      }
    }
    return out
  }
  let land = new Uint8Array(OW * OH)
  for (let i = 0; i < land.length; i++) land[i] = water[i] ? 0 : 1
  land = morph(morph(land, 2, 'min'), 2, 'max')   // open: shave text peninsulas
  land = morph(morph(land, 2, 'max'), 2, 'min')   // close: fill letter-lakes

  // (b) flood-fill sea from the frame edges; any unreached "water" is inland
  //     label residue (or a lake barely visible at this palette) → land.
  const sea = new Uint8Array(OW * OH)
  const queue = new Int32Array(OW * OH)
  let qh = 0, qt = 0
  const pushSea = (i) => { if (!sea[i] && !land[i]) { sea[i] = 1; queue[qt++] = i } }
  for (let x = 0; x < OW; x++) { pushSea(x); pushSea((OH - 1) * OW + x) }
  for (let y = 0; y < OH; y++) { pushSea(y * OW); pushSea(y * OW + OW - 1) }
  while (qh < qt) {
    const i = queue[qh++]
    const x = i % OW
    if (x > 0) pushSea(i - 1)
    if (x < OW - 1) pushSea(i + 1)
    if (i - OW >= 0) pushSea(i - OW)
    if (i + OW < OW * OH) pushSea(i + OW)
  }
  for (let i = 0; i < OW * OH; i++) if (!land[i] && !sea[i]) land[i] = 1

  // (c) cull land components that never touch the Australia pixel box —
  //     Indonesia/PNG fragments at the frame top and ocean-label halo
  //     "islands" (Mauritius, Indian Ocean, …) out in the open sea.
  const [auMinX, auMinY] = project(AU.west, AU.north)
  const [auMaxX, auMaxY] = project(AU.east, AU.south)
  const comp = new Int32Array(OW * OH).fill(-1)
  let nComp = 0
  const compKeep = []
  // Keep a component only if it intersects the AU box AND reaches south of
  // lat -11 — the mainland (via Cape York), Tasmania, and every real island
  // (Tiwi -11.3, Groote -13.6) qualify; the Timor and PNG slivers clipped by
  // the frame's top edge bottom out around -10.5 and do not.
  const southGate = project(133, -11.0)[1]
  for (let s = 0; s < OW * OH; s++) {
    if (!land[s] || comp[s] !== -1) continue
    const id = nComp++
    let touches = false, maxY = 0
    qh = 0; qt = 0; queue[qt++] = s; comp[s] = id
    while (qh < qt) {
      const i = queue[qh++]
      const x = i % OW, y = (i / OW) | 0
      if (y > maxY) maxY = y
      if (x >= auMinX - 8 && x <= auMaxX + 8 && y >= auMinY - 8 && y <= auMaxY + 8) touches = true
      if (x > 0 && land[i - 1] && comp[i - 1] === -1) { comp[i - 1] = id; queue[qt++] = i - 1 }
      if (x < OW - 1 && land[i + 1] && comp[i + 1] === -1) { comp[i + 1] = id; queue[qt++] = i + 1 }
      if (y > 0 && land[i - OW] && comp[i - OW] === -1) { comp[i - OW] = id; queue[qt++] = i - OW }
      if (y < OH - 1 && land[i + OW] && comp[i + OW] === -1) { comp[i + OW] = id; queue[qt++] = i + OW }
    }
    compKeep.push(touches && maxY >= southGate)
  }
  for (let i = 0; i < OW * OH; i++) if (land[i] && !compKeep[comp[i]]) land[i] = 0
  water = new Uint8Array(OW * OH)
  for (let i = 0; i < OW * OH; i++) water[i] = land[i] ? 0 : 1

  const landLayer = Buffer.alloc(OW * OH * 4)     // RGBA, transparent over water
  for (let i = 0, q = 0; i < OW * OH; i++, q += 4) {
    if (water[i]) continue
    landLayer[q] = LAND.r; landLayer[q + 1] = LAND.g; landLayer[q + 2] = LAND.b
    landLayer[q + 3] = 255
  }
  // coastline: land pixels with a water 4-neighbour get the ink stroke; the
  // matching water-side pixel takes a softer step so the line reads ~1.5px.
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const i = y * OW + x
      if (water[i]) continue
      const n = (x > 0 && water[i - 1]) || (x < OW - 1 && water[i + 1]) ||
                (y > 0 && water[i - OW]) || (y < OH - 1 && water[i + OW])
      if (!n) continue
      const q = i * 4
      landLayer[q] = COAST.r; landLayer[q + 1] = COAST.g; landLayer[q + 2] = COAST.b
    }
  }

  const landPng = await sharp(landLayer, { raw: { width: OW, height: OH, channels: 4 } }).png().toBuffer()

  // shadow = land alpha, tinted, blurred, nudged south-east
  const shadow = await sharp(landLayer, { raw: { width: OW, height: OH, channels: 4 } })
    .ensureAlpha()
    .composite([{ input: Buffer.from(`<svg width="${OW}" height="${OH}"><rect width="${OW}" height="${OH}" fill="${SHADOW}"/></svg>`), blend: 'in' }])
    .blur(9)
    .png().toBuffer()

  // 3 ── state borders through the same projection
  const neUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson'
  let borderSvgPaths = ''
  try {
    const ne = JSON.parse((await cachedFetch('ne-admin1-lines.geojson', neUrl)).toString())
    const lines = ne.features.filter(f => (f.properties.adm0_a3 || f.properties.ADM0_A3) === 'AUS')
    const toPath = (coords) => 'M' + coords.map(([lng, lat]) => project(lng, lat).map(v => v.toFixed(1)).join(',')).join('L')
    const ds = []
    for (const f of lines) {
      const g = f.geometry
      if (g.type === 'LineString') ds.push(toPath(g.coordinates))
      else if (g.type === 'MultiLineString') for (const c of g.coordinates) ds.push(toPath(c))
    }
    borderSvgPaths = ds.map(d =>
      `<path d="${d}" fill="none" stroke="${BORDER}" stroke-width="${1.1 * SCALE / 2}" stroke-opacity="0.55" stroke-dasharray="${3 * SCALE},${2.2 * SCALE}"/>`
    ).join('')
    console.log(`state borders: ${ds.length} segments`)
  } catch (e) {
    console.warn('state borders skipped:', e.message)
  }

  // 4 ── dots
  const dataFile = process.env.HOME_MAP_DATA || path.join(CACHE, 'map-data.json')
  if (!fs.existsSync(dataFile)) {
    const buf = await cachedFetch('map-data.json', 'https://www.australianatlas.com.au/api/map')
    fs.writeFileSync(dataFile, buf)
  }
  const listings = JSON.parse(fs.readFileSync(dataFile).toString()).listings || []
  const halos = [], cores = []
  let plotted = 0
  for (const l of listings) {
    const lng = parseFloat(l.lng), lat = parseFloat(l.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    if (lng < 112.5 || lng > 155 || lat > -10.2 || lat < -44.5) continue // geocode outliers
    const c = VERTICAL_COLORS[l.vertical]
    if (!c) continue
    const [x, y] = project(lng, lat)
    if (DOT_HALO_OPACITY > 0) halos.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" fill="${c}" fill-opacity="${DOT_HALO_OPACITY}"/>`)
    cores.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${DOT_CORE_R}" fill="${c}" fill-opacity="${DOT_CORE_OPACITY}"${DOT_STROKE_OPACITY > 0 ? ` stroke="${PAPER}" stroke-width="0.9" stroke-opacity="${DOT_STROKE_OPACITY}"` : ''}/>`)
    plotted++
  }
  console.log(`dots plotted: ${plotted}/${listings.length}`)

  const dotSvg = Buffer.from(
    `<svg width="${OW}" height="${OH}" xmlns="http://www.w3.org/2000/svg">${halos.join('')}${cores.join('')}</svg>`
  )
  // Natural Earth's AUS admin-1 line set includes offshore/maritime segments —
  // mask the strokes to the land layer so borders stop at the coast.
  const borderSvg = await sharp(Buffer.from(`<svg width="${OW}" height="${OH}" xmlns="http://www.w3.org/2000/svg">${borderSvgPaths}</svg>`))
    .composite([{ input: landPng, blend: 'dest-in' }])
    .png().toBuffer()

  // 5 ── composite: ocean → graticule → shadow → land → borders → dots
  // Faint 10° graticule engraved into the sea only (land covers it) — gives
  // the open ocean the texture of a chart plate instead of blank paper.
  const gratLines = []
  for (let lng = 90; lng <= 180; lng += 10) {
    const [gx] = project(lng, -25)
    if (gx > 0 && gx < OW) gratLines.push(`<line x1="${gx.toFixed(1)}" y1="0" x2="${gx.toFixed(1)}" y2="${OH}"/>`)
  }
  for (let lat = -50; lat <= 0; lat += 10) {
    const [, gy] = project(130, lat)
    if (gy > 0 && gy < OH) gratLines.push(`<line x1="0" y1="${gy.toFixed(1)}" x2="${OW}" y2="${gy.toFixed(1)}"/>`)
  }
  const gratSvg = Buffer.from(
    `<svg width="${OW}" height="${OH}" xmlns="http://www.w3.org/2000/svg"><g stroke="#8A7455" stroke-opacity="0.10" stroke-width="1">${gratLines.join('')}</g></svg>`
  )

  const oceanBase = sharp({
    create: { width: OW, height: OH, channels: 3, background: OCEAN },
  })
  const composed = await oceanBase
    .composite([
      // The ghost carries no chart furniture — no graticule, shadow, or
      // borders; just the pressure-mark continent and whisper dots.
      ...(GHOST ? [] : [
        { input: gratSvg, blend: 'over' },
        { input: shadow, left: Math.round(2.5 * SCALE), top: Math.round(3 * SCALE), blend: 'over' },
      ]),
      { input: landPng, blend: 'over' },
      ...(GHOST ? [] : [{ input: borderSvg, blend: 'over' }]),
      { input: dotSvg, blend: 'over' },
    ])
    .png().toBuffer()

  const outDir = path.join(ROOT, 'public', 'maps')
  fs.mkdirSync(outDir, { recursive: true })
  // Suffixed names: never write to home-map-atlas.{jpg,webp} — the retired
  // hero layout's HTML still references that path with cover-crop CSS, and
  // any cached copy of it rendering different bytes looks broken.
  const stem = GHOST ? 'home-map-atlas-ghost' : 'home-map-atlas-plate'
  await sharp(composed).webp({ quality: 84 }).toFile(path.join(outDir, `${stem}.webp`))
  await sharp(composed).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, `${stem}.jpg`))
  const sizes = ['webp', 'jpg'].map(ext => `${ext} ${(fs.statSync(path.join(outDir, `${stem}.${ext}`)).size / 1024).toFixed(0)}KB`)
  console.log(`written (${stem}): ${sizes.join(', ')}`)
  if (GHOST) return   // the ghost never writes the projection module

  // 6 ── projection constants for the overlay component
  const projModule = `// AUTO-GENERATED by scripts/generate-home-map.mjs — do not edit by hand.
// Projection constants for public/maps/home-map-atlas.{webp,jpg}: overlay
// components use these to place labels/pins on the image in percent terms.
export const HOME_MAP = {
  width: ${W}, height: ${H}, scale: ${SCALE},
  zoom: ${zoom.toFixed(6)}, centerX: ${centerX.toFixed(8)}, centerY: ${centerY.toFixed(8)},
}

const worldSize = 512 * Math.pow(2, HOME_MAP.zoom)

// → { leftPct, topPct } position on the rendered image for CSS placement.
export function projectToImagePct(lng, lat) {
  const mx = (lng + 180) / 360
  const s = Math.sin((lat * Math.PI) / 180)
  const my = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
  const x = (mx - HOME_MAP.centerX) * worldSize + HOME_MAP.width / 2
  const y = (my - HOME_MAP.centerY) * worldSize + HOME_MAP.height / 2
  return { leftPct: (x / HOME_MAP.width) * 100, topPct: (y / HOME_MAP.height) * 100 }
}
`
  fs.mkdirSync(path.join(ROOT, 'lib', 'map'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'lib', 'map', 'homeAtlasProjection.js'), projModule)
  console.log('projection module written: lib/map/homeAtlasProjection.js')
}

main().catch((e) => { console.error(e); process.exit(1) })
