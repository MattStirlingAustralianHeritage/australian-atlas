import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifyPressIcsToken } from '@/lib/press/tokens'
import { getFollowedRegions, listEventsForRegions } from '@/lib/press/insights'

// iCalendar for the newsroom:
//   ?feed=<token>   a member's personal subscribable calendar — every
//                   upcoming event in the regions they follow. The token is
//                   a signed, non-expiring HMAC (calendar apps can't log in).
//   ?event=<slug>   a single public event as a downloadable .ics.

export const maxDuration = 60

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

function icsEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// DATE values; DTEND is exclusive per RFC 5545, so end + 1 day.
function ymdCompact(ymd) {
  return String(ymd || '').replace(/-/g, '')
}

function nextDayCompact(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10).replace(/-/g, '')
}

function vevent(e) {
  const where = [e.location_name, e.suburb].filter(Boolean).join(', ')
  const desc = [
    e.description ? String(e.description).slice(0, 400) : null,
    e.ticket_url ? `Tickets: ${e.ticket_url}` : null,
    `Details: ${SITE}/events/${e.slug}`,
  ].filter(Boolean).join('\n')
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@australianatlas.com.au`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymdCompact(e.start_date)}`,
    `DTEND;VALUE=DATE:${nextDayCompact(e.end_date || e.start_date)}`,
    `SUMMARY:${icsEscape(e.name)}`,
    `LOCATION:${icsEscape(where)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    `URL:${SITE}/events/${e.slug}`,
    'END:VEVENT',
  ].join('\r\n')
}

function calendar(name, events) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Australian Atlas//Newsroom//EN',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-WR-TIMEZONE:Australia/Sydney',
    ...events.map(vevent),
    'END:VCALENDAR',
  ].join('\r\n')
}

function icsResponse(filename, body, { attachment = true } = {}) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${attachment ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const sb = getSupabaseAdmin()

  try {
    const feedToken = searchParams.get('feed')
    if (feedToken) {
      const verified = verifyPressIcsToken(feedToken)
      if (!verified) return NextResponse.json({ error: 'Invalid feed token' }, { status: 401 })

      const { data: account } = await sb
        .from('press_accounts')
        .select('id, outlet, status, approved')
        .eq('id', verified.pressId)
        .single()
      if (!account || !account.approved || account.status !== 'active') {
        return NextResponse.json({ error: 'Feed unavailable' }, { status: 404 })
      }

      const followed = await getFollowedRegions(sb, account.id)
      const events = await listEventsForRegions(sb, { regionIds: followed.map(r => r.id), limit: 300 })
      return icsResponse(
        'australian-atlas-events.ics',
        calendar('Australian Atlas — events in your regions', events),
        { attachment: false }
      )
    }

    const eventSlug = searchParams.get('event')
    if (eventSlug) {
      const { data: e } = await sb
        .from('events')
        .select('id, name, slug, description, start_date, end_date, location_name, suburb, ticket_url, status, published')
        .eq('slug', eventSlug)
        .eq('status', 'approved')
        .not('published', 'is', false)
        .single()
      if (!e) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      return icsResponse(`${e.slug}.ics`, calendar(e.name, [e]))
    }

    return NextResponse.json({ error: 'Pass ?feed=<token> or ?event=<slug>' }, { status: 400 })
  } catch (err) {
    console.error('Press ICS error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
