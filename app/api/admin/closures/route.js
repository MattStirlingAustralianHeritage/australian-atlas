import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { fetchClosureSignals, countClosureSignals, applyClosureAction, CLOSURE_ACTIONS } from '@/lib/closures/queue'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/closures?view=open|resolved&vertical=…
 *   → { rows, counts, tableMissing }
 *
 * POST /api/admin/closures  { id, action }
 *   action: hide_permanent | mark_temporary | clear_temporary | dismiss
 *   → { success, ...result } (result.warning when the vertical source row
 *     could not be unpublished — the master write still stands)
 */
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') === 'resolved' ? 'resolved' : 'open'
  const vertical = searchParams.get('vertical') || null

  try {
    const sb = getSupabaseAdmin()
    const [{ rows, tableMissing }, counts] = await Promise.all([
      fetchClosureSignals(sb, { view, vertical }),
      countClosureSignals(sb),
    ])
    return NextResponse.json({ rows, counts, tableMissing })
  } catch (err) {
    console.error('[admin/closures] GET error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { id, action } = body || {}
  if (!id || !CLOSURE_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Expected { id, action: ${CLOSURE_ACTIONS.join(' | ')} }` }, { status: 400 })
  }

  try {
    const sb = getSupabaseAdmin()
    const result = await applyClosureAction(sb, { id, action, reviewer: 'admin' })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[admin/closures] POST error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
