import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { processImage, contentAddressedName, ImageValidationError } from '@/lib/uploadProcessing'
import { recordAssetProvenance } from '@/lib/assetProvenance'

/**
 * POST /api/dashboard/listing/upload — operator image upload (hero + gallery).
 *
 * This is the MULTIPART FALLBACK path: bytes are POSTed through the function.
 * The preferred path is direct-to-storage (POST .../upload/sign then
 * .../upload/finalize), which bypasses Vercel's ~4.5MB request-body limit. The
 * client tries that first and falls back here; both paths run the same sharp
 * processing and provenance logging.
 *
 * Auth: Bearer atlas shared JWT (vendor or admin). multipart/form-data:
 *   file                     (required) the image
 *   listingId                (required) the listing the asset belongs to
 *   assetKind                'hero' | 'gallery' (default 'hero')
 *   uploadWarrantyAccepted   'true' — REQUIRED upload-rights affirmation
 *   sourceDeclaration        optional free text
 *
 * Stores a normalised WebP in the public 'listing-images' bucket, logs the
 * warranty to asset_provenance (fail-closed), and returns { url }.
 */

const BUCKET = 'listing-images'

export async function POST(request) {
  const limited = checkRateLimit(request, { keyPrefix: 'listing-upload', windowMs: 60_000, maxRequests: 60 })
  if (limited) return limited

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

  // ── Upload warranty gate ──────────────────────────────────
  const listingId = (formData.get('listingId') || '').toString().trim()
  const assetKind = formData.get('assetKind') === 'gallery' ? 'gallery' : 'hero'
  const warrantyAccepted = formData.get('uploadWarrantyAccepted') === 'true'
  const sourceDeclaration = (formData.get('sourceDeclaration') || '').toString().trim() || null

  if (!warrantyAccepted) {
    return NextResponse.json(
      { error: 'You must confirm you have the rights to upload this image (ownership/licence, no infringement, consent of anyone identifiable).' },
      { status: 400 }
    )
  }
  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing reference for the upload.' }, { status: 400 })
  }

  // ── Validate + normalise (content sniff, EXIF strip, re-encode) ──
  let processed
  try {
    const raw = Buffer.from(await file.arrayBuffer())
    processed = await processImage(raw)
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[listing/upload] processing error:', err?.message)
    return NextResponse.json({ error: 'Could not process that image.' }, { status: 500 })
  }

  const sb = getSupabaseAdmin()

  // Ensure the bucket exists (idempotent — a pre-existing bucket is success).
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, { public: true })
  if (bucketErr && !/exist/i.test(bucketErr.message || '')) {
    console.warn('[listing/upload] createBucket warning:', bucketErr.message)
  }

  // Content-addressed key → identical bytes dedup to one object.
  const filePath = `listings/${contentAddressedName(processed.buffer, processed.ext)}`

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, processed.buffer, {
      contentType: processed.contentType,
      cacheControl: '31536000',
      upsert: false,
    })
  // A hash collision means the identical image already exists — that's a dedup
  // hit, not a failure. We must NOT later remove a pre-existing (shared) object.
  const alreadyExisted = !!uploadErr && /exist|already/i.test(uploadErr.message || '')
  if (uploadErr && !alreadyExisted) {
    console.error('[listing/upload] Storage error:', uploadErr.message)
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath)

  // ── Record the upload consent/warranty (fail closed) ──
  const prov = await recordAssetProvenance(sb, {
    listingId,
    assetKind,
    storagePath: filePath,
    publicUrl: urlData.publicUrl,
    uploadedBy: user.id,
    sourceDeclaration,
  })
  if (!prov.ok) {
    console.error('[listing/upload] asset_provenance write failed — rolling back:', prov.error)
    if (!alreadyExisted) await sb.storage.from(BUCKET).remove([filePath]).catch(() => {})
    return NextResponse.json(
      { error: 'Could not record the image-rights confirmation. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: urlData.publicUrl })
}
