import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { createSharedToken } from '@/lib/shared-auth'

/**
 * GET /api/auth/token — Mint a shared-auth JWT for the current Supabase session.
 *
 * Same-origin counterpart to /api/auth/shared (which redirects cross-vertical
 * with ?atlas_token=). The portal dashboard authenticates via the shared token
 * but on this origin the session cookie is the source of truth, so it has no
 * token until one is minted here.
 *
 * Returns { token } for a signed-in user, or 401 otherwise.
 */
export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const token = await createSharedToken(user)
  return NextResponse.json({ token })
}
