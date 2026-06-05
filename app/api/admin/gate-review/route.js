import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchQueueRows, applyGateAction } from '@/lib/gate/queue'

export const dynamic = 'force-dynamic'

const VALID_STATUS = ['pending', 'approved', 'hidden', 'deleted']

// ─── GET: list queue rows for a view (with filters) ─────────────────────────
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }
  const vertical = searchParams.get('vertical') || null
  const gate = searchParams.get('gate') || null
  const source = searchParams.get('source') || null

  try {
    const sb = getSupabaseAdmin()
    const { rows, tableMissing } = await fetchQueueRows(sb, { status, vertical, gate, source })
    return NextResponse.json({ rows, tableMissing })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to load queue' }, { status: 500 })
  }
}

// ─── POST: apply an action (approve | hide | delete | restore) ──────────────
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { ids, action, reviewer } = body || {}

  try {
    const sb = getSupabaseAdmin()
    const result = await applyGateAction(sb, { ids, action, reviewer: reviewer || 'admin' })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 400 })
  }
}
