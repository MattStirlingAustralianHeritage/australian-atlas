import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/auth/promote-role
 *
 * Service-to-service endpoint called by verticals when a vendor claim is approved,
 * or when a council account is linked to a user. Promotes a user's role in the
 * central profiles table.
 *
 * Auth: Requires SHARED_API_SECRET header (shared between Australian Atlas and verticals).
 *
 * Body:
 *   userId    - UUID of the user in Australian Atlas auth.users
 *   role      - Target role: 'vendor' | 'council' | 'admin'
 *   vertical  - (optional) Vertical slug for vendor claims, e.g. 'sba', 'craft'
 *   councilId - (optional) UUID of council_accounts row for council role
 */
export async function POST(request) {
  try {
    // Verify service-to-service auth
    const authHeader = request.headers.get('x-api-secret')
    const apiSecret = process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET

    if (!authHeader || authHeader !== apiSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, email, role, vertical, councilId } = await request.json()

    if (!userId && !email) {
      return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 })
    }
    if (!role) {
      return NextResponse.json({ error: 'Missing role' }, { status: 400 })
    }

    const validRoles = ['user', 'vendor', 'council', 'admin']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Resolve profile by UUID or email lookup
    let resolvedUserId = userId
    // If userId looks like an email (contains @), treat it as an email lookup
    if (userId && userId.includes('@')) {
      resolvedUserId = null
    }

    let profile = null
    let fetchError = null

    if (resolvedUserId) {
      const result = await supabase
        .from('profiles')
        .select('id, role, vendor_verticals')
        .eq('id', resolvedUserId)
        .single()
      profile = result.data
      fetchError = result.error
    }

    // If no profile found by UUID, try email lookup
    if (!profile && (email || (userId && userId.includes('@')))) {
      const lookupEmail = email || userId
      const result = await supabase
        .from('profiles')
        .select('id, role, vendor_verticals')
        .eq('email', lookupEmail.toLowerCase().trim())
        .single()
      profile = result.data
      fetchError = result.error
      if (profile) {
        resolvedUserId = profile.id
      }
    }

    if (fetchError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Build update payload
    const update = { role, updated_at: new Date().toISOString() }

    // For vendor promotions, merge the vertical into vendor_verticals
    if (role === 'vendor' && vertical) {
      const currentVerticals = profile.vendor_verticals || {}
      update.vendor_verticals = { ...currentVerticals, [vertical]: true }
    }

    // For council promotions, link the council account
    if (role === 'council' && councilId) {
      update.council_id = councilId
    }

    // Don't downgrade admin to vendor/council
    if (profile.role === 'admin' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Cannot downgrade admin role via this endpoint' },
        { status: 403 }
      )
    }

    // Don't downgrade vendor to user (additive only)
    if (profile.role === 'vendor' && role === 'user') {
      return NextResponse.json(
        { error: 'Cannot downgrade vendor to user. Use demote endpoint instead.' },
        { status: 403 }
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', resolvedUserId)

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      profile: { id: resolvedUserId, role, ...(vertical ? { vertical } : {}) },
    })
  } catch (error) {
    console.error('Promote role error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
