import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

const EXTENSION_TABLES = {
  sba: 'sba_meta', collection: 'collection_meta', craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta', rest: 'rest_meta', field: 'field_meta',
  corner: 'corner_meta', found: 'found_meta', table: 'table_meta',
}

export async function GET(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const sb = getSupabaseAdmin()

  // Get the listing to find its vertical (+ cross-vertical tags, migration 142).
  // Forward-compat: if `verticals` isn't migrated yet, fall back and omit it so
  // the editor doesn't try to round-trip a column the DB doesn't have.
  let listing = null
  let verticals  // undefined when the column isn't present
  const withVerticals = await sb.from('listings').select('vertical, verticals').eq('id', id).single()
  if (withVerticals.error && (withVerticals.error.code === '42703' || /column .*verticals.* does not exist/i.test(withVerticals.error.message || ''))) {
    const fallback = await sb.from('listings').select('vertical').eq('id', id).single()
    listing = fallback.data
  } else {
    listing = withVerticals.data
    if (listing) verticals = Array.isArray(listing.verticals) ? listing.verticals : (listing.vertical ? [listing.vertical] : [])
  }
  if (!listing) return NextResponse.json({ meta: null })

  const table = EXTENSION_TABLES[listing.vertical]
  if (!table) return NextResponse.json({ meta: null, verticals })

  // select('*') — meta tables differ in shape per vertical; naming a column
  // absent from this table (e.g. entity_type on sba_meta) errors the query and
  // silently returns null meta. See the upsert note in ../route.js.
  const { data: meta } = await sb.from(table).select('*').eq('listing_id', id).maybeSingle()
  return NextResponse.json({ meta: meta || null, verticals })
}

export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
