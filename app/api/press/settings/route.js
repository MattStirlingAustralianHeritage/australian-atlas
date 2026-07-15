import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { isVerticalPublic } from '@/lib/verticalUrl'
import { sendAgentEmail } from '@/lib/agents/email'

// Newsroom settings: PATCH updates profile + notification preferences;
// DELETE is full self-service account erasure (leaving must be one click,
// and it must actually delete).

const CADENCES = ['instant', 'daily', 'weekly', 'off']
const OUTLET_TYPES = ['national', 'metro', 'regional', 'local', 'newsletter', 'magazine', 'broadcast', 'podcast', 'online', 'freelance', 'other']

function getSession(req) {
  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  return validatePressSession(cookie?.value)
}

export async function PATCH(req) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const patch = {}

    if ('name' in body) {
      const v = String(body.name || '').trim()
      if (!v) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      patch.name = v.slice(0, 200)
    }
    if ('outlet' in body) {
      const v = String(body.outlet || '').trim()
      if (!v) return NextResponse.json({ error: 'Outlet is required' }, { status: 400 })
      patch.outlet = v.slice(0, 200)
    }
    if ('roleTitle' in body) patch.role_title = body.roleTitle ? String(body.roleTitle).trim().slice(0, 200) : null
    if ('website' in body) patch.website = body.website ? String(body.website).trim().slice(0, 300) : null
    if ('outletType' in body && OUTLET_TYPES.includes(body.outletType)) patch.outlet_type = body.outletType
    if ('cadence' in body && CADENCES.includes(body.cadence)) patch.cadence = body.cadence
    if ('notifyEvents' in body) patch.notify_events = !!body.notifyEvents
    if ('notifyListings' in body) patch.notify_listings = !!body.notifyListings
    if ('notifyLeads' in body) patch.notify_leads = !!body.notifyLeads
    if ('beatVerticals' in body) {
      const beats = Array.isArray(body.beatVerticals) ? body.beatVerticals.filter(isVerticalPublic) : []
      patch.beat_verticals = beats
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    patch.updated_at = new Date().toISOString()

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('press_accounts')
      .update(patch)
      .eq('id', session.pressId)
      .select('id, name, outlet, outlet_type, role_title, website, cadence, notify_events, notify_listings, notify_leads, beat_verticals')
      .single()
    if (error) throw error

    await sb.from('press_activity').insert({
      press_id: session.pressId,
      action: 'settings_updated',
      metadata: { fields: Object.keys(patch).filter(k => k !== 'updated_at') },
    })

    return NextResponse.json({ ok: true, press: data })
  } catch (err) {
    console.error('Press settings error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sb = getSupabaseAdmin()
    const { data: account } = await sb
      .from('press_accounts')
      .select('id, name, outlet, contact_email')
      .eq('id', session.pressId)
      .single()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // Requests are work items for the desk — keep the row, shed the identity.
    await sb
      .from('press_requests')
      .update({ press_name: null, outlet: null, contact_email: null })
      .eq('press_id', account.id)

    // Everything identity-bearing cascades from the account row
    // (follows, activity, send ledgers; feedback/requests press_id → set null).
    const { error } = await sb.from('press_accounts').delete().eq('id', account.id)
    if (error) throw error

    await sendAgentEmail({
      subject: `Press account deleted — ${account.outlet}`,
      html: `<p>${account.name} (${account.outlet}, ${account.contact_email}) deleted their Newsroom account at their own request. All follows, activity and notification ledgers removed.</p>`,
    })

    const response = NextResponse.json({ ok: true, deleted: true })
    response.cookies.set(PRESS_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    console.error('Press account deletion error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
