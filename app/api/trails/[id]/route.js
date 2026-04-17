import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/trails/[id]
 *
 * Fetch a single trail by id (UUID) or slug, including all stops ordered by order_index.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const sb = getSupabaseAdmin()

    // Determine if id is a UUID or a slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    let query = sb
      .from('trails')
      .select('id, title, slug, short_code, description, type, visibility, region, vertical_focus, stop_count, published, created_by, created_at, updated_at, cover_image_url, hero_intro, curator_name, curator_note, duration, best_season')

    if (isUuid) {
      query = query.eq('id', id)
    } else {
      query = query.eq('slug', id)
    }

    const { data: trail, error } = await query.single()

    if (error || !trail) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
    }

    // Fetch stops ordered by order_index
    const { data: stops, error: stopsError } = await sb
      .from('trail_stops')
      .select('id, trail_id, listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, notes, included_in_route')
      .eq('trail_id', trail.id)
      .order('order_index', { ascending: true })

    if (stopsError) {
      console.error('[trails/id] Stops fetch error:', stopsError.message)
    }

    return NextResponse.json({ trail: { ...trail, stops: stops || [] } })
  } catch (err) {
    console.error('[trails/id] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/trails/[id]
 *
 * Update trail metadata and stops.
 * Auth: must be trail creator or admin.
 *
 * Body: { title, description, type, visibility, region, vertical_focus, published, stops[] }
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params

    // Auth check
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    // Fetch existing trail
    const { data: existing, error: fetchError } = await sb
      .from('trails')
      .select('id, created_by')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
    }

    // Check ownership — must be creator or admin
    if (existing.created_by !== user.id) {
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { title, description, type, visibility, region, vertical_focus, published, stops } = body

    // Build update object — only include provided fields
    const updates = { updated_at: new Date().toISOString() }
    if (title !== undefined) updates.title = title.trim()
    if (description !== undefined) updates.description = description
    if (type !== undefined) updates.type = type
    if (visibility !== undefined) updates.visibility = visibility
    if (region !== undefined) updates.region = region
    if (vertical_focus !== undefined) updates.vertical_focus = vertical_focus
    if (published !== undefined) updates.published = published
    if (stops !== undefined) updates.stop_count = stops.length

    // Re-generate slug if title changed
    if (title !== undefined) {
      const baseSlug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const { data: slugCheck } = await sb
        .from('trails')
        .select('slug')
        .ilike('slug', `${baseSlug}%`)
        .neq('id', id)

      let slug = baseSlug
      if (slugCheck && slugCheck.length > 0) {
        const existingSlugs = new Set(slugCheck.map(t => t.slug))
        if (existingSlugs.has(baseSlug)) {
          let suffix = 2
          while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix++
          slug = `${baseSlug}-${suffix}`
        }
      }
      updates.slug = slug
    }

    // Update trail
    const { data: trail, error: updateError } = await sb
      .from('trails')
      .update(updates)
      .eq('id', id)
      .select('id, title, slug, short_code, description, type, visibility, region, vertical_focus, stop_count, published, created_by, created_at, updated_at, cover_image_url, hero_intro, curator_name, curator_note, duration, best_season')
      .single()

    if (updateError) {
      console.error('[trails/id] Update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update trail' }, { status: 500 })
    }

    // Replace stops if provided
    if (stops !== undefined) {
      // Delete existing stops
      const { error: deleteError } = await sb
        .from('trail_stops')
        .delete()
        .eq('trail_id', id)

      if (deleteError) {
        console.error('[trails/id] Stops delete error:', deleteError.message)
      }

      // Insert new stops
      if (stops.length > 0) {
        const stopRows = stops.map((stop, i) => ({
          trail_id: id,
          listing_id: stop.listing_id || null,
          vertical: stop.vertical || null,
          venue_name: stop.venue_name,
          venue_lat: stop.venue_lat,
          venue_lng: stop.venue_lng,
          venue_image_url: stop.venue_image_url || null,
          order_index: stop.order_index ?? i,
          notes: stop.notes || null,
          included_in_route: stop.included_in_route !== false,
        }))

        const { error: insertError } = await sb
          .from('trail_stops')
          .insert(stopRows)

        if (insertError) {
          console.error('[trails/id] Stops insert error:', insertError.message)
        }
      }
    }

    // Fetch updated stops
    const { data: updatedStops } = await sb
      .from('trail_stops')
      .select('id, trail_id, listing_id, vertical, venue_name, venue_lat, venue_lng, venue_image_url, order_index, notes, included_in_route')
      .eq('trail_id', id)
      .order('order_index', { ascending: true })

    return NextResponse.json({ trail: { ...trail, stops: updatedStops || [] } })
  } catch (err) {
    console.error('[trails/id] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/trails/[id]
 *
 * Delete a trail and all its stops.
 * Auth: must be trail creator or admin.
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params

    // Auth check
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    // Fetch trail to check ownership
    const { data: existing, error: fetchError } = await sb
      .from('trails')
      .select('id, created_by')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
    }

    // Check ownership — must be creator or admin
    if (existing.created_by !== user.id) {
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }
    }

    // Delete stops first (child records)
    const { error: stopsDeleteError } = await sb
      .from('trail_stops')
      .delete()
      .eq('trail_id', id)

    if (stopsDeleteError) {
      console.error('[trails/id] Stops delete error:', stopsDeleteError.message)
    }

    // Delete trail
    const { error: trailDeleteError } = await sb
      .from('trails')
      .delete()
      .eq('id', id)

    if (trailDeleteError) {
      console.error('[trails/id] Trail delete error:', trailDeleteError.message)
      return NextResponse.json({ error: 'Failed to delete trail' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[trails/id] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
