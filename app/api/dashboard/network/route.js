import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG } from '@/lib/supabase/clients'

export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = user.email
  const admin = getSupabaseAdmin()

  const verticals = Object.keys(VERTICAL_CONFIG)
  const results = {}

  for (const v of verticals) {
    try {
      const client = getVerticalClient(v)
      const config = VERTICAL_CONFIG[v]
      const tableName = config.table || (config.tables ? config.tables[0] : 'venues')

      // Check vendor_profiles for this email
      const { data: profile } = await client
        .from('vendor_profiles')
        .select('id, user_id, email, business_name, contact_name, phone, created_at')
        .eq('email', email)
        .maybeSingle()

      if (profile) {
        // Get approved claim for this user
        const { data: claim } = await client
          .from('claims')
          .select('id, user_id, venue_id, status, created_at')
          .eq('user_id', profile.user_id)
          .eq('status', 'approved')
          .maybeSingle()

        let venue = null
        if (claim?.venue_id) {
          const { data: v_data } = await client
            .from(tableName)
            .select('id, name, slug, type, is_claimed, subscription_tier, subscription_status')
            .eq('id', claim.venue_id)
            .maybeSingle()
          venue = v_data
        }

        // Get master listing for cross-reference
        let masterListing = null
        if (venue) {
          const { data: ml } = await admin
            .from('listings')
            .select('id, name, slug, region, state, hero_image_url, is_featured, is_claimed')
            .eq('vertical', v)
            .eq('source_id', String(venue.id))
            .maybeSingle()
          masterListing = ml
        }

        results[v] = {
          claimed: true,
          claimStatus: claim?.status || 'unknown',
          venue,
          masterListing,
          tier: venue?.subscription_tier || 'free',
          profile,
        }
      } else {
        results[v] = { claimed: false }
      }
    } catch (err) {
      results[v] = { claimed: false, error: err.message }
    }
  }

  return NextResponse.json({ user: { email: user.email, id: user.id }, network: results })
}
