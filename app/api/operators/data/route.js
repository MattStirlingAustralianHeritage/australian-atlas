import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  try {
    // ── Authenticate via Supabase session ─────────────────────
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    // Look up operator account
    const { data: operator, error: opError } = await sb
      .from('operator_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator account not found' }, { status: 401 })
    }

    // If not approved, return pending status with basic info
    if (operator.approved === false) {
      return NextResponse.json({
        pending_approval: true,
        operator: {
          id: operator.id,
          business_name: operator.business_name,
          slug: operator.slug,
          contact_name: operator.contact_name,
          contact_email: operator.contact_email,
          operator_type: operator.operator_type,
          status: operator.status,
          approved: operator.approved,
          created_at: operator.created_at,
        },
      })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'overview'

    // ── Overview ──────────────────────────────────────────────
    if (view === 'overview') {
      // Get collection count
      const { count: collectionCount } = await sb
        .from('operator_collections')
        .select('id', { count: 'exact', head: true })
        .eq('operator_id', operator.id)

      // Get trail count
      const { count: trailCount } = await sb
        .from('operator_trails')
        .select('id', { count: 'exact', head: true })
        .eq('operator_id', operator.id)

      // Get last 10 activity records
      const { data: activity } = await sb
        .from('operator_activity')
        .select('*')
        .eq('operator_id', operator.id)
        .order('created_at', { ascending: false })
        .limit(10)

      return NextResponse.json({
        operator: {
          id: operator.id,
          business_name: operator.business_name,
          slug: operator.slug,
          contact_name: operator.contact_name,
          contact_email: operator.contact_email,
          operator_type: operator.operator_type,
          website: operator.website,
          logo_url: operator.logo_url,
          tier: operator.tier,
          status: operator.status,
          approved: operator.approved,
          stripe_customer_id: operator.stripe_customer_id,
          billing_cycle_end: operator.billing_cycle_end,
          created_at: operator.created_at,
        },
        stats: {
          collection_count: collectionCount || 0,
          trail_count: trailCount || 0,
        },
        activity: activity || [],
      })
    }

    // ── Collections ───────────────────────────────────────────
    if (view === 'collections') {
      const { data: collections } = await sb
        .from('operator_collections')
        .select('*')
        .eq('operator_id', operator.id)
        .order('created_at', { ascending: false })

      // For each collection, fetch listing details from listing_ids
      const collectionsWithListings = await Promise.all(
        (collections || []).map(async (col) => {
          if (!col.listing_ids || col.listing_ids.length === 0) {
            return { ...col, listings: [] }
          }

          const { data: listings } = await sb
            .from('listings')
            .select('id, name, description, region, vertical, lat, lng, website, hero_image_url, address')
            .in('id', col.listing_ids)

          // Preserve the order from listing_ids
          const listingMap = new Map((listings || []).map(l => [l.id, l]))
          const orderedListings = col.listing_ids
            .map(id => listingMap.get(id))
            .filter(Boolean)

          return { ...col, listings: orderedListings }
        })
      )

      return NextResponse.json({
        operator: { id: operator.id, business_name: operator.business_name },
        collections: collectionsWithListings,
      })
    }

    // ── Trails ────────────────────────────────────────────────
    if (view === 'trails') {
      const { data: trails } = await sb
        .from('operator_trails')
        .select('*')
        .eq('operator_id', operator.id)
        .order('created_at', { ascending: false })

      return NextResponse.json({
        operator: { id: operator.id, business_name: operator.business_name },
        trails: trails || [],
      })
    }

    // Default: return operator info
    return NextResponse.json({ operator })
  } catch (err) {
    console.error('[operators/data] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
