import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/admin/trails?status=draft|in_review|published|archived&region_id=...&author_id=...&limit=...
 *   List editorial trails (status IS NOT NULL). User-curated trails (status NULL)
 *   are not surfaced here — they live in the legacy /api/trails endpoints.
 */
export async function GET(request) {
  const admin = await checkAdmin(await cookies())
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const region_id = searchParams.get('region_id')
  const author_id = searchParams.get('author_id')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const sb = getSupabaseAdmin()
  let q = sb.from('trails')
    .select('id, slug, title, subtitle, status, region_id, secondary_region_ids, vertical_mix, mood_tags, day_count, total_distance_km, total_duration_minutes, hero_image_url, author_id, editor_id, published_at, last_edited_at, created_at')
    .not('status', 'is', null)
    .order('last_edited_at', { ascending: false })
    .limit(limit)

  if (status) q = q.eq('status', status)
  if (region_id) q = q.eq('region_id', region_id)
  if (author_id) q = q.eq('author_id', author_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ trails: data ?? [] })
}
