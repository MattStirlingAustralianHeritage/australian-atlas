/* ── Seeded topographic contours — the Atlas "terrain" motif ──
   Deterministic (same seed → same rings every render), pure math, no data or
   API dependency. Shared by the DiscoverCard typographic composition (client)
   and the homepage Discover band's section ground (server) so both surfaces
   speak the same cartographic language. Returns SVG path `d` strings sized
   for a 420×460 viewBox. */

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildContours(seedStr) {
  const rand = mulberry32(hashSeed(seedStr || 'atlas'))
  const cx = 120 + rand() * 200
  const cy = 140 + rand() * 180
  // A wobbly radial function shared by all rings, so they nest like a landform.
  const waves = [1, 2, 3].map((k) => ({
    k: k + Math.floor(rand() * 2),
    amp: 0.06 + rand() * 0.1,
    phase: rand() * Math.PI * 2,
  }))
  const rings = []
  for (let ring = 0; ring < 7; ring += 1) {
    const base = 36 + ring * 44
    let d = ''
    for (let i = 0; i <= 64; i += 1) {
      const th = (i / 64) * Math.PI * 2
      let r = base
      for (const w of waves) r *= 1 + w.amp * Math.sin(w.k * th + w.phase + ring * 0.35)
      const x = (cx + r * Math.cos(th)).toFixed(1)
      const y = (cy + r * Math.sin(th)).toFixed(1)
      d += (i === 0 ? `M${x} ${y}` : ` L${x} ${y}`)
    }
    rings.push(d + ' Z')
  }
  return rings
}
