#!/usr/bin/env node
// ============================================================
// Build Clusters — The Independent Australia Corpus
//
// Runs k-means clustering (k=50) on Voyage AI embeddings from the
// listings table, assigns each listing to a cluster, names each
// cluster via Claude, and generates an editorial insight report.
//
// Usage: node --env-file=.env.local scripts/build-clusters.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const K = 50            // number of clusters
const MAX_ITER = 50     // max k-means iterations
const PAGE_SIZE = 500   // Supabase fetch batch size
const CLAUDE_DELAY = 500 // ms between Claude API calls

// ── Helpers ──────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function cosineDist(a, b) {
  return 1 - cosineSimilarity(a, b)
}

function meanVector(vectors) {
  const dim = vectors[0].length
  const mean = new Float64Array(dim)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i]
  }
  const n = vectors.length
  for (let i = 0; i < dim; i++) mean[i] /= n
  return Array.from(mean)
}

function normalize(v) {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= norm
  }
}

// ── K-means++ initialization ────────────────────────────────

function kmeansppInit(vectors, k) {
  const n = vectors.length
  const centroids = []

  // Pick first centroid uniformly at random
  const first = Math.floor(Math.random() * n)
  centroids.push([...vectors[first]])

  // For each subsequent centroid, pick proportional to squared distance
  const minDists = new Float64Array(n).fill(Infinity)

  for (let c = 1; c < k; c++) {
    // Update minimum distances to nearest existing centroid
    const lastCentroid = centroids[c - 1]
    for (let i = 0; i < n; i++) {
      const d = cosineDist(vectors[i], lastCentroid)
      if (d < minDists[i]) minDists[i] = d
    }

    // Compute cumulative distribution of squared distances
    let totalWeight = 0
    for (let i = 0; i < n; i++) totalWeight += minDists[i] * minDists[i]

    const r = Math.random() * totalWeight
    let cumulative = 0
    let chosen = 0
    for (let i = 0; i < n; i++) {
      cumulative += minDists[i] * minDists[i]
      if (cumulative >= r) {
        chosen = i
        break
      }
    }

    centroids.push([...vectors[chosen]])
    if ((c + 1) % 10 === 0) process.stdout.write(`  k-means++ init: ${c + 1}/${k} centroids\r`)
  }
  console.log(`  k-means++ init: ${k}/${k} centroids — done`)

  return centroids
}

// ── Lloyd's K-means ─────────────────────────────────────────

function kmeans(vectors, k, maxIter = MAX_ITER) {
  const n = vectors.length
  console.log(`\nK-means clustering: ${n} vectors, k=${k}, max ${maxIter} iterations`)
  console.log(`Vector dimensionality: ${vectors[0].length}`)

  // Initialize centroids using k-means++
  const centroids = kmeansppInit(vectors, k)
  const assignments = new Int32Array(n)
  const distances = new Float64Array(n)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0

    // Assign each vector to nearest centroid
    for (let i = 0; i < n; i++) {
      let minDist = Infinity
      let minIdx = 0
      for (let c = 0; c < k; c++) {
        const dist = cosineDist(vectors[i], centroids[c])
        if (dist < minDist) {
          minDist = dist
          minIdx = c
        }
      }
      if (assignments[i] !== minIdx) changed++
      assignments[i] = minIdx
      distances[i] = minDist
    }

    console.log(`  Iteration ${iter + 1}: ${changed} reassignments`)
    if (changed === 0) break

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const members = []
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) members.push(vectors[i])
      }
      if (members.length > 0) {
        centroids[c] = meanVector(members)
        normalize(centroids[c])
      }
    }
  }

  return { assignments, distances, centroids }
}

// ── Claude API ──────────────────────────────────────────────

async function callClaude(prompt, maxTokens = 300) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.content[0].text
}

function parseJSON(text) {
  // Strip markdown fences if present
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  return JSON.parse(cleaned)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()

  console.log('═'.repeat(60))
  console.log('  BUILD CLUSTERS — The Independent Australia Corpus')
  console.log('═'.repeat(60))

  // ────────────────────────────────────────────────────────
  // Step 0: Validate environment
  // ────────────────────────────────────────────────────────
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  // ────────────────────────────────────────────────────────
  // Step 1: Clear previous cluster data (idempotent)
  // ────────────────────────────────────────────────────────
  console.log('\n[1/6] Clearing previous cluster data...')

  // Clear cluster_id and cluster_distance from all listings
  const { error: clearErr } = await sb.rpc('', {}).catch(() => ({}))
  // Supabase JS doesn't have a great way to do blanket UPDATE...
  // Use a trick: update where cluster_id is not null
  const { error: clearErr1 } = await sb
    .from('listings')
    .update({ cluster_id: null, cluster_distance: null })
    .not('cluster_id', 'is', null)
  if (clearErr1) console.warn('  Warning clearing cluster_id:', clearErr1.message)

  // Also clear any that somehow have only cluster_distance set
  const { error: clearErr2 } = await sb
    .from('listings')
    .update({ cluster_distance: null })
    .not('cluster_distance', 'is', null)
  if (clearErr2) console.warn('  Warning clearing cluster_distance:', clearErr2.message)

  // Delete all existing clusters
  const { error: delErr } = await sb
    .from('listing_clusters')
    .delete()
    .gte('id', 0)
  if (delErr) console.warn('  Warning deleting listing_clusters:', delErr.message)

  console.log('  Cleared.')

  // ────────────────────────────────────────────────────────
  // Step 2: Fetch all active listings with embeddings
  // ────────────────────────────────────────────────────────
  console.log('\n[2/6] Fetching listings with embeddings...')

  const listings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, suburb, description, embedding, quality_score')
      .eq('status', 'active')
      .not('embedding', 'is', null)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('  Fetch error:', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      try {
        const emb = typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : row.embedding
        if (Array.isArray(emb) && emb.length > 0) {
          listings.push({ ...row, embedding: emb })
        }
      } catch {
        // Skip rows with unparseable embeddings
      }
    }

    offset += data.length
    if (offset % PAGE_SIZE === 0) {
      console.log(`  Fetched ${offset} rows...`)
    }
    if (data.length < PAGE_SIZE) break
  }

  console.log(`  Total listings with valid embeddings: ${listings.length}`)

  if (listings.length < K) {
    console.error(`  Not enough listings (${listings.length}) for ${K} clusters. Aborting.`)
    process.exit(1)
  }

  // Detect dimensionality from first embedding
  const DIM = listings[0].embedding.length
  console.log(`  Detected embedding dimensionality: ${DIM}`)

  // Validate all embeddings have the same dimension
  const badDim = listings.filter(l => l.embedding.length !== DIM)
  if (badDim.length > 0) {
    console.warn(`  WARNING: ${badDim.length} listings have mismatched embedding dimensions — skipping them`)
    const filtered = listings.filter(l => l.embedding.length === DIM)
    listings.length = 0
    listings.push(...filtered)
    console.log(`  Continuing with ${listings.length} listings`)
  }

  // ────────────────────────────────────────────────────────
  // Step 3: Run k-means clustering
  // ────────────────────────────────────────────────────────
  console.log('\n[3/6] Running k-means clustering...')

  const vectors = listings.map(l => l.embedding)
  const { assignments, distances } = kmeans(vectors, K)

  // Build cluster membership
  const clusters = Array.from({ length: K }, () => ({
    members: [],
  }))

  for (let i = 0; i < listings.length; i++) {
    clusters[assignments[i]].members.push({
      idx: i,
      listing: listings[i],
      distance: distances[i],
    })
  }

  // Print cluster size distribution
  const sizes = clusters.map((c, i) => ({ index: i, size: c.members.length }))
  sizes.sort((a, b) => b.size - a.size)
  console.log(`\n  Cluster size distribution:`)
  console.log(`    Largest:  cluster ${sizes[0].index} (${sizes[0].size} members)`)
  console.log(`    Smallest: cluster ${sizes[sizes.length - 1].index} (${sizes[sizes.length - 1].size} members)`)
  console.log(`    Median:   ${sizes[Math.floor(sizes.length / 2)].size} members`)
  const empty = sizes.filter(s => s.size === 0).length
  if (empty > 0) console.log(`    Empty clusters: ${empty}`)

  // ────────────────────────────────────────────────────────
  // Step 4: Store cluster results in DB
  // ────────────────────────────────────────────────────────
  console.log('\n[4/6] Storing cluster assignments...')

  for (let c = 0; c < K; c++) {
    const members = clusters[c].members
    if (members.length === 0) continue

    // Sort by distance to centroid (most central first)
    members.sort((a, b) => a.distance - b.distance)

    // Geographic summary
    const stateCounts = {}
    const regionSet = new Set()
    const verticalCounts = {}

    for (const m of members) {
      const l = m.listing
      if (l.state) stateCounts[l.state] = (stateCounts[l.state] || 0) + 1
      if (l.region) regionSet.add(l.region)
      if (l.vertical) verticalCounts[l.vertical] = (verticalCounts[l.vertical] || 0) + 1
    }

    // Top 10 most central
    const top10 = members.slice(0, 10).map(m => ({
      id: m.listing.id,
      name: m.listing.name,
      vertical: m.listing.vertical,
      distance: Math.round(m.distance * 10000) / 10000,
    }))

    // Insert cluster row
    const { error: insertErr } = await sb
      .from('listing_clusters')
      .insert({
        cluster_index: c,
        member_count: members.length,
        geographic_summary: { states: stateCounts, regions: [...regionSet] },
        vertical_distribution: verticalCounts,
        representative_listings: top10,
      })

    if (insertErr) {
      console.error(`  Error inserting cluster ${c}:`, insertErr.message)
    }
  }

  // Update each listing's cluster_id and cluster_distance
  // Do in batches to avoid overwhelming the API
  let updateCount = 0
  let updateErrors = 0

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    const clusterId = assignments[i]
    const dist = Math.round(distances[i] * 10000) / 10000

    const { error: updateErr } = await sb
      .from('listings')
      .update({ cluster_id: clusterId, cluster_distance: dist })
      .eq('id', listing.id)

    if (updateErr) {
      updateErrors++
    } else {
      updateCount++
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Updated ${i + 1}/${listings.length} listings...`)
    }
  }

  console.log(`  Updated ${updateCount} listings (${updateErrors} errors)`)

  // ────────────────────────────────────────────────────────
  // Step 5: Name clusters using Claude
  // ────────────────────────────────────────────────────────
  console.log('\n[5/6] Naming clusters with Claude...')

  const clusterLabels = []

  for (let c = 0; c < K; c++) {
    const members = clusters[c].members
    if (members.length === 0) {
      clusterLabels.push({ index: c, label: '(empty)', description: 'No members', memberCount: 0 })
      continue
    }

    // Get the top 10 most central (already sorted)
    const top10 = members.slice(0, 10)
    const listingsSummary = top10.map((m, i) => {
      const l = m.listing
      const desc = (l.description || '').slice(0, 200)
      return `${i + 1}. ${l.name} (${l.vertical}, ${l.suburb || ''} ${l.region || ''}, ${l.state || ''})\n   "${desc}"`
    }).join('\n\n')

    const prompt = `You are the editorial intelligence for Australian Atlas, a curated guide to independent Australian places.

These 10 listings are the most representative members of a natural cluster that emerged from semantic analysis of ${members.length} independent Australian businesses:

${listingsSummary}

What do these places have in common? Give this cluster an editorial label — not a generic category but a specific editorial identity. Not "restaurants" but "farm-to-table dining in regional Victoria." Not "bookshops" but "independent booksellers with strong community identity."

Return JSON only: { "label": "the editorial label (5-12 words)", "description": "one sentence explaining what defines this cluster" }`

    try {
      const text = await callClaude(prompt)
      const parsed = parseJSON(text)
      clusterLabels.push({
        index: c,
        label: parsed.label,
        description: parsed.description,
        memberCount: members.length,
      })

      // Update the cluster row with label and description
      const { error: labelErr } = await sb
        .from('listing_clusters')
        .update({ label: parsed.label, description: parsed.description })
        .eq('cluster_index', c)

      if (labelErr) console.error(`  Error updating label for cluster ${c}:`, labelErr.message)

      console.log(`  Cluster ${String(c).padStart(2)}: ${parsed.label} (${members.length} members)`)
    } catch (err) {
      console.error(`  Error naming cluster ${c}:`, err.message)
      clusterLabels.push({
        index: c,
        label: `Cluster ${c}`,
        description: 'Failed to generate label',
        memberCount: members.length,
      })
    }

    await sleep(CLAUDE_DELAY)
  }

  // ────────────────────────────────────────────────────────
  // Step 6: Generate editorial insight report
  // ────────────────────────────────────────────────────────
  console.log('\n[6/6] Generating editorial insight report...')

  const clusterSummaries = clusterLabels
    .filter(c => c.memberCount > 0)
    .sort((a, b) => b.memberCount - a.memberCount)
    .map(c => {
      const cl = clusters[c.index]
      const states = cl.members.reduce((acc, m) => {
        if (m.listing.state) acc[m.listing.state] = (acc[m.listing.state] || 0) + 1
        return acc
      }, {})
      const topStates = Object.entries(states)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s, n]) => `${s}:${n}`)
        .join(', ')
      return `- "${c.label}" (${c.memberCount} businesses) [${topStates}]: ${c.description}`
    })
    .join('\n')

  const insightPrompt = `You are the editorial intelligence layer for Australian Atlas. You have just analysed ${listings.length} independent Australian businesses and identified ${K} natural clusters through semantic analysis of their descriptions and characteristics.

Here are the clusters:
${clusterSummaries}

Write a 500-word editorial insight titled "The Shape of Independent Australia." Address: What does independent Australia look like from this data? Which regions are culturally rich? Which categories are underrepresented? Where are the unexpected concentrations? What patterns emerge that no human curator would have noticed?

Voice: authoritative, specific, grounded in data. This is the seed of the State of Independent Australia report.`

  try {
    const insightText = await callClaude(insightPrompt, 1200)

    // Build raw_data payload
    const rawData = clusterLabels.map(c => ({
      cluster_index: c.index,
      label: c.label,
      member_count: c.memberCount,
      description: c.description,
    }))

    const { error: insightErr } = await sb
      .from('corpus_insights')
      .insert({
        cluster_count: K,
        listing_count: listings.length,
        insight_text: insightText,
        raw_data: rawData,
      })

    if (insightErr) {
      console.error('  Error storing insight:', insightErr.message)
    } else {
      console.log('  Insight report stored.')
    }

    console.log('\n' + '─'.repeat(60))
    console.log('THE SHAPE OF INDEPENDENT AUSTRALIA')
    console.log('─'.repeat(60))
    console.log(insightText)
    console.log('─'.repeat(60))
  } catch (err) {
    console.error('  Error generating insight report:', err.message)
  }

  // ── Final summary ─────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n' + '═'.repeat(60))
  console.log('  CLUSTERING COMPLETE')
  console.log('═'.repeat(60))
  console.log(`  Total listings clustered: ${listings.length}`)
  console.log(`  Clusters created:         ${K}`)
  console.log(`  Time elapsed:             ${elapsed}s`)

  console.log(`\n  Top 5 largest clusters:`)
  for (const s of sizes.slice(0, 5)) {
    const label = clusterLabels.find(c => c.index === s.index)?.label || '(unlabelled)'
    console.log(`    ${String(s.size).padStart(4)} members — ${label}`)
  }

  console.log(`\n  Top 5 smallest clusters:`)
  for (const s of sizes.slice(-5).reverse()) {
    const label = clusterLabels.find(c => c.index === s.index)?.label || '(unlabelled)'
    console.log(`    ${String(s.size).padStart(4)} members — ${label}`)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
