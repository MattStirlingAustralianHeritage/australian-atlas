import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * GET /api/admin/articles — list all articles (newest first)
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('articles')
    .select('id, cms_id, vertical, title, slug, excerpt, body, hero_image_url, author, status, published_at, category, region_tags, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

/**
 * POST /api/admin/articles — create a new article
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, slug, vertical, excerpt, body: articleBody, hero_image_url, author, status, category, region_tags } = body

  if (!title || !slug) {
    return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Generate a portal cms_id for admin-created articles
  const cmsId = `portal-${crypto.randomUUID()}`

  const { data, error } = await sb
    .from('articles')
    .insert({
      cms_id: cmsId,
      title,
      slug,
      vertical: vertical || 'atlas',
      excerpt: excerpt || null,
      body: articleBody || null,
      hero_image_url: hero_image_url || null,
      author: author || null,
      status: status || 'draft',
      published_at: status === 'published' ? new Date().toISOString() : null,
      category: category || null,
      region_tags: region_tags || [],
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An article with that slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

/**
 * PATCH /api/admin/articles — update an existing article
 */
export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'Article id is required' }, { status: 400 })
  }

  // Map body field from request
  if ('body' in updates) {
    // Supabase column is 'body', already correct
  }

  // Set published_at when publishing for the first time
  if (updates.status === 'published' && !updates.published_at) {
    updates.published_at = new Date().toISOString()
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An article with that slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * DELETE /api/admin/articles — delete an article
 */
export async function DELETE(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'Article id is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const { error } = await sb.from('articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
