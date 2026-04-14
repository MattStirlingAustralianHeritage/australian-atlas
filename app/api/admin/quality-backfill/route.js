import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// ── Meta table mapping by vertical ───────────────────────────
const META_TABLES = {
  sba: 'sba_meta',
  collection: 'collection_meta',
  craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta',
  rest: 'rest_meta',
  field: 'field_meta',
  corner: 'corner_meta',
  found: 'found_meta',
  table: 'table_meta',
}

const BATCH_SIZE = 500

// ── Quality Score (0-100) ────────────────────────────────────
// Scoring rubric:
//   Has description (>= 50 words):    +15
//   Has address:                       +10
//   Has phone:                         +5
//   Has website:                       +10
//   Has hero_image_url:                +15
//   Has lat/lng coordinates:           +10
//   Has region assigned:               +5
//   Has sub_type set:                  +5
//   Description > 100 words:           +5 bonus
//   Description > 200 words:           +5 bonus
//   Has meta table entry:              +10
//   Is claimed (is_claimed = true):    +5
//   Total max:                         100
function calculateQualityScore(listing, hasMeta) {
  let score = 0

  const wordCount = (listing.description || '').trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 50) score += 15

  if (listing.address && listing.address.trim().length > 0) score += 10
  if (listing.phone && listing.phone.trim().length > 0) score += 5
  if (listing.website && listing.website.trim().length > 0) score += 10
  if (listing.hero_image_url && listing.hero_image_url.trim().length > 0) score += 15
  if (listing.lat != null && listing.lng != null) score += 10
  if (listing.region && listing.region.trim().length > 0) score += 5
  if (listing.sub_type && listing.sub_type.trim().length > 0) score += 5

  if (wordCount > 100) score += 5
  if (wordCount > 200) score += 5

  if (hasMeta) score += 10
  if (listing.is_claimed) score += 5

  return Math.min(score, 100)
}

// ── POST: Run quality score backfill ─────────────────────────
export async function POST() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const startTime = Date.now()

    // Fetch all active listings
    const selectCols = [
      'id', 'name', 'description', 'website', 'phone', 'address',
      'lat', 'lng', 'hero_image_url', 'sub_type', 'region',
      'is_claimed', 'vertical', 'status', 'slug', 'suburb', 'state',
    ].join(', ')

    let allListings = []
    let offset = 0

    while (true) {
      const { data, error } = await sb
        .from('listings')
        .select(selectCols)
        .eq('status', 'active')
        .order('id')
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) throw new Error(`Fetch error: ${error.message}`)
      if (!data || data.length === 0) break
      allListings = allListings.concat(data)
      offset += data.length
      if (data.length < BATCH_SIZE) break
    }

    // Group by vertical and check meta tables
    const byVertical = {}
    for (const listing of allListings) {
      const v = listing.vertical || 'unknown'
      if (!byVertical[v]) byVertical[v] = []
      byVertical[v].push(listing)
    }

    const metaSet = new Set()
    for (const [vertical, listings] of Object.entries(byVertical)) {
      const metaTable = META_TABLES[vertical]
      if (!metaTable) continue

      const listingIds = listings.map(l => l.id)
      for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
        const batchIds = listingIds.slice(i, i + BATCH_SIZE)
        const { data: metaRows, error } = await sb
          .from(metaTable)
          .select('listing_id')
          .in('listing_id', batchIds)

        if (!error && metaRows) {
          for (const row of metaRows) {
            metaSet.add(row.listing_id)
          }
        }
      }
    }

    // Calculate scores
    const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 }
    const verticalScores = {}
    const allScored = []

    for (const listing of allListings) {
      const hasMeta = metaSet.has(listing.id)
      const qualityScore = calculateQualityScore(listing, hasMeta)

      if (qualityScore <= 20) distribution['0-20']++
      else if (qualityScore <= 40) distribution['21-40']++
      else if (qualityScore <= 60) distribution['41-60']++
      else if (qualityScore <= 80) distribution['61-80']++
      else distribution['81-100']++

      const v = listing.vertical || 'unknown'
      if (!verticalScores[v]) verticalScores[v] = { total: 0, count: 0 }
      verticalScores[v].total += qualityScore
      verticalScores[v].count++

      allScored.push({
        id: listing.id,
        name: listing.name,
        vertical: listing.vertical,
        slug: listing.slug,
        suburb: listing.suburb,
        state: listing.state,
        region: listing.region,
        qualityScore,
      })
    }

    // Batch update quality_score column
    let updated = 0
    let errors = 0

    for (let i = 0; i < allScored.length; i += BATCH_SIZE) {
      const batch = allScored.slice(i, i + BATCH_SIZE)
      for (const item of batch) {
        const { error: err } = await sb
          .from('listings')
          .update({ quality_score: item.qualityScore })
          .eq('id', item.id)
        if (err) { errors++; continue }
        updated++
      }
    }

    // Build response
    const avgByVertical = Object.entries(verticalScores)
      .map(([vertical, { total, count }]) => ({
        vertical,
        avg: Math.round(total / count),
        count,
      }))
      .sort((a, b) => b.avg - a.avg)

    const top20 = [...allScored]
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        name: l.name,
        vertical: l.vertical,
        slug: l.slug,
        suburb: l.suburb,
        state: l.state,
        score: l.qualityScore,
      }))

    const bottom20 = [...allScored]
      .sort((a, b) => a.qualityScore - b.qualityScore)
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        name: l.name,
        vertical: l.vertical,
        slug: l.slug,
        suburb: l.suburb,
        state: l.state,
        score: l.qualityScore,
      }))

    const overallAvg = allScored.length > 0
      ? Math.round(allScored.reduce((s, l) => s + l.qualityScore, 0) / allScored.length)
      : 0

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    return NextResponse.json({
      success: true,
      totalScored: allScored.length,
      updated,
      errors,
      overallAvg,
      distribution,
      avgByVertical,
      top20,
      bottom20,
      elapsedSeconds: parseFloat(elapsed),
    })
  } catch (err) {
    console.error('[admin/quality-backfill] POST error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
