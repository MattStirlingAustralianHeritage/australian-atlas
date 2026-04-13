import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * PATCH /api/admin/seo-content
 *
 * Publish, edit+publish, or reject an SEO content page.
 * Body: { id: uuid, action: 'publish' | 'reject', content?: string }
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, action, content } = await request.json()

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  if (action === 'publish') {
    const updates = {
      status: 'published',
      published_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    }
    if (content) updates.content = content

    const { error } = await sb.from('seo_pages').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    const { error } = await sb.from('seo_pages').update({
      status: 'rejected',
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
