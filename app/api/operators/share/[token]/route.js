import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// GET: Public shared collection or trail (no auth required)
export async function GET(request, { params }) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Share token is required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ── Try collection first ─────────────────────────────────
    const { data: collection } = await sb
      .from('operator_collections')
      .select('id, name, description, region, listing_ids, listing_order, share_token, operator_id, created_at')
      .eq('share_token', token)
      .eq('is_public', true)
      .single()

    if (collection) {
      // Fetch listing details
      let listings = []
      if (collection.listing_ids && collection.listing_ids.length > 0) {
        const { data: listingData } = await sb
          .from('listings')
          .select('id, name, description, region, vertical, lat, lng, website, hero_image_url, address')
          .in('id', collection.listing_ids)

        // Preserve the order from listing_ids
        const listingMap = new Map((listingData || []).map(l => [l.id, l]))
        listings = collection.listing_ids
          .map(id => listingMap.get(id))
          .filter(Boolean)
      }

      // Fetch operator name for attribution
      const { data: operator } = await sb
        .from('operator_accounts')
        .select('business_name, logo_url')
        .eq('id', collection.operator_id)
        .single()

      return NextResponse.json({
        type: 'collection',
        data: {
          name: collection.name,
          description: collection.description,
          region: collection.region,
          listings,
          listing_order: collection.listing_order,
          operator: operator ? { business_name: operator.business_name, logo_url: operator.logo_url } : null,
          created_at: collection.created_at,
        },
      })
    }

    // ── Try trail ────────────────────────────────────────────
    const { data: trail } = await sb
      .from('operator_trails')
      .select('id, name, description, days, region, trail_data, share_token, operator_id, created_at')
      .eq('share_token', token)
      .eq('is_public', true)
      .single()

    if (trail) {
      // Fetch operator name for attribution
      const { data: operator } = await sb
        .from('operator_accounts')
        .select('business_name, logo_url')
        .eq('id', trail.operator_id)
        .single()

      return NextResponse.json({
        type: 'trail',
        data: {
          name: trail.name,
          description: trail.description,
          days: trail.days,
          region: trail.region,
          trail_data: trail.trail_data,
          operator: operator ? { business_name: operator.business_name, logo_url: operator.logo_url } : null,
          created_at: trail.created_at,
        },
      })
    }

    // ── Neither found ────────────────────────────────────────
    return NextResponse.json({ error: 'Shared content not found' }, { status: 404 })
  } catch (err) {
    console.error('[operators/share] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
