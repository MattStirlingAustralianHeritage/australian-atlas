import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

const ALLOWED_ENDPOINTS = [
  '/api/cron/staleness-agent',
  '/api/cron/enrichment-agent',
  '/api/cron/editorial-signals-agent',
  '/api/cron/monday-briefing-agent',
  '/api/cron/dead-image-agent',
  '/api/cron/voice-consistency-agent',
  '/api/cron/competitor-intelligence-agent',
  '/api/cron/revenue-signal-agent',
  '/api/cron/seo-content-agent',
  '/api/cron/backlink-builder-agent',
  '/api/cron/content-recycling-agent',
  '/api/cron/user-reactivation-agent',
  '/api/cron/listing-velocity-agent',
]

/**
 * POST /api/admin/run-agent
 *
 * Triggers an agent endpoint on-demand from the admin dashboard.
 * Passes the CRON_SECRET so the agent's auth check passes.
 *
 * Body: { endpoint: string }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint } = await request.json()

  if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    // Build the full URL from the current host
    const host = request.headers.get('host')
    const protocol = host?.includes('localhost') ? 'http' : 'https'
    const url = `${protocol}://${host}${endpoint}`

    // Fire and forget — don't wait for the full agent run (could be 5 minutes)
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
    }).catch(err => {
      console.error(`[run-agent] Background fetch failed for ${endpoint}:`, err.message)
    })

    return NextResponse.json({ ok: true, message: `${endpoint} triggered` })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
