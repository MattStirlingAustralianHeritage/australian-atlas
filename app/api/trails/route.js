import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/trails?type=editorial&visibility=public&created_by=...&limit=20&offset=0
 *
 * List trails with optional filters.
 * - Public listing: editorial (published) + public user trails
 * - User's own trails: filter by created_by
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const visibility = searchParams.get('visibility')
    const createdBy = searchParams.get('created_by')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const sb = getSupabaseAdmin()

    let query = sb
      .from('trails')
      .select('id, title, slug, short_code, description, type, visibility, region, vertical_focus, stop_count, created_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (createdBy) {
      // User viewing their own trails — return all of them
      query = query.eq('created_by', createdBy)
    } else {
      // Public listing — only show published editorial + public user trails
      if (type) {
        query = query.eq('type', type)
        if (type === 'editorial') {
          query = query.eq('published', true)
        }
      } else {
        // Default: editorial (published) + public user trails
        query = query.or('and(type.eq.editorial,published.eq.true),and(type.eq.user,visibility.eq.public)')
      }
    }

    if (visibility) {
      query = query.eq('visibility', visibility)
    }

    const { data: trails, error } = await query

    if (error) {
      console.error('[trails] List error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch trails' }, { status: 500 })
    }

    return NextResponse.json({ trails, total: trails.length })
  } catch (err) {
    console.error('[trails] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/trails
 *
 * Create a new trail with stops.
 * Requires authenticated Supabase session.
 *
 * Body: { title, description, type, visibility, region, vertical_focus, stops[] }
 * Each stop: { listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, notes }
 */
export async function POST(request) {
  try {
    // Auth check
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, type, visibility, region, vertical_focus, stops } = body

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Generate slug from title
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Dedupe slug — check if it already exists
    const { data: existing } = await sb
      .from('trails')
      .select('slug')
      .ilike('slug', `${baseSlug}%`)

    let slug = baseSlug
    if (existing && existing.length > 0) {
      const existingSlugs = new Set(existing.map(t => t.slug))
      if (existingSlugs.has(baseSlug)) {
        let suffix = 2
        while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix++
        slug = `${baseSlug}-${suffix}`
      }
    }

    // Generate random short_code (8 chars)
    const shortCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 8)

    // Insert trail
    const { data: trail, error: trailError } = await sb
      .from('trails')
      .insert({
        title: title.trim(),
        slug,
        short_code: shortCode,
        description: description || null,
        type: type || 'user',
        visibility: visibility || 'public',
        region: region || null,
        vertical_focus: vertical_focus || null,
        stop_count: stops?.length || 0,
        created_by: user.id,
      })
      .select('id, title, slug, short_code, description, type, visibility, region, vertical_focus, stop_count, published, created_by, created_at, updated_at')
      .single()

    if (trailError) {
      console.error('[trails] Insert error:', trailError.message)
      return NextResponse.json({ error: 'Failed to create trail' }, { status: 500 })
    }

    // Insert stops if provided
    if (stops && stops.length > 0) {
      const stopRows = stops.map((stop, i) => ({
        trail_id: trail.id,
        listing_id: stop.listing_id || null,
        vertical: stop.vertical || null,
        venue_name: stop.venue_name,
        venue_lat: stop.venue_lat,
        venue_lng: stop.venue_lng,
        venue_image_url: stop.venue_image_url || null,
        order_index: stop.order_index ?? i,
        notes: stop.notes || null,
      }))

      const { error: stopsError } = await sb
        .from('trail_stops')
        .insert(stopRows)

      if (stopsError) {
        console.error('[trails] Stops insert error:', stopsError.message)
        // Trail was created but stops failed — still return the trail
        return NextResponse.json({
          trail,
          warning: 'Trail created but some stops failed to save',
        }, { status: 201 })
      }
    }

    return NextResponse.json({ trail }, { status: 201 })
  } catch (err) {
    console.error('[trails] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
