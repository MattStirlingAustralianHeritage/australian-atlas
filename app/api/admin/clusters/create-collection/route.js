import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ── Cross-vertical validation ─────────────────────────────────
const MAX_VERTICAL_PERCENT = 0.40
const MIN_VERTICALS = 3

function checkVerticalDiversity(listings) {
  if (!listings || listings.length < MIN_VERTICALS) {
    return { pass: true, warning: null }
  }

  const verticalCounts = {}
  for (const l of listings) {
    const v = l.vertical || 'unknown'
    verticalCounts[v] = (verticalCounts[v] || 0) + 1
  }

  const uniqueVerticals = Object.keys(verticalCounts).length
  const warnings = []

  for (const [vert, count] of Object.entries(verticalCounts)) {
    const pct = count / listings.length
    if (pct > MAX_VERTICAL_PERCENT) {
      warnings.push(
        `${vert} represents ${(pct * 100).toFixed(0)}% of listings (${count}/${listings.length})`
      )
    }
  }

  if (uniqueVerticals < MIN_VERTICALS) {
    warnings.push(
      `Only ${uniqueVerticals} vertical(s) represented — recommend at least ${MIN_VERTICALS}`
    )
  }

  return {
    pass: warnings.length === 0,
    warning: warnings.length > 0
      ? `Cross-vertical diversity warning: ${warnings.join('; ')}`
      : null,
    verticalCounts,
  }
}

/**
 * POST /api/admin/clusters/create-collection
 * Create a draft collection from a cluster's listings
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { clusterId } = body

    if (!clusterId) {
      return NextResponse.json({ error: 'Missing clusterId' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 1. Fetch the cluster
    const { data: cluster, error: clusterErr } = await sb
      .from('listing_clusters')
      .select('id, label, description, collection_id')
      .eq('id', clusterId)
      .single()

    if (clusterErr || !cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
    }

    if (cluster.collection_id) {
      return NextResponse.json({ error: 'Cluster already has a collection' }, { status: 409 })
    }

    // 2. Fetch all active listings in this cluster (with vertical for diversity check)
    const { data: listings, error: listingsErr } = await sb
      .from('listings')
      .select('id, vertical')
      .eq('cluster_id', clusterId)
      .eq('status', 'active')

    if (listingsErr) throw listingsErr

    const listingIds = (listings || []).map(l => l.id)

    // 2b. Check cross-vertical diversity
    const diversityCheck = checkVerticalDiversity(listings || [])
    const diversityWarning = diversityCheck.warning || null

    if (diversityWarning) {
      console.log(`[create-collection] ${diversityWarning}`)
    }

    // 3. Create the collection
    const slug = slugify(cluster.label)

    const { data: collection, error: collectionErr } = await sb
      .from('collections')
      .insert({
        title: cluster.label,
        slug,
        description: cluster.description,
        listing_ids: listingIds,
        author: 'Australian Atlas Editorial',
        published: false,
      })
      .select()
      .single()

    if (collectionErr) throw collectionErr

    // 4. Update the cluster with the new collection_id
    const { error: updateErr } = await sb
      .from('listing_clusters')
      .update({
        collection_id: collection.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clusterId)

    if (updateErr) {
      console.error('[create-collection] Failed to link collection to cluster:', updateErr.message)
      // Non-fatal — collection was created successfully
    }

    return NextResponse.json({
      slug: collection.slug,
      id: collection.id,
      ...(diversityWarning ? { diversityWarning } : {}),
    })
  } catch (err) {
    console.error('[admin/clusters/create-collection] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Collection creation failed' }, { status: 500 })
  }
}
