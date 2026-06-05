import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'
import { isCoffeeListing, isLunchListing } from '@/lib/plan-a-stay/assemble-days'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Intent → vertical mapping
   ═══════════════════════════════════════════════════════════════════════ */
const INTENT_VERTICAL_MAP = {
  'food-and-producers': {
    primary: ['sba', 'table'],
    secondary: ['field'],
  },
  'landscape-and-walking': {
    primary: ['field'],
    secondary: [],
  },
  'makers-and-craft': {
    primary: ['craft', 'collection'],
    secondary: [],
  },
  'quiet-and-slow': {
    primary: ['rest', 'found', 'corner'],
    secondary: [],
  },
  'a-bit-of-everything': {
    primary: ['table', 'craft', 'field', 'sba', 'rest'],
    secondary: ['collection', 'found', 'corner', 'fine_grounds'],
  },
}

/* ═══════════════════════════════════════════════════════════════════════
   Pacing → distance budgets
   ═══════════════════════════════════════════════════════════════════════ */
const PACING_BUDGETS = {
  'out-early-back-late': { radius_km: 90, daily_drive_km: 200 },
  'steady':             { radius_km: 50, daily_drive_km: 120 },
  'as-little-driving':  { radius_km: 20, daily_drive_km: 50 },
  'surprise-us':        { radius_km: 50, daily_drive_km: 120 },
}

/* ═══════════════════════════════════════════════════════════════════════
   Ranking weights and thresholds
   ═══════════════════════════════════════════════════════════════════════ */
const RANKING_WEIGHTS = {
  vertical_match:      0.40,
  distance_score:      0.20,
  description_quality: 0.30,
  featured_boost:      0.10,
}

const DESCRIPTION_QUALITY_CAP = 800

/* ═══════════════════════════════════════════════════════════════════════
   Math helpers
   ═══════════════════════════════════════════════════════════════════════ */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function geoMean(points) {
  if (points.length === 0) return { lat: 0, lng: 0 }
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  )
  return { lat: sum.lat / points.length, lng: sum.lng / points.length }
}

/* ═══════════════════════════════════════════════════════════════════════
   K-means clustering (k-means++ seeding, haversine distance)
   ═══════════════════════════════════════════════════════════════════════ */
function kMeansCluster(points, k, maxIter = 20) {
  if (points.length <= k) {
    // Each point is its own cluster
    return points.map((p, i) => ({ centroid: { lat: p.lat, lng: p.lng }, members: [i] }))
  }

  // ── k-means++ seeding ──────────────────────────────────────────
  const centroids = []
  // First centroid: weighted random by nothing special (just pick one)
  const firstIdx = Math.floor(Math.random() * points.length)
  centroids.push({ lat: points[firstIdx].lat, lng: points[firstIdx].lng })

  for (let c = 1; c < k; c++) {
    // Compute squared distance from each point to its nearest centroid
    const dists = points.map(p => {
      let minD = Infinity
      for (const cen of centroids) {
        const d = haversineKm(p.lat, p.lng, cen.lat, cen.lng)
        if (d < minD) minD = d
      }
      return minD * minD
    })
    const totalDist = dists.reduce((a, b) => a + b, 0)
    if (totalDist === 0) {
      // All points co-located; duplicate a centroid
      centroids.push({ ...centroids[0] })
      continue
    }
    // Weighted random selection
    let r = Math.random() * totalDist
    let picked = 0
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i]
      if (r <= 0) { picked = i; break }
    }
    centroids.push({ lat: points[picked].lat, lng: points[picked].lng })
  }

  // ── Iterate ────────────────────────────────────────────────────
  let assignments = new Array(points.length).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = points.map(p => {
      let bestC = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = haversineKm(p.lat, p.lng, centroids[c].lat, centroids[c].lng)
        if (d < bestD) { bestD = d; bestC = c }
      }
      return bestC
    })

    // Check convergence
    const changed = newAssignments.some((a, i) => a !== assignments[i])
    assignments = newAssignments
    if (!changed) break

    // Recompute centroids
    for (let c = 0; c < centroids.length; c++) {
      const members = points.filter((_, i) => assignments[i] === c)
      if (members.length > 0) {
        const mean = geoMean(members)
        centroids[c].lat = mean.lat
        centroids[c].lng = mean.lng
      }
    }
  }

  // ── Collect clusters ───────────────────────────────────────────
  const clusters = centroids.map((cen, c) => ({
    centroid: { lat: cen.lat, lng: cen.lng },
    members: [],
  }))
  assignments.forEach((c, i) => clusters[c].members.push(i))

  return clusters
}

/* ═══════════════════════════════════════════════════════════════════════
   Resolve verticals from intent array
   ═══════════════════════════════════════════════════════════════════════ */
function resolveVerticals(intents) {
  const primary = new Set()
  const secondary = new Set()
  for (const intent of intents) {
    const mapping = INTENT_VERTICAL_MAP[intent]
    if (!mapping) continue
    mapping.primary.forEach(v => primary.add(v))
    mapping.secondary.forEach(v => { if (!primary.has(v)) secondary.add(v) })
  }
  return { primary: [...primary], secondary: [...secondary] }
}

/* ═══════════════════════════════════════════════════════════════════════
   Within-cluster ranking
   ═══════════════════════════════════════════════════════════════════════ */
function rankCandidates(candidates, clusterCentroid, primaryVerticals, secondaryVerticals) {
  // Compute distances from cluster centroid
  const withDist = candidates.map(c => ({
    ...c,
    dist_from_centroid: haversineKm(c.lat, c.lng, clusterCentroid.lat, clusterCentroid.lng),
  }))

  const maxDist = Math.max(...withDist.map(c => c.dist_from_centroid), 0.001) // avoid /0

  return withDist
    .map(c => {
      const verticalMatch = primaryVerticals.includes(c.vertical)
        ? 1.0
        : secondaryVerticals.includes(c.vertical)
          ? 0.6
          : 0.3
      const distanceScore = 1 - (c.dist_from_centroid / maxDist)
      const descQuality = Math.min(1.0, (c.description?.length || 0) / DESCRIPTION_QUALITY_CAP)
      const featuredBoost = c.is_featured ? 1.0 : 0.0

      const score =
        verticalMatch * RANKING_WEIGHTS.vertical_match +
        distanceScore * RANKING_WEIGHTS.distance_score +
        descQuality * RANKING_WEIGHTS.description_quality +
        featuredBoost * RANKING_WEIGHTS.featured_boost

      return { ...c, score, dist_from_centroid: Math.round(c.dist_from_centroid * 10) / 10 }
    })
    .sort((a, b) => b.score - a.score)
}

/* ═══════════════════════════════════════════════════════════════════════
   Meal + accommodation pools
   ═══════════════════════════════════════════════════════════════════════
   Fetched region-wide and independent of the trip's intent, so every day
   can open with a coffee, anchor a lunch, and offer somewhere to stay —
   even when none of those verticals matched the chosen interests.        */
const POOL_DATA_QUALITY_CUTOFF_KM = 300

async function fetchMealAndRestPools(sb, regionId, tripCenter) {
  async function regionScoped(verticals) {
    let q = sb
      .from('listings')
      .select('id, name, slug, vertical, sub_type, lat, lng, suburb')
      .eq('status', 'active')
      .eq('visitable', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .in('vertical', verticals)

    if (regionId) {
      q = q.or(`region_computed_id.eq.${regionId},region_override_id.eq.${regionId}`)
    }
    q = q.limit(400)

    const { data, error } = await q
    if (error) {
      console.warn('[plan-a-stay/retrieve] pool query failed:', error.message)
      return []
    }
    let rows = data || []
    // Drop coordinate/region mismatches the same way the activity query does.
    if (tripCenter) {
      rows = rows.filter(r =>
        haversineKm(r.lat, r.lng, tripCenter.lat, tripCenter.lng) <= POOL_DATA_QUALITY_CUTOFF_KM
      )
    }
    return rows
  }

  const [mealRows, restRows] = await Promise.all([
    regionScoped(['fine_grounds', 'table']),
    regionScoped(['rest']),
  ])

  return {
    coffee: mealRows.filter(isCoffeeListing),
    lunch: mealRows.filter(isLunchListing),
    rest: restRows,
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   POST handler
   ═══════════════════════════════════════════════════════════════════════ */
export async function POST(request) {
  try {
    const body = await request.json()
    const { intent, pacing, duration, region, anchor } = body

    // ── Validate inputs ────────────────────────────────────────────
    if (!intent || !Array.isArray(intent) || intent.length === 0) {
      return NextResponse.json({ error: 'intent is required (array of 1-2)' }, { status: 400 })
    }
    if (!duration || typeof duration !== 'number' || duration < 1 || duration > 7) {
      return NextResponse.json({ error: 'duration must be 1-7' }, { status: 400 })
    }
    if (!anchor && !region) {
      return NextResponse.json({ error: 'region is required when anchor is null' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const filterPath = []
    const fallbacksUsed = []
    let bindingConstraint = 'none'

    // ── Resolve pacing budget ──────────────────────────────────────
    const budget = PACING_BUDGETS[pacing] || PACING_BUDGETS['steady']
    filterPath.push(`pacing: ${pacing} → radius ${budget.radius_km}km`)

    // ── Resolve verticals from intent ──────────────────────────────
    const { primary: primaryVerticals, secondary: secondaryVerticals } = resolveVerticals(intent)
    filterPath.push(`intent: [${intent.join(', ')}] → primary: [${primaryVerticals.join(', ')}]`)

    // ── Look up region ─────────────────────────────────────────────
    let tripCenter = null
    let regionId = null

    if (region && region !== '__not_sure') {
      const { data: regionRow, error: regionErr } = await sb
        .from('regions')
        .select('id, name, center_lat, center_lng')
        .eq('name', region)
        .single()

      if (regionErr || !regionRow) {
        return NextResponse.json({ error: `Region not found: ${region}` }, { status: 404 })
      }

      regionId = regionRow.id

      if (regionRow.center_lat && regionRow.center_lng) {
        tripCenter = { lat: regionRow.center_lat, lng: regionRow.center_lng }
        filterPath.push(`region: "${region}" → centroid (${tripCenter.lat}, ${tripCenter.lng})`)
      }
    }

    // ── Build candidate query ──────────────────────────────────────
    const minCandidates = duration * 2

    let query = sb
      .from('listings')
      .select('id, name, slug, vertical, sub_type, lat, lng, description, is_featured, suburb')
      .eq('status', 'active')
      .eq('visitable', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    // Region filter: match on either region_computed_id or region_override_id
    if (regionId) {
      query = query.or(`region_computed_id.eq.${regionId},region_override_id.eq.${regionId}`)
    }

    // Vertical filter: start with primary
    let activeVerticals = [...primaryVerticals]
    query = query.in('vertical', activeVerticals)

    query = query.limit(500)

    let { data: candidates, error: queryErr } = await query

    if (queryErr) {
      return NextResponse.json({ error: 'Database query failed', detail: queryErr.message }, { status: 500 })
    }

    candidates = (candidates || []).filter(c => (c.description?.length || 0) > 100)
    const candidatesPreSpatial = candidates.length
    filterPath.push(`primary query: ${candidatesPreSpatial} candidates (verticals: [${activeVerticals.join(', ')}])`)

    // ── Fallback to secondary verticals if too few ─────────────────
    if (candidates.length < minCandidates && secondaryVerticals.length > 0) {
      const expandedVerticals = [...new Set([...activeVerticals, ...secondaryVerticals])]

      let fallbackQuery = sb
        .from('listings')
        .select('id, name, slug, vertical, sub_type, lat, lng, description, is_featured, suburb')
        .eq('status', 'active')
        .eq('visitable', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)

      if (regionId) {
        fallbackQuery = fallbackQuery.or(`region_computed_id.eq.${regionId},region_override_id.eq.${regionId}`)
      }

      fallbackQuery = fallbackQuery.in('vertical', expandedVerticals).limit(500)

      const { data: fallbackData } = await fallbackQuery
      const expanded = (fallbackData || []).filter(c => (c.description?.length || 0) > 100)

      if (expanded.length > candidates.length) {
        candidates = expanded
        activeVerticals = expandedVerticals
        fallbacksUsed.push('secondary_verticals')
        filterPath.push(`secondary fallback: ${candidates.length} candidates (verticals: [${expandedVerticals.join(', ')}])`)
      }
    }

    if (candidates.length < minCandidates) {
      bindingConstraint = 'vertical_coverage'
      filterPath.push(`binding constraint: vertical_coverage (${candidates.length} < ${minCandidates} needed)`)
    }

    // ── Hard 300km region/coordinate mismatch filter ────────────────
    // Any listing whose coordinates are >300km from the region
    // centroid is almost certainly a misassigned region FK.
    const DATA_QUALITY_CUTOFF_KM = 300
    const excludedFarFromCentroid = []

    if (tripCenter) {
      const beforeHard = candidates.length
      candidates = candidates.filter(c => {
        const d = haversineKm(c.lat, c.lng, tripCenter.lat, tripCenter.lng)
        if (d > DATA_QUALITY_CUTOFF_KM) {
          console.warn(`[plan-a-stay/retrieve] Excluding listing ${c.id} ("${c.name}"): ${Math.round(d)}km from region centroid (>${DATA_QUALITY_CUTOFF_KM}km)`)
          excludedFarFromCentroid.push(c.id)
          return false
        }
        return true
      })
      if (excludedFarFromCentroid.length > 0) {
        filterPath.push(`data quality filter: removed ${excludedFarFromCentroid.length} listings >${DATA_QUALITY_CUTOFF_KM}km from region centroid`)
      }
    }

    // ── Pre-clustering spatial filter ──────────────────────────────
    // Exclude remaining outliers using 2× the pacing radius —
    // anything beyond that can't be in a viable cluster.
    if (tripCenter) {
      const spatialCutoff = budget.radius_km * 2
      const before = candidates.length
      candidates = candidates.filter(c =>
        haversineKm(c.lat, c.lng, tripCenter.lat, tripCenter.lng) <= spatialCutoff
      )
      if (candidates.length < before) {
        filterPath.push(`spatial pre-filter: removed ${before - candidates.length} outliers beyond ${spatialCutoff}km from trip centre`)
      }
    }

    const candidatesBeforeClustering = candidates.length

    // ── Compute trip centre from candidates if no precomputed centroid ─
    if (!tripCenter && candidates.length > 0) {
      tripCenter = geoMean(candidates)
      fallbacksUsed.push('centroid_from_candidates')
      filterPath.push(`trip centre fallback: computed from ${candidates.length} candidate positions`)
    }

    if (!tripCenter) {
      const pools = await fetchMealAndRestPools(sb, regionId, null)
      return NextResponse.json({
        clusters: [],
        pools,
        coverage: {
          clusters_found: 0,
          clusters_requested: duration,
          intent_match_rate: 0,
          binding_constraint: 'vertical_coverage',
          fallbacks_used: fallbacksUsed,
        },
        diagnostics: {
          candidates_before_clustering: 0,
          candidates_after_clustering: 0,
          filter_path: filterPath,
        },
      })
    }

    // ── Cluster candidates ─────────────────────────────────────────
    const k = Math.min(duration, candidates.length)
    let rawClusters = kMeansCluster(candidates, k)

    // ── Merge single-member clusters into nearest neighbour ────────
    const merged = []
    const toMerge = []

    for (const cluster of rawClusters) {
      if (cluster.members.length <= 1) {
        toMerge.push(cluster)
      } else {
        merged.push(cluster)
      }
    }

    for (const orphan of toMerge) {
      if (merged.length === 0) {
        // No multi-member clusters exist; keep orphans as-is
        merged.push(orphan)
        continue
      }
      // Find nearest multi-member cluster
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < merged.length; i++) {
        const d = haversineKm(
          orphan.centroid.lat, orphan.centroid.lng,
          merged[i].centroid.lat, merged[i].centroid.lng
        )
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      merged[bestIdx].members.push(...orphan.members)
    }

    // Recompute centroids after merging
    for (const cluster of merged) {
      const pts = cluster.members.map(i => candidates[i])
      const mean = geoMean(pts)
      cluster.centroid = { lat: mean.lat, lng: mean.lng }
    }

    // ── Filter clusters by distance budget ─────────────────────────
    let validClusters = merged.filter(cluster => {
      const d = haversineKm(tripCenter.lat, tripCenter.lng, cluster.centroid.lat, cluster.centroid.lng)
      cluster._distFromCenter = Math.round(d * 10) / 10
      return d <= budget.radius_km
    })

    if (validClusters.length < merged.length && bindingConstraint === 'none') {
      bindingConstraint = 'distance_budget'
      filterPath.push(`binding constraint: distance_budget (${merged.length - validClusters.length} clusters outside ${budget.radius_km}km radius)`)
    }

    // Final constraint check: if we have fewer clusters than requested
    // after all filtering, determine why
    if (validClusters.length < duration && bindingConstraint === 'none') {
      bindingConstraint = 'region_size'
      filterPath.push(`binding constraint: region_size (${validClusters.length} clusters from ${candidatesBeforeClustering} candidates; region lacks geographic diversity for ${duration} days)`)
    }

    // ── Region compactness detection ──────────────────────────────
    // If all candidates are within a tight radius of trip centre,
    // the region is compact — downstream disclosures can adapt copy.
    let regionCompact = false
    if (tripCenter && candidates.length > 0) {
      const maxSpread = Math.max(
        ...candidates.map(c => haversineKm(c.lat, c.lng, tripCenter.lat, tripCenter.lng))
      )
      regionCompact = maxSpread < budget.radius_km * 0.5
    }

    // ── Rank within each cluster ───────────────────────────────────
    const outputClusters = validClusters.map((cluster, idx) => {
      const clusterCandidates = cluster.members.map(i => candidates[i])
      const ranked = rankCandidates(clusterCandidates, cluster.centroid, primaryVerticals, secondaryVerticals)
      const top5 = ranked.slice(0, 5)

      return {
        cluster_index: idx,
        centroid: {
          lat: Math.round(cluster.centroid.lat * 10000) / 10000,
          lng: Math.round(cluster.centroid.lng * 10000) / 10000,
        },
        dist_from_trip_center_km: cluster._distFromCenter,
        candidate_count: clusterCandidates.length,
        candidates: top5.map(c => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          vertical: c.vertical,
          sub_type: c.sub_type,
          lat: c.lat,
          lng: c.lng,
          suburb: c.suburb || null,
          is_featured: c.is_featured,
          score: Math.round(c.score * 1000) / 1000,
          dist_from_centroid_km: c.dist_from_centroid,
          description_length: c.description?.length || 0,
        })),
      }
    })

    // Sort clusters by distance from trip centre (closest first)
    outputClusters.sort((a, b) => a.dist_from_trip_center_km - b.dist_from_trip_center_km)
    outputClusters.forEach((c, i) => { c.cluster_index = i })

    // ── Compute coverage metadata ──────────────────────────────────
    const allReturnedCandidates = outputClusters.flatMap(c => c.candidates)
    const intentMatchCount = allReturnedCandidates.filter(c =>
      primaryVerticals.includes(c.vertical)
    ).length
    const intentMatchRate = allReturnedCandidates.length > 0
      ? Math.round((intentMatchCount / allReturnedCandidates.length) * 1000) / 1000
      : 0

    const candidatesAfterClustering = allReturnedCandidates.length

    // ── Meal + accommodation pools (region-wide, intent-independent) ───
    const pools = await fetchMealAndRestPools(sb, regionId, tripCenter)

    return NextResponse.json({
      clusters: outputClusters,
      pools,
      coverage: {
        clusters_found: outputClusters.length,
        clusters_requested: duration,
        intent_match_rate: intentMatchRate,
        binding_constraint: bindingConstraint,
        region_compact: regionCompact,
        fallbacks_used: fallbacksUsed,
      },
      diagnostics: {
        candidates_before_clustering: candidatesBeforeClustering,
        candidates_after_clustering: candidatesAfterClustering,
        filter_path: filterPath,
        data_quality_warnings: excludedFarFromCentroid.length > 0
          ? {
              excluded_far_from_centroid: excludedFarFromCentroid.length,
              excluded_listing_ids: excludedFarFromCentroid,
            }
          : null,
      },
    })
  } catch (err) {
    console.error('[plan-a-stay/retrieve]', err)
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 })
  }
}
