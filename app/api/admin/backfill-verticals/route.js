import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * One-time backfill: push candidate-sourced master listings to their vertical DBs.
 * GET /api/admin/backfill-verticals
 *
 * Finds all listings with source_id starting with 'candidate-',
 * inserts them into the appropriate vertical database,
 * then updates the master source_id to match the vertical row ID.
 */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function mapToVerticalSchema(vertical, listing) {
  const base = {
    name: listing.name,
    slug: listing.slug || slugify(listing.name),
    description: listing.description || null,
    state: listing.state || null,
    phone: listing.phone || null,
    address: listing.address || null,
  }

  switch (vertical) {
    case 'sba':
      return { ...base, sub_region: listing.region, latitude: listing.lat, longitude: listing.lng, website: listing.website, type: 'winery', status: 'active' }
    case 'collection':
      return { ...base, sub_region: listing.region, latitude: listing.lat, longitude: listing.lng, website: listing.website, type: 'museum', status: 'active' }
    case 'craft':
      return { ...base, sub_region: listing.region, latitude: listing.lat, longitude: listing.lng, website: listing.website, type: 'ceramics_clay', status: 'active' }
    case 'fine_grounds':
      return { ...base, sub_region: listing.region, latitude: listing.lat, longitude: listing.lng, website: listing.website, status: 'published' }
    case 'rest':
      return { ...base, sub_region: listing.region, latitude: listing.lat, longitude: listing.lng, website: listing.website, type: 'boutique_hotel', status: 'published' }
    case 'field':
      return { ...base, region: listing.region, latitude: listing.lat, longitude: listing.lng, place_type: 'lookout', published: true }
    case 'corner':
      return { ...base, suburb: listing.region, lat: listing.lat, lng: listing.lng, website_url: listing.website, category: 'lifestyle', published: true }
    case 'found':
      return { ...base, suburb: listing.region, lat: listing.lat, lng: listing.lng, website: listing.website, category: 'vintage_clothing', published: true }
    case 'table':
      return { ...base, suburb: listing.region, lat: listing.lat, lng: listing.lng, website_url: listing.website, category: 'specialty_retail', published: true }
    default:
      return base
  }
}

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const results = []

  try {
    // Find all candidate-sourced listings
    const { data: listings, error } = await sb
      .from('listings')
      .select('*')
      .like('source_id', 'candidate-%')
      .eq('status', 'active')

    if (error) throw error
    if (!listings || listings.length === 0) {
      return NextResponse.json({ message: 'No candidate-sourced listings found', results: [] })
    }

    for (const listing of listings) {
      const vertical = listing.vertical
      const result = { id: listing.id, name: listing.name, vertical, status: 'pending' }

      try {
        const config = VERTICAL_CONFIG[vertical]
        if (!config) {
          result.status = 'skipped'
          result.reason = 'Unknown vertical'
          results.push(result)
          continue
        }

        const client = getVerticalClient(vertical)
        const verticalRow = mapToVerticalSchema(vertical, listing)

        // Determine target table
        let table = config.table
        if (vertical === 'fine_grounds') {
          table = 'roasters' // default
        }

        // Check if a listing with this slug already exists in the vertical DB
        const { data: existing } = await client
          .from(table)
          .select('id')
          .eq('slug', verticalRow.slug)
          .maybeSingle()

        let verticalRowId

        if (existing) {
          // Already exists — use its ID
          verticalRowId = String(existing.id)
          result.status = 'already_exists'
        } else {
          // Insert new row
          const { data: inserted, error: insertError } = await client
            .from(table)
            .insert(verticalRow)
            .select('id')
            .single()

          if (insertError) {
            result.status = 'insert_failed'
            result.reason = insertError.message
            results.push(result)
            continue
          }

          verticalRowId = String(inserted.id)
          result.status = 'inserted'
        }

        // Update master listing source_id to match vertical row
        const { error: updateError } = await sb
          .from('listings')
          .update({ source_id: verticalRowId })
          .eq('id', listing.id)

        if (updateError) {
          result.status = 'source_id_update_failed'
          result.reason = updateError.message
        } else {
          result.verticalRowId = verticalRowId
          if (result.status !== 'already_exists') result.status = 'success'
        }
      } catch (err) {
        result.status = 'error'
        result.reason = err.message
      }

      results.push(result)
    }

    return NextResponse.json({
      message: `Processed ${listings.length} candidate-sourced listings`,
      results,
    })
  } catch (err) {
    console.error('[backfill-verticals] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
