import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * DELETE /api/admin/errors?older_than=30d — clear errors older than 30 days
 */
export async function DELETE(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const olderThan = searchParams.get('older_than')

  // Default to 30 days if not specified
  let days = 30
  if (olderThan) {
    const match = olderThan.match(/^(\d+)d$/)
    if (match) {
      days = parseInt(match[1], 10)
    }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const sb = getSupabaseAdmin()

  // Count before deleting (Supabase doesn't return count on delete by default)
  const { count } = await sb
    .from('client_errors')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', cutoff)

  const { error } = await sb
    .from('client_errors')
    .delete()
    .lt('created_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: count || 0 })
}
