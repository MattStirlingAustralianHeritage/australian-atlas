import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) return NextResponse.json({ exists: false })

  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('regions')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'live')
    .maybeSingle()

  return NextResponse.json(
    { exists: !!data },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    }
  )
}
