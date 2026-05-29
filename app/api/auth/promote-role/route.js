import { NextResponse } from 'next/server'
import { promoteRole } from '@/lib/auth/promoteRole'

/**
 * POST /api/auth/promote-role
 *
 * Service-to-service endpoint called by verticals when a vendor claim is approved,
 * or when a council account is linked to a user. Promotes a user's role in the
 * central profiles table. Find-or-create: if the auth user id is known but the
 * profile row is missing, it is created (rather than 404-ing).
 *
 * Auth: Requires SHARED_API_SECRET header (shared between Australian Atlas and verticals).
 *
 * Body:
 *   userId    - UUID of the user in Australian Atlas auth.users (or an email)
 *   email     - (optional) email to resolve the profile by
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

    const result = await promoteRole({ userId, email, role, vertical, councilId, createIfMissing: true })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      profile: { id: result.userId, role: result.role, ...(result.vertical ? { vertical: result.vertical } : {}) },
    })
  } catch (error) {
    console.error('Promote role error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
