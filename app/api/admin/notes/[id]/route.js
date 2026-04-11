import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const VALID_STATUSES = ['open', 'in_progress', 'done']
const VALID_SEVERITIES = ['bug', 'cosmetic', 'suggestion']

// PATCH — update note fields (status, text, url, severity)
export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const updates = { updated_at: new Date().toISOString() }

    // Status
    if ('status' in body) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      updates.status = body.status
    }

    // Note text
    if ('note' in body) {
      const text = typeof body.note === 'string' ? body.note.trim() : ''
      if (!text) {
        return NextResponse.json({ error: 'Note text cannot be empty' }, { status: 400 })
      }
      updates.note = text
    }

    // URL
    if ('url' in body) {
      updates.url = body.url?.trim() || null
    }

    // Severity
    if ('severity' in body) {
      if (!VALID_SEVERITIES.includes(body.severity)) {
        return NextResponse.json(
          { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` },
          { status: 400 }
        )
      }
      updates.severity = body.severity
    }

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('admin_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    return NextResponse.json({ note: data })
  } catch (err) {
    console.error('[admin/notes] PATCH error:', err.message)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}
