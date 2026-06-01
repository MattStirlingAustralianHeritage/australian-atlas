import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * POST /api/dashboard/listing/upload — operator hero-image upload.
 *
 * Auth: Bearer atlas shared JWT (vendor or admin). Accepts multipart/form-data
 * with a single 'file' field. Stores in the public 'listing-images' bucket and
 * returns { url }. The Supabase Storage host ends in supabase.co, so the URL
 * passes isApprovedImageSource — meaning updateListing's vertical write-back will
 * keep it (unapproved hosts get nulled before sync, which would lose the photo).
 */

const BUCKET = 'listing-images'
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
const MAX_BYTES = 8 * 1024 * 1024 // 8MB

export async function POST(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 8MB)' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Ensure the bucket exists. createBucket is idempotent for our purposes —
  // a pre-existing bucket returns an error we treat as success.
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, { public: true })
  if (bucketErr && !/exist/i.test(bucketErr.message || '')) {
    console.warn('[listing/upload] createBucket warning:', bucketErr.message)
  }

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const filePath = `listings/${fileName}`

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    })

  if (uploadErr) {
    console.error('[listing/upload] Storage error:', uploadErr.message)
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath)
  return NextResponse.json({ url: urlData.publicUrl })
}
