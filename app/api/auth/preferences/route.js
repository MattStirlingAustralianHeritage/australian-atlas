import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS })
}

// Valid values for each interest category
const VALID_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

const VALID_ACTIVITIES = [
  'wine_tasting', 'craft_beer', 'distillery_tours', 'coffee',
  'hiking', 'swimming', 'lookouts', 'national_parks',
  'galleries', 'museums', 'heritage',
  'makers_studios', 'ceramics', 'woodwork',
  'farm_gate', 'markets', 'bakeries', 'providores',
  'boutique_stays', 'glamping', 'farm_stays',
  'bookshops', 'record_stores', 'homewares',
  'vintage', 'op_shops', 'antiques',
]

const VALID_STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const VALID_DIETARY = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'no_preference']

/**
 * GET /api/auth/preferences
 * Returns current user's interests/preferences.
 */
export async function GET() {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: CORS_HEADERS })
    }

    const admin = getSupabaseAdmin()
    const { data: profile, error } = await admin
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single()

    if (error) {
      // Column may not exist yet — return empty preferences
      return NextResponse.json({ interests: {} }, { headers: CORS_HEADERS })
    }

    return NextResponse.json({
      interests: profile?.interests || {},
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Preferences fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}

/**
 * PUT /api/auth/preferences
 * Updates current user's interests/preferences.
 * Body: { verticals: string[], activities: string[], regions: string[], dietary: string[] }
 */
export async function PUT(request) {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: CORS_HEADERS })
    }

    const body = await request.json()
    const { verticals, activities, regions, dietary } = body

    // Validate inputs
    const interests = {}

    if (Array.isArray(verticals)) {
      interests.verticals = verticals.filter(v => VALID_VERTICALS.includes(v))
    }
    if (Array.isArray(activities)) {
      interests.activities = activities.filter(a => VALID_ACTIVITIES.includes(a))
    }
    if (Array.isArray(regions)) {
      interests.regions = regions.filter(r => VALID_STATES.includes(r))
    }
    if (Array.isArray(dietary)) {
      interests.dietary = dietary.filter(d => VALID_DIETARY.includes(d))
    }

    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from('profiles')
      .update({ interests, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      console.error('Preferences update error:', error)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json({ interests, saved: true }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Preferences update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
