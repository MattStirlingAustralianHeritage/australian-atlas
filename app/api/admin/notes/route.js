import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const VALID_SEVERITIES = ['bug', 'cosmetic', 'suggestion']
const VALID_STATUSES = ['open', 'in_progress', 'done']

// GET — fetch all notes, optionally filtered by ?status=
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || null

  try {
    const sb = getSupabaseAdmin()
    let query = sb
      .from('admin_notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ notes: data || [] })
  } catch (err) {
    console.error('[admin/notes] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

// POST — create a new note
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { note, url, severity } = body

    if (!note || typeof note !== 'string' || !note.trim()) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 })
    }

    const row = {
      note: note.trim(),
      url: url?.trim() || null,
      severity: VALID_SEVERITIES.includes(severity) ? severity : 'bug',
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('admin_notes')
      .insert(row)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note: data }, { status: 201 })
  } catch (err) {
    console.error('[admin/notes] POST error:', err.message)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
