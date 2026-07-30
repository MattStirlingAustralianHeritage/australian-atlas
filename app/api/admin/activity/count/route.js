import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchActivitySince } from '@/lib/activity/feedSources'

/**
 * GET /api/admin/activity/count?since=<iso> — how much has happened that the
 * admin hasn't looked at yet. Feeds the red badge on the sidebar's "Operator
 * activity" link.
 *
 * Same merge as the feed itself (lib/activity/feedSources.js), so the badge and
 * the page can't drift apart. `since` is where the browser last marked the feed
 * as seen; without it we fall back to the last week, which is the same window
 * the page's headline stats use.
 *
 * `now` comes back so the client stamps "seen" against the server's clock
 * rather than its own — a browser running a few minutes fast would otherwise
 * skip over events it never showed.
 */

export const dynamic = 'force-dynamic'

const DEFAULT_WINDOW_DAYS = 7
const MAX_WINDOW_DAYS = 90

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const floor = now - MAX_WINDOW_DAYS * 86400000
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('since')
  const parsed = raw ? Date.parse(raw) : NaN

  // An unparseable, absent, absurdly old or future `since` all fall back to the
  // default window — the badge should never be able to ask for the whole table.
  const sinceMs = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, floor), now)
    : now - DEFAULT_WINDOW_DAYS * 86400000
  const sinceIso = new Date(sinceMs).toISOString()

  const sb = getSupabaseAdmin()
  const { events, logTableMissing } = await fetchActivitySince(sb, sinceIso)

  return NextResponse.json({
    count: events.length,
    latest: events[0]?.created_at || null,
    since: sinceIso,
    now: new Date(now).toISOString(),
    logTableMissing,
  })
}
