import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash, randomBytes } from 'crypto'

function generateShortCode() {
  return randomBytes(4).toString('hex')
}

function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

export async function POST(request) {
  try {
    const { messages, title } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const shortCode = generateShortCode()

    const venueIds = []
    const regions = new Set()
    for (const m of messages) {
      if (m.venues) {
        for (const v of m.venues) {
          if (v.id) venueIds.push(v.id)
          if (v.region) regions.add(v.region)
        }
      }
    }

    const autoTitle = title || messages.find(m => m.role === 'user')?.content?.slice(0, 80) || 'My Trip Plan'

    const { data, error } = await sb
      .from('plan_conversations')
      .insert({
        short_code: shortCode,
        title: autoTitle,
        messages,
        venue_ids: venueIds,
        regions: [...regions],
        session_id: getSessionId(request),
      })
      .select('id, short_code')
      .single()

    if (error) {
      console.error('[plan/save] Error:', error.message)
      return NextResponse.json({ error: 'Could not save plan' }, { status: 500 })
    }

    return NextResponse.json({
      id: data.id,
      shortCode: data.short_code,
      url: `/plan/${data.short_code}`,
    })
  } catch (err) {
    console.error('[plan/save] Error:', err.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
