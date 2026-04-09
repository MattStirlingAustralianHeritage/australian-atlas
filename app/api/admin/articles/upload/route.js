import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/articles/upload — upload an image for an article
 * Accepts multipart/form-data with a single 'file' field.
 * Returns { url } on success.
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
  if (!allowed.includes(ext)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const filePath = `articles/${fileName}`

  const sb = getSupabaseAdmin()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await sb.storage
    .from('article-images')
    .upload(filePath, buffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    })

  if (error) {
    console.error('[articles/upload] Storage error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from('article-images').getPublicUrl(filePath)

  return NextResponse.json({ url: urlData.publicUrl })
}
