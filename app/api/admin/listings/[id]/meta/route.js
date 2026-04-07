import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

const EXTENSION_TABLES = {
  sba: 'sba_meta', collection: 'collection_meta', craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta', rest: 'rest_meta', field: 'field_meta',
  corner: 'corner_meta', found: 'found_meta', table: 'table_meta',
}

export async function GET(request, { params }) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Get the listing to find its vertical
  const { data: listing } = await sb.from('listings').select('vertical').eq('id', id).single()
  if (!listing) return NextResponse.json({ meta: null })

  const table = EXTENSION_TABLES[listing.vertical]
  if (!table) return NextResponse.json({ meta: null })

  const { data: meta } = await sb.from(table).select('*').eq('listing_id', id).maybeSingle()
  return NextResponse.json({ meta: meta || null })
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const updates = await request.json()
  const sb = getSupabaseAdmin()

  const { data: listing } = await sb.from('listings').select('vertical').eq('id', id).single()
  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const table = EXTENSION_TABLES[listing.vertical]
  if (!table) return NextResponse.json({ error: 'No extension table' }, { status: 400 })

  // Upsert — create if doesn't exist
  const { data, error } = await sb.from(table).upsert(
    { listing_id: id, ...updates },
    { onConflict: 'listing_id' }
  ).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meta: data })
}
