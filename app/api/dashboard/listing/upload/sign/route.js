import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/dashboard/listing/upload/sign — step 1 of direct-to-storage upload.
 *
 * The operator's browser uploads the (compressed) image straight to Supabase
 * Storage, bypassing Vercel's ~4.5MB function request-body limit entirely. This
 * route only does authz, then mints a one-time signed upload token to a per-user
 * STAGING path. The raw bytes never transit our function. Step 2 (.../finalize)
 * processes and publishes the staged object.
 *
 * Auth: Bearer atlas shared JWT (vendor or admin). JSON body:
 *   { listingId, assetKind? }
 * Returns: { bucket, path, token }
 */

const BUCKET = 'listing-images'

export async function POST(request) {
  const limited = checkRateLimit(request, { keyPrefix: 'listing-upload-sign', windowMs: 60_000, maxRequests: 60 })
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
  const listingId = (body.listingId || '').toString().trim()

  if (!listingId) {
    return NextResponse.json({ error: 'Missing listing reference for the upload.' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Ensure the bucket exists (idempotent).
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, { public: true })
  if (bucketErr && !/exist/i.test(bucketErr.message || '')) {
    console.warn('[listing/upload/sign] createBucket warning:', bucketErr.message)
  }

  // Per-user staging key so finalize can prove ownership of what it processes.
  const rand = Math.random().toString(36).slice(2, 12)
  const path = `staging/${user.id}/${Date.now()}-${rand}`

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('[listing/upload/sign] createSignedUploadUrl error:', error?.message)
    return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ bucket: BUCKET, path: data.path || path, token: data.token })
}
