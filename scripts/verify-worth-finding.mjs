// One-shot verification of the /api/home/worth-finding ranking against prod
// data. Replicates the route's candidate fetch + scoring for a real profiled
// user vs. a no-taste user at the same spot. Read-only; prints listing rows
// only, never env values. Run: node --env-file=.env.local scripts/verify-worth-finding.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const RADIUS_KM = 100
const TASTE_WEIGHT = 2.5
const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length
const strong = (l) => wordCount(l.description) >= 15
const tasteAffinity = (p, l) => {
  if (!p || !l) return 0
  const v = p.verticalWeights[l.vertical] || 0
  const s = l.sub_type ? (p.subTypeWeights[l.sub_type] || 0) : 0
  return Math.min(1, v + 2 * s)
}
const isPublic = (l) => !(typeof l?.slug === 'string' && l.slug.toLowerCase().startsWith('admin')) && l?.needs_review !== true

function pick(candidates, profile) {
  const score = (l) => {
    let s = tasteAffinity(profile, l) * TASTE_WEIGHT
    if (profile && l.region) s += 0.5 * (profile.regionWeights?.[l.region] || 0)
    if (l.is_featured) s += 1
    if (l.editors_pick) s += 0.6
    if (l.is_claimed) s += 0.3
    if (l.hero_image_url) s += 0.4
    if (strong(l)) s += 0.4
    s += (1 - Math.min(l.distance_km || 0, RADIUS_KM) / RADIUS_KM) * 0.8
    return s
  }
  const ranked = [...candidates].sort((a, b) => score(b) - score(a))
  const lead = ranked.find((l) => l.hero_image_url && strong(l)) || ranked.find(strong) || ranked[0]
  const rail = []
  const used = new Set([lead.vertical])
  for (const l of ranked) {
    if (l.id === lead.id || rail.length >= 3) continue
    if (!used.has(l.vertical)) { rail.push(l); used.add(l.vertical) }
  }
  if (rail.length < 3) {
    const have = new Set([lead.id, ...rail.map((r) => r.id)])
    for (const l of ranked) {
      if (rail.length >= 3) break
      if (!have.has(l.id)) { rail.push(l); have.add(l.id) }
    }
  }
  return [lead, ...rail].map((l) => `${l.name} [${l.vertical}${l.sub_type ? '/' + l.sub_type : ''}] ${l.distance_km.toFixed(1)}km`)
}

const SPOTS = [
  { label: 'Mornington Peninsula (-38.35,145.05)', lat: -38.35, lng: 145.05 },
  { label: 'Sydney CBD (-33.87,151.21)', lat: -33.87, lng: 151.21 },
  { label: 'Remote Simpson Desert (-26.0,137.0)', lat: -26.0, lng: 137.0 },
]

// Matt's profiled account (34+ positives per taste_profiles).
const { data: profRows } = await sb.from('profiles').select('id, email').ilike('email', 'stirling.mattski%')
const userId = profRows?.[0]?.id
const { data: tp } = await sb.from('taste_profiles').select('category_shares, source_count').eq('profile_id', userId).maybeSingle()
const shares = tp?.source_count >= 3 ? tp.category_shares : null
console.log(`profile: source_count=${tp?.source_count}, top verticals=${shares ? Object.entries(shares.verticalWeights).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}:${v.toFixed(2)}`).join(' ') : 'NONE'}`)

for (const spot of SPOTS) {
  const { data, error } = await sb.rpc('nearby_listings', {
    center_lat: spot.lat, center_lng: spot.lng, radius_km: RADIUS_KM, filter_vertical: null, max_results: 400,
  })
  if (error) { console.log(spot.label, 'RPC ERROR', error.message); continue }
  const cands = (data || []).filter((l) => isPublic(l) && l.slug && !String(l.name || '').startsWith('_'))
  console.log(`\n── ${spot.label}: ${cands.length} candidates ≤100km`)
  if (cands.length < 2) { console.log('   <2 candidates → API returns empty → editorial band kept'); continue }
  const maxD = Math.max(...cands.map((c) => c.distance_km))
  console.log(`   max candidate distance: ${maxD.toFixed(1)}km (must be ≤100)`)
  console.log('   WITH taste :', pick(cands, shares).join(' | '))
  console.log('   NO taste   :', pick(cands, null).join(' | '))
}
