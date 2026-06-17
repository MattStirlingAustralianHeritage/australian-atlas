import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const VALID_STATUS = ['received', 'under_review', 'actioned', 'rejected']

// GET — list infringement reports (active by default; ?archived=1 for archived).
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const archived = new URL(request.url).searchParams.get('archived') === '1'
    const sb = getSupabaseAdmin()
    let q = sb.from('infringement_reports').select('*').order('created_at', { ascending: false })
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ reports: data || [] })
  } catch (err) {
    console.error('[admin/infringement-reports] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}

// POST — workflow actions: update_status | archive | unarchive | takedown_asset | restore_asset
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const { action } = body
    const actor = (body.handled_by || 'admin').toString().slice(0, 120)
    const sb = getSupabaseAdmin()
    const nowIso = new Date().toISOString()

    if (action === 'update_status') {
      const { reportId, status } = body
      if (!reportId || !VALID_STATUS.includes(status)) {
        return NextResponse.json({ error: 'reportId and a valid status are required' }, { status: 400 })
      }
      const patch = { status, status_changed_at: nowIso, handled_by: actor }
      if (typeof body.internal_notes === 'string') patch.internal_notes = body.internal_notes
      const { error } = await sb.from('infringement_reports').update(patch).eq('id', reportId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'archive' || action === 'unarchive') {
      const { reportId } = body
      if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 })
      const { error } = await sb
        .from('infringement_reports')
        .update({ archived_at: action === 'archive' ? nowIso : null })
        .eq('id', reportId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // Fast-response lever: soft-archive an asset (reversible, logged).
    if (action === 'takedown_asset' || action === 'restore_asset') {
      const { assetId } = body
      if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })
      const removing = action === 'takedown_asset'
      const patch = removing
        ? {
            takedown_status: 'removed',
            takedown_reason: (body.reason || 'admin takedown').toString().slice(0, 500),
            takedown_changed_at: nowIso,
            takedown_changed_by: actor,
          }
        : {
            takedown_status: 'active',
            takedown_reason: null,
            takedown_changed_at: nowIso,
            takedown_changed_by: actor,
          }
      const { data, error } = await sb
        .from('asset_provenance')
        .update(patch)
        .eq('id', assetId)
        .select('id, takedown_status')
        .single()
      if (error) throw error
      console.log(`[admin/infringement-reports] asset ${assetId} -> ${data?.takedown_status} by ${actor}`)
      return NextResponse.json({ success: true, asset: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/infringement-reports] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
