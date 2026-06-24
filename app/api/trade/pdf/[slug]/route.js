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

    const pdf = buildItineraryPdf(loaded.itinerary, loaded.stops)
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
