import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { classifyListing } from '@/lib/gate/classify'

export const dynamic = 'force-dynamic'

// Listings in these statuses are already hidden/deleted — not part of the scan.
const EXCLUDED_STATUSES = ['hidden', 'deleted']
// A listing with a queue row in ANY of these is considered already-handled and
// is never re-flagged (idempotency + "approve means don't re-surface").
const RESOLVED_OR_PENDING = ['pending', 'approved', 'hidden', 'deleted']

const SELECT_COLS = 'id,name,slug,description,vertical,sub_type,region,status'

async function fetchAllListings(sb) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listings')
      .select(SELECT_COLS)
      .not('status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load listings: ${error.message}`)
    out.push(...data)
    if (!data || data.length < PAGE) break
  }
  return out
}

async function fetchQueuedListingIds(sb) {
  const ids = new Set()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listing_review_queue')
      .select('listing_id')
      .in('status', RESOLVED_OR_PENDING)
      .range(from, from + PAGE - 1)
    if (error) {
      // Fail loudly with an actionable message if the table is missing.
      if (error.code === 'PGRST205' || /listing_review_queue/.test(error.message)) {
        const e = new Error('Table listing_review_queue does not exist — apply migration 153 in the Supabase SQL editor before scanning.')
        e.status = 503
        throw e
      }
      throw new Error(`Failed to read review queue: ${error.message}`)
    }
    for (const r of data) ids.add(r.listing_id)
    if (!data || data.length < PAGE) break
  }
  return ids
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body = {}
  try { body = await request.json() } catch { /* empty body allowed */ }
  const dryRun = body.dryRun === true

  try {
    const sb = getSupabaseAdmin()

    // 1. Load the scan set and the set of already-queued listings.
    const [listings, queuedIds] = await Promise.all([
      fetchAllListings(sb),
      fetchQueuedListingIds(sb),
    ])

    // 2. Classify each not-already-queued listing.
    const flaggedRows = []
    const byMechanism = {}
    const byGate = {}
    const byAction = {}
    let alreadyQueued = 0

    for (const l of listings) {
      if (queuedIds.has(l.id)) { alreadyQueued++; continue }
      const c = classifyListing(l)
      if (!c) continue
      byMechanism[c.mechanism] = (byMechanism[c.mechanism] || 0) + 1
      byGate[c.gate_flagged] = (byGate[c.gate_flagged] || 0) + 1
      byAction[c.suggested_action] = (byAction[c.suggested_action] || 0) + 1
      flaggedRows.push({
        listing_id: l.id,
        flag_source: c.flag_source,
        flag_reason: c.flag_reason,
        gate_flagged: c.gate_flagged,
        confidence: c.confidence,
        suggested_action: c.suggested_action,
        status: 'pending',
        // carried for the dry-run preview only; stripped before insert
        _name: l.name,
        _vertical: l.vertical,
      })
    }

    const summary = {
      dry_run: dryRun,
      scanned: listings.length,
      already_queued: alreadyQueued,
      flagged: flaggedRows.length,
      by_mechanism: byMechanism,
      by_gate: byGate,
      by_suggested_action: byAction,
    }

    // 3. Dry run: return what WOULD be flagged, with a sample, and insert nothing.
    if (dryRun) {
      return NextResponse.json({
        ...summary,
        inserted: 0,
        sample: flaggedRows
          .slice()
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 25)
          .map(r => ({ name: r._name, vertical: r._vertical, confidence: r.confidence, suggested_action: r.suggested_action, flag_reason: r.flag_reason })),
      })
    }

    // 4. Real run: bulk insert (chunked). Insert errors are surfaced, not swallowed.
    const toInsert = flaggedRows.map(({ _name, _vertical, ...row }) => row)
    let inserted = 0
    const CHUNK = 500
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { data, error } = await sb.from('listing_review_queue').insert(chunk).select('id')
      if (error) {
        if (error.code === 'PGRST205' || /listing_review_queue/.test(error.message)) {
          return NextResponse.json({ error: 'Table listing_review_queue does not exist — apply migration 153 in the Supabase SQL editor before scanning.' }, { status: 503 })
        }
        // Partial failure: report what landed plus the real error.
        return NextResponse.json({ error: `Insert failed after ${inserted} rows: ${error.message}`, ...summary, inserted }, { status: 500 })
      }
      inserted += data.length
    }

    return NextResponse.json({ ...summary, inserted })
  } catch (err) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status })
  }
}
