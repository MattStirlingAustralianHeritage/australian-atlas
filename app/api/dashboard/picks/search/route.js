import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// GET /api/dashboard/picks/search?q=...&exclude=<id> — venue search for the
// producer-picks picker. Any signed-in user may search the public listing set.
export async function GET(request) {
  const supabase = await createAuthServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const exclude = searchParams.get('exclude') || null
  if (q.length < 2) return NextResponse.json({ results: [] })

  const admin = getSupabaseAdmin()
  let query = admin
    .from('listings')
    .select('id, name, vertical, region, state, slug')
    .eq('status', 'active')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(10)
  if (exclude) query = query.neq('id', exclude)

  const { data, error: qErr } = await query
  if (qErr) return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  return NextResponse.json({ results: data || [] })
}
