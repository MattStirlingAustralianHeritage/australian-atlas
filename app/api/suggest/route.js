import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * POST /api/suggest — Submit a venue suggestion
 * Feeds the listing_candidates queue for admin review.
 * No auth required — public submission.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { name, region, vertical, website_url, notes } = body

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Venue name is required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { error } = await sb.from('listing_candidates').insert({
      name: name.trim(),
      region: region?.trim() || null,
      vertical: vertical || null,
      website_url: website_url?.trim() || null,
      source: 'user_suggested',
      source_detail: notes?.trim() || null,
      confidence: 0.3,
      status: 'pending',
    })

    if (error) {
      console.error('[suggest] insert error:', error.message)
      return NextResponse.json({ error: 'Failed to submit suggestion' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Thank you — we will review this suggestion.' })
  } catch (err) {
    console.error('[suggest] error:', err.message)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
