// app/api/admin/retry-promotion/route.js
// Admin endpoint to view and retry failed role promotions.
// GET — list unresolved failures
// POST — retry a specific promotion

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const ATLAS_AUTH_URL = process.env.NEXT_PUBLIC_ATLAS_AUTH_URL || 'https://www.australianatlas.com.au'

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('failed_role_promotions')
    .select('*')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[retry-promotion] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  return NextResponse.json({ failures: data || [] })
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { failureId } = await request.json()
    if (!failureId) {
      return NextResponse.json({ error: 'failureId required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch the failure record
    const { data: failure, error: fetchError } = await sb
      .from('failed_role_promotions')
      .select('*')
      .eq('id', failureId)
      .is('resolved_at', null)
      .single()

    if (fetchError || !failure) {
      return NextResponse.json({ error: 'Failure record not found or already resolved' }, { status: 404 })
    }

    // Retry the promote-role call
    try {
      // Look up the user by email to get their UUID
      const { data: { users } } = await sb.auth.admin.listUsers()
      const matchedUser = users?.find(u => u.email === failure.user_email)

      if (!matchedUser) {
        // Mark as unresolvable — no user exists for this email
        await sb
          .from('failed_role_promotions')
          .update({
            retry_count: failure.retry_count + 1,
            last_attempt_at: new Date().toISOString(),
            error_message: `No user found for email: ${failure.user_email}. User may not have registered yet.`,
          })
          .eq('id', failureId)

        return NextResponse.json(
          { error: `No user found for email ${failure.user_email}. Vendor may not have registered yet.` },
          { status: 404 }
        )
      }

      const res = await fetch(`${ATLAS_AUTH_URL}/api/auth/promote-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET,
        },
        body: JSON.stringify({
          userId: matchedUser.id,
          email: failure.user_email,
          role: failure.target_role,
          vertical: failure.vertical,
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Promote-role returned ${res.status}: ${errBody}`)
      }

      // Mark as resolved
      await sb
        .from('failed_role_promotions')
        .update({
          resolved_at: new Date().toISOString(),
          retry_count: failure.retry_count + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', failureId)

      return NextResponse.json({ success: true, message: 'Role promotion succeeded' })
    } catch (retryErr) {
      // Update retry count but keep unresolved
      await sb
        .from('failed_role_promotions')
        .update({
          retry_count: failure.retry_count + 1,
          last_attempt_at: new Date().toISOString(),
          error_message: retryErr.message,
        })
        .eq('id', failureId)

      return NextResponse.json(
        { error: `Retry failed: ${retryErr.message}` },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error('[retry-promotion] POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
