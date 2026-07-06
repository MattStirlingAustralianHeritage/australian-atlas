import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { processImage, contentAddressedName, ImageValidationError } from '@/lib/uploadProcessing'
import { recordAssetProvenance } from '@/lib/assetProvenance'

/**
 * POST /api/dashboard/listing/upload/finalize — step 2 of direct-to-storage upload.
 *
 * The browser has already PUT the (compressed) bytes to a staging object via the
 * signed URL from step 1. We now fetch those bytes SERVER-SIDE (not subject to
 * the request-body limit), validate + normalise them with sharp (content sniff,
 * EXIF strip, re-encode to WebP), publish under a content-addressed key, log the
 * asset to asset_provenance (best-effort), and delete the staging object.
 *
 * Auth: Bearer atlas shared JWT (vendor or admin). JSON body:
 *   { path, listingId, assetKind?, sourceDeclaration? }
 * Returns: { url }
 */

const BUCKET = 'listing-images'

export async function POST(request) {
  const limited = checkRateLimit(request, { keyPrefix: 'listing-upload-finalize', windowMs: 60_000, maxRequests: 60 })
  if (limited) return limited

  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch { body = {} }
  const stagingPath = (body.path || '').toString()
  const listingId = (body.listingId || '').toString().trim()
  const assetKind = body.assetKind === 'gallery' ? 'gallery' : 'hero'
  const sourceDeclaration = (body.sourceDeclaration || '').toString().trim() || null

  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing reference for the upload.' }, { status: 400 })
  }
  // The staged object MUST belong to this user — never process an arbitrary key.
  const stagingPrefix = `staging/${user.id}/`
  if (!stagingPath.startsWith(stagingPrefix) || stagingPath.length <= stagingPrefix.length || stagingPath.includes('..')) {
    return NextResponse.json({ error: 'Invalid upload reference.' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Fetch the staged bytes server-side (no request-body limit applies).
  const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(stagingPath)
  if (dlErr || !blob) {
    return NextResponse.json({ error: 'Uploaded file was not found. Please try again.' }, { status: 400 })
  }

  let processed
  try {
    const raw = Buffer.from(await blob.arrayBuffer())
    processed = await processImage(raw)
  } catch (err) {
    await sb.storage.from(BUCKET).remove([stagingPath]).catch(() => {})
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[listing/upload/finalize] processing error:', err?.message)
    return NextResponse.json({ error: 'Could not process that image.' }, { status: 500 })
  }

  // Content-addressed publish (dedup-safe).
  const filePath = `listings/${contentAddressedName(processed.buffer, processed.ext)}`
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, processed.buffer, {
      contentType: processed.contentType,
      cacheControl: '31536000',
      upsert: false,
    })
  const alreadyExisted = !!uploadErr && /exist|already/i.test(uploadErr.message || '')
  if (uploadErr && !alreadyExisted) {
    console.error('[listing/upload/finalize] Storage error:', uploadErr.message)
    await sb.storage.from(BUCKET).remove([stagingPath]).catch(() => {})
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath)

  const prov = await recordAssetProvenance(sb, {
    listingId,
    assetKind,
    storagePath: filePath,
    publicUrl: urlData.publicUrl,
    uploadedBy: user.id,
    sourceDeclaration,
  })
  if (!prov.ok) {
    // Non-blocking: a provenance-log hiccup must never reject an otherwise-valid
    // upload (best-effort audit trail for takedowns).
    console.warn('[listing/upload/finalize] asset_provenance write failed (non-blocking):', prov.error)
  }

  // Best-effort staging cleanup (publish already succeeded — never fail here).
  await sb.storage.from(BUCKET).remove([stagingPath]).catch(() => {})

  return NextResponse.json({ url: urlData.publicUrl })
}
