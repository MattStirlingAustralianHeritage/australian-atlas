import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { processImage, contentAddressedName, ImageValidationError } from '@/lib/uploadProcessing'

/**
 * POST /api/admin/articles/upload — upload an image for an article (admin only).
 * Accepts multipart/form-data with a single 'file' field. The image is validated
 * and normalised (content sniff, EXIF strip, re-encode to WebP) before storage.
 * Returns { url } on success.
 */

const BUCKET = 'article-images'

export async function POST(request) {
  const limited = checkRateLimit(request, { keyPrefix: 'article-upload', windowMs: 60_000, maxRequests: 60 })
  if (limited) return limited

  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  let processed
  try {
    const raw = Buffer.from(await file.arrayBuffer())
    processed = await processImage(raw)
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[articles/upload] processing error:', err?.message)
    return NextResponse.json({ error: 'Could not process that image.' }, { status: 500 })
  }

  const filePath = `articles/${contentAddressedName(processed.buffer, processed.ext)}`

  const sb = getSupabaseAdmin()
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(filePath, processed.buffer, {
      contentType: processed.contentType,
      cacheControl: '31536000',
      upsert: true, // content-addressed: identical bytes → same key
    })

  if (error) {
    console.error('[articles/upload] Storage error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath)

  return NextResponse.json({ url: urlData.publicUrl })
}
