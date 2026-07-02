import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { loadItinerary } from '@/lib/trade/itinerary'
import { buildItineraryPdf } from '@/lib/trade/pdf'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — itinerary PDF export (public, published only)
   ═══════════════════════════════════════════════════════════════════════
   GET /api/trade/pdf/[slug] → application/pdf carrying the "Curated via Atlas"
   attribution. Resolves a PUBLISHED itinerary by slug; drafts 404.            */

function slugForFilename(slug) {
  return (slug || 'itinerary').replace(/[^a-z0-9-]/gi, '-').slice(0, 80)
}

export async function GET(_request, { params }) {
  try {
    const sb = getSupabaseAdmin()
    const loaded = await loadItinerary(sb, { slug: params.slug, requireStatus: 'published' })
    if (!loaded) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Co-brand the header with the authoring account (beside the Atlas
    // attribution, never instead of it).
    let account = null
    if (loaded.itinerary.trade_account_id) {
      const { data } = await sb
        .from('trade_accounts')
        .select('org_name, org_website')
        .eq('id', loaded.itinerary.trade_account_id)
        .maybeSingle()
      account = data || null
    }

    const pdf = buildItineraryPdf(loaded.itinerary, loaded.stops, account)
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="atlas-trade-${slugForFilename(params.slug)}.pdf"`,
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch (err) {
    console.error('[trade/pdf] error:', err)
    return NextResponse.json({ error: 'PDF generation failed', detail: err.message }, { status: 500 })
  }
}
