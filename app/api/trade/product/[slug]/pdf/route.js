import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { loadFactSheet } from '@/lib/trade/factsheet'
import { buildFactSheetPdf } from '@/lib/trade/pdf'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — product fact sheet PDF (gated)
   ═══════════════════════════════════════════════════════════════════════
   GET → the fact sheet as a PDF one-pager. Gated (it carries the trade
   contact channel), unlike the public published-itinerary PDF.               */

export async function GET(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const sheet = await loadFactSheet(sb, { slug: params.slug })
  if (!sheet) return NextResponse.json({ error: 'No trade fact sheet for this venue' }, { status: 404 })

  try {
    const pdf = buildFactSheetPdf(sheet)
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="atlas-trade-factsheet-${params.slug}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    console.error('[trade/product/pdf] build failed:', err)
    return NextResponse.json({ error: 'Could not build the PDF' }, { status: 500 })
  }
}
