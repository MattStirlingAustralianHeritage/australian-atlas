import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { getCurrentLegalDocuments, UPLOAD_DOC_TYPE } from '@/lib/legal/documents'

/**
 * POST /api/dashboard/listing/upload — operator image upload (hero + gallery).
 *
 * Auth: Bearer atlas shared JWT (vendor or admin). Accepts multipart/form-data:
 *   file                     (required) the image
 *   listingId                (required) the listing the asset belongs to
 *   assetKind                'hero' | 'gallery' (default 'hero')
 *   uploadWarrantyAccepted   'true' — REQUIRED upload-rights affirmation
 *   sourceDeclaration        optional free text (operator's stated source/rights)
 *
 * UPLOAD WARRANTY GATE: the operator must affirm the upload warranty (they own /
 * are licensed, it infringes nothing, identifiable people consented). The upload
 * is rejected without it, and a consent record is written to asset_provenance.
 * Fail closed: if the provenance record can't be written, the just-uploaded
 * object is removed and the upload fails — we never expose an asset we couldn't
 * log a warranty for. Stores in the public 'listing-images' bucket.
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

  // ── Record the upload consent/warranty (asset_provenance) ──
  // Capture which upload_terms version was in force (non-critical if missing).
  let uploadTermsVersion = null
  try {
    const docs = await getCurrentLegalDocuments(sb, [UPLOAD_DOC_TYPE])
    uploadTermsVersion = docs[UPLOAD_DOC_TYPE]?.version ?? null
  } catch { /* version is a nice-to-have; the warranty boolean is the record */ }

  const { error: provErr } = await sb.from('asset_provenance').insert({
    listing_id: listingId,
    asset_kind: assetKind,
    storage_path: filePath,
    public_url: urlData.publicUrl,
    uploaded_by: user.id,
    upload_warranty_accepted: true,
    upload_warranty_accepted_at: new Date().toISOString(),
    upload_terms_version: uploadTermsVersion,
    source_declaration: sourceDeclaration,
  })

  if (provErr) {
    // Fail closed: never expose an asset whose warranty we couldn't log. Remove
    // the just-uploaded object and report failure.
    console.error('[listing/upload] asset_provenance write failed — rolling back upload:', provErr.message)
    await sb.storage.from(BUCKET).remove([filePath]).catch(() => {})
    return NextResponse.json(
      { error: 'Could not record the image-rights confirmation. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: urlData.publicUrl })
}
