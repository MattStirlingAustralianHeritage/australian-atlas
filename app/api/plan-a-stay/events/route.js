import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { isBotUA } from '@/lib/analytics/aggregate'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Planner funnel events (Plan a Stay + On This Road)
   ═══════════════════════════════════════════════════════════════════════
   Fire-and-forget sink for the planners' outcome funnels. Writes to
   planner_events (migration 224, service-role only). The client never
   blocks on this; a failure is logged loudly and returns non-2xx so it
   can't silently rot (same discipline as /api/track).                   */

const ALLOWED_EVENTS = new Set([
  'pas_trip_generated',
  'pas_trip_edited',
  'pas_trip_shared',
  'pas_trip_saved',
  'pas_recommend_used',
  'otr_trip_generated',
  'otr_trip_edited',
  'otr_trip_shared',
  'otr_trip_saved',
  'otr_export_used',
])

export async function POST(request) {
  try {
    const body = await request.json()
    const { event_type, region, intent, duration, meta } = body

    if (!ALLOWED_EVENTS.has(event_type)) {
      return NextResponse.json({ ok: false, error: 'unknown_event' }, { status: 400 })
    }

    const user_agent = request.headers.get('user-agent') || null
    const sb = getSupabaseAdmin()
    const { error } = await sb.from('planner_events').insert({
      event_type,
      region: typeof region === 'string' ? region.slice(0, 120) : null,
      intent: Array.isArray(intent) ? intent.slice(0, 4).map(String) : null,
      duration: typeof duration === 'number' ? Math.round(duration) : null,
      meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null,
      user_agent,
      is_bot: isBotUA(user_agent),
    })

    if (error) {
      console.error('[plan-a-stay/events] insert failed:', error.message)
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err instanceof SyntaxError ? 400 : 500
    return NextResponse.json({ ok: false, error: 'event_error' }, { status })
  }
}
