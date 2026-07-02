import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { createEnquiry, ENQUIRY_TYPES } from '@/lib/trade/enquiry'
import { getTradeEnrichment } from '@/lib/trade/enrich'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — enquiries (gated)
   ═══════════════════════════════════════════════════════════════════════
   POST → send a structured enquiry to a trade-ready venue (email via Resend,
          logged in trade_enquiries). Rate-limited per account.
   GET  → the account's enquiries, newest first.                              */

// Modest per-account daily ceiling — enough for real research, hostile to
// spray-and-pray. In-memory per instance; the ceiling is a courtesy, not a
// security boundary.
const DAILY_CAP = 25
const sentToday = new Map() // accountId -> { day, count }

function underDailyCap(accountId) {
  const day = new Date().toISOString().slice(0, 10)
  const rec = sentToday.get(accountId)
  if (!rec || rec.day !== day) {
    sentToday.set(accountId, { day, count: 1 })
    return true
  }
  if (rec.count >= DAILY_CAP) return false
  rec.count += 1
  return true
}

export async function POST(request) {
  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const listingId = (body.listing_id || '').toString()
    const enquiryType = ENQUIRY_TYPES.some((t) => t.value === body.enquiry_type)
      ? body.enquiry_type
      : 'general'
    const message = (body.message || '').toString().trim().slice(0, 2000)
    const travelWindow = body.travel_window ? body.travel_window.toString().trim().slice(0, 120) : null

    let groupSize = null
    if (body.group_size != null && body.group_size !== '') {
      const n = Number(body.group_size)
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return NextResponse.json({ error: 'Group size must be a whole number of at least 1' }, { status: 400 })
      }
      groupSize = n
    }

    if (!listingId) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
    if (message.length < 20) {
      return NextResponse.json({ error: 'Say a little more — a one-line enquiry rarely gets an answer.' }, { status: 400 })
    }
    if (!underDailyCap(account.id)) {
      return NextResponse.json({ error: 'Daily enquiry limit reached — try again tomorrow.' }, { status: 429 })
    }

    // Enquiries go to trade-ready venues only (the view predicate).
    const enrichment = await getTradeEnrichment(sb, [listingId])
    if (!enrichment.has(listingId)) {
      return NextResponse.json({ error: 'This venue is not open to trade enquiries yet.' }, { status: 409 })
    }

    const { data: listing } = await sb
      .from('listings')
      .select('id, name, region, state')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

    const result = await createEnquiry(sb, {
      listing,
      account,
      enquiryType,
      message,
      groupSize,
      travelWindow,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ enquiry: result.enquiry }, { status: 201 })
  } catch (err) {
    console.error('[trade/enquiry] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const { data: enquiries } = await sb
    .from('trade_enquiries')
    .select('id, listing_id, enquiry_type, message, group_size, travel_window, status, venue_name, created_at, updated_at')
    .eq('trade_account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(200)

  return NextResponse.json({ enquiries: enquiries || [] })
}
