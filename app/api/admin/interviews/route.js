import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * PATCH /api/admin/interviews — toggle published status
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, published } = body

  if (!id || typeof published !== 'boolean') {
    return NextResponse.json(
      { error: 'id and published (boolean) are required' },
      { status: 400 }
    )
  }

  const sb = getSupabaseAdmin()

  const updates = {
    published,
    updated_at: new Date().toISOString(),
  }

  // Set published_at when publishing for the first time
  if (published) {
    updates.published_at = new Date().toISOString()
  }

  const { data, error } = await sb
    .from('interviews')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
