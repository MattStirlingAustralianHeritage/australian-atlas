import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * PATCH /api/admin/wikipedia-queue
 *
 * Update Wikipedia opportunity status: submitted / dismiss
 * Body: { id: uuid, action: 'submitted' | 'dismiss' }
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, action } = await request.json()

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  if (action === 'submitted') {
    const { error } = await sb
      .from('wikipedia_opportunities')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'dismiss') {
    const { error } = await sb
      .from('wikipedia_opportunities')
      .update({ status: 'dismissed' })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
