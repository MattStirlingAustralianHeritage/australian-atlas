import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay v2 — Region GeoJSON endpoint
   ═══════════════════════════════════════════════════════════════════════
   Returns a GeoJSON FeatureCollection of the 25 trip-eligible regions
   with simplified polygons for the interactive map selector.

   Geometry: ST_SimplifyPreserveTopology at 0.01° (~1km) to keep
   coastlines legible while keeping total payload under 500KB.

   Public, non-sensitive boundary data. Cached for 1 hour.            */


/* ─── The 25 trip-eligible regions (must match COVERED_REGIONS) ──────── */
const COVERED_REGION_NAMES = [
  'Hobart & Southern Tasmania',
  'Sydney',
  'Hobart City',
  'Adelaide',
  'Launceston & Tamar Valley',
  'Perth',
  'Scenic Rim',
  'Adelaide Hills',
  'Margaret River',
  'Cradle Country',
  'Sunshine Coast Hinterland',
  'Barossa Valley',
  'Darwin & Top End',
  'Blue Mountains',
  'Cairns & Tropical North',
  'Brisbane',
  'Melbourne',
  'Yarra Valley',
  'Canberra District',
  'Southern Highlands',
  'Victorian High Country',
  'McLaren Vale',
  'East Coast Tasmania',
  'South Coast NSW',
  'Mornington Peninsula',
]


export async function GET() {
  try {
    const sb = getSupabaseAdmin()

    // Query regions with simplified polygons as GeoJSON
    // ST_SimplifyPreserveTopology(polygon, 0.01) ≈ 1km tolerance
    // ST_AsGeoJSON outputs the geometry as a JSON string
    const { data, error } = await sb
      .rpc('get_plan_a_stay_regions_geojson', {
        region_names: COVERED_REGION_NAMES,
        simplify_tolerance: 0.01,
      })

    // Fallback: if RPC doesn't exist, query directly with PostGIS functions
    if (error && error.message?.includes('function') && error.message?.includes('does not exist')) {
      // Direct query fallback — requires PostGIS functions available via raw SQL
      const { data: rawData, error: rawError } = await sb
        .from('regions')
        .select('id, name, slug, state, center_lat, center_lng')
        .in('name', COVERED_REGION_NAMES)

      if (rawError) {
        console.error('[regions-geojson] Fallback query error:', rawError.message)
        return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 })
      }

      // Return centroid-only features as fallback (no polygon)
      const features = (rawData || [])
        .filter(r => r.center_lat && r.center_lng)
        .map(r => ({
          type: 'Feature',
          properties: {
            id: r.id,
            name: r.name,
            slug: r.slug,
            state: r.state,
          },
          geometry: {
            type: 'Point',
            coordinates: [r.center_lng, r.center_lat],
          },
        }))

      const fc = { type: 'FeatureCollection', features }
      return NextResponse.json(fc, {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      })
    }

    if (error) {
      console.error('[regions-geojson] RPC error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 })
    }

    // RPC returns rows with { id, name, slug, state, geojson }
    const features = (data || []).map(r => ({
      type: 'Feature',
      properties: {
        id: r.id,
        name: r.name,
        slug: r.slug,
        state: r.state,
      },
      geometry: r.geojson ? JSON.parse(r.geojson) : null,
    })).filter(f => f.geometry !== null)

    const fc = { type: 'FeatureCollection', features }

    // Log payload size for monitoring
    const payloadSize = JSON.stringify(fc).length
    console.log(`[regions-geojson] ${features.length} features, ${Math.round(payloadSize / 1024)}KB`)

    return NextResponse.json(fc, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch (err) {
    console.error('[regions-geojson]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
