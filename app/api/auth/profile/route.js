import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS })
}

/**
 * GET /api/auth/profile
 *
 * Returns the current user's profile from the profiles table.
 * Requires an active Supabase session (cookie-based).
 * Used by the Australian Atlas dashboard and can be called by verticals
 * that need to check a user's role/profile before the JWT is issued.
 */
export async function GET(request) {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: CORS_HEADERS })
    }

    // Fetch profile using admin client (bypasses RLS for reliability)
    const admin = getSupabaseAdmin()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, vendor_verticals, council_id, interests, created_at')
      .eq('id', user.id)
      .single()

    // Distinguish "no row" from "the read failed". This route runs on every
    // page load for every signed-in user (components/Nav.js), and it used to
    // treat ANY select error as row-missing and upsert role:'user' — so a
    // single transient read failure could strip a vendor/council/admin of the
    // role that gates their dashboard. A failed read must fail, not rewrite.
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile fetch error:', profileError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
    }

    if (!profile) {
      // Genuinely no row yet — create one (handles the race with the signup
      // trigger). insert, not upsert: if a row appeared in the meantime it is
      // more authoritative than this default, so let the conflict stand and
      // re-read it rather than overwriting a role we'd be guessing at.
      const { error: insertError } = await admin
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
          role: 'user',
        })
      if (insertError && insertError.code !== '23505') {
        console.error('Profile creation error:', insertError)
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500, headers: CORS_HEADERS })
      }

      const { data: created, error: reReadError } = await admin
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, vendor_verticals, council_id, interests, created_at')
        .eq('id', user.id)
        .single()
      if (reReadError || !created) {
        console.error('Profile re-read error:', reReadError)
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500, headers: CORS_HEADERS })
      }

      return NextResponse.json({ profile: created }, { headers: CORS_HEADERS })
    }

    return NextResponse.json({ profile }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
