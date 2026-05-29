import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// ─── GET — list active pitches awaiting triage ─────────────
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('pitches')
    .select('*')
    .eq('status', 'active')
    .order('vertical', { ascending: true })
    .order('generated_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[admin/pitches/GET] Query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pitches: data || [] })
}

// ─── POST — keep (→ research queue) or dismiss a pitch ──────
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

  const { action, pitchId, reason } = body || {}
  if (!pitchId) {
    return NextResponse.json({ error: 'Missing pitchId' }, { status: 400 })
  }
  if (!['keep', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action — must be keep or dismiss' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    // Load the pitch — must be active to triage.
    const { data: pitch, error: fetchErr } = await sb
      .from('pitches')
      .select('*')
      .eq('id', pitchId)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!pitch) {
      return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
    }
    if (pitch.status !== 'active') {
      return NextResponse.json({ error: `Pitch already ${pitch.status}` }, { status: 409 })
    }

    if (action === 'keep') {
      // Move to research queue: record the approval, flip status to 'approved'.
      // The slot stays filled — an approved pitch still occupies its editorial
      // slot until it is written into an article. approved_by references
      // auth.users; the admin cookie isn't a Supabase user, so it stays null.
      const { error: insErr } = await sb
        .from('approved_pitches')
        .insert({ pitch_id: pitchId })
      if (insErr) throw insErr

      const { error: updErr } = await sb
        .from('pitches')
        .update({ status: 'approved' })
        .eq('id', pitchId)
      if (updErr) throw updErr

      return NextResponse.json({ success: true, action: 'kept' })
    }

    // Dismiss: snapshot the full pitch row, then delete it. Deleting the pitch
    // sets pitch_slots.current_pitch_id → null via the FK (on delete set null),
    // reopening the slot for regeneration. rejected_pitches has no FK on
    // pitch_id by design, precisely because the pitch row is removed.
    const { error: snapErr } = await sb
      .from('rejected_pitches')
      .insert({
        pitch_id: pitchId,
        pitch_snapshot: pitch,
        rejection_reason: (reason || '').trim() || null,
      })
    if (snapErr) throw snapErr

    const { error: delErr } = await sb
      .from('pitches')
      .delete()
      .eq('id', pitchId)
    if (delErr) throw delErr

    return NextResponse.json({ success: true, action: 'dismissed' })
  } catch (err) {
    console.error('[admin/pitches/POST] Error:', err.message)
    return NextResponse.json({ error: `Action failed: ${err.message || 'Unknown error'}` }, { status: 500 })
  }
}
