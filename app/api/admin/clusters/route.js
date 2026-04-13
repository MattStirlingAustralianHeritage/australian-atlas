import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * PATCH /api/admin/clusters
 * Update cluster fields: label, description, is_editorially_interesting
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, label, description, is_editorially_interesting } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing cluster id' }, { status: 400 })
    }

    // Build update payload with only provided fields
    const updates = {}
    if (label !== undefined) updates.label = label
    if (description !== undefined) updates.description = description
    if (is_editorially_interesting !== undefined) updates.is_editorially_interesting = is_editorially_interesting
    updates.updated_at = new Date().toISOString()

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('listing_clusters')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ cluster: data })
  } catch (err) {
    console.error('[admin/clusters/PATCH] Error:', err.message)
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 })
  }
}
