import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST(request) {
  const { listing_id, memory, author_name } = await request.json()

  if (!listing_id) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
  }
  if (!memory || memory.trim().length === 0) {
    return NextResponse.json({ error: 'Memory text is required' }, { status: 400 })
  }
  if (memory.length > 300) {
    return NextResponse.json({ error: 'Memory must be 300 characters or fewer' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { error } = await sb.from('place_memories').insert({
    listing_id,
    memory: memory.trim(),
    author_name: author_name?.trim() || null,
    approved: false,
  })

  if (error) {
    console.error('Failed to save memory:', error.message)
    return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')

  if (!listingId) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('place_memories')
    .select('id, author_name, memory, created_at')
    .eq('listing_id', listingId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
  }

  return NextResponse.json({ memories: data || [] })
}
