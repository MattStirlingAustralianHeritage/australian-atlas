import { NextResponse } from 'next/server'
import { getQualifyingRegions } from '@/lib/plan-a-stay/qualifying-regions'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Plan-a-Stay — Qualifying regions endpoint
   ═══════════════════════════════════════════════════════════════════════
   Returns regions with ≥5 active, visitable Rest listings.
   Ordered by listing count descending (deepest coverage first).

   Public, non-sensitive boundary data. Cached for 1 hour.            */

export async function GET() {
  try {
    const regions = await getQualifyingRegions()

    return NextResponse.json({ regions }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch (err) {
    console.error('[plan-a-stay/regions]', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    )
  }
}
