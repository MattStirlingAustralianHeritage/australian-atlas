/**
 * Client-side operator image upload with a resilient two-tier strategy.
 *
 * Preferred path — DIRECT TO STORAGE (no Vercel ~4.5MB request-body limit):
 *   1. POST /upload/sign          → one-time signed upload token (authz + warranty)
 *   2. PUT bytes straight to Supabase via uploadToSignedUrl
 *   3. POST /upload/finalize      → server validates/normalises + publishes, returns URL
 *
 * Fallback path — MULTIPART through the function (used only if the direct path
 * errors for transport/server reasons). The image is compressed first, so the
 * fallback stays comfortably under the body limit.
 *
 * A 400 from finalize is a genuine rejection (not an image, too large, bad
 * warranty) — surfaced directly, never retried. Only transport/5xx/network
 * failures fall back.
 *
 * Returns the public URL string, or throws an Error with a user-facing message.
 */

import { compressImage } from '@/lib/compressImage'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

async function safeJson(res) {
  try { return await res.json() } catch { return {} }
}

async function uploadDirect(file, { token, listingId, assetKind, sourceDeclaration }) {
  const signRes = await fetch('/api/dashboard/listing/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId, assetKind, uploadWarrantyAccepted: true }),
  })
  const sign = await safeJson(signRes)
  if (!signRes.ok || !sign.token || !sign.path) {
    throw new Error(sign.error || 'Could not start the upload.')
  }

  const sb = getAuthSupabase()
  const { error: putErr } = await sb.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file)
  if (putErr) throw new Error(putErr.message || 'Direct upload failed.')

  const finRes = await fetch('/api/dashboard/listing/upload/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path: sign.path, listingId, assetKind, uploadWarrantyAccepted: true, sourceDeclaration: sourceDeclaration || null }),
  })
  const fin = await safeJson(finRes)
  if (!finRes.ok || !fin.url) {
    const err = new Error(fin.error || 'Could not finish the upload.')
    // A 400 is a real, terminal rejection — don't fall back and re-try the same bytes.
    err.terminal = finRes.status === 400
    throw err
  }
  return fin.url
}

async function uploadMultipart(file, { token, listingId, assetKind, sourceDeclaration }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('listingId', listingId)
  fd.append('assetKind', assetKind)
  fd.append('uploadWarrantyAccepted', 'true')
  if (sourceDeclaration) fd.append('sourceDeclaration', sourceDeclaration)

  const res = await fetch('/api/dashboard/listing/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const data = await safeJson(res)
  if (!res.ok || !data.url) {
    throw new Error(data.error || (res.status === 413 ? 'That image is too large — please use a smaller photo.' : 'Upload failed'))
  }
  return data.url
}

/**
 * @param {File} rawFile
 * @param {{ token: string, listingId: string, assetKind?: 'hero'|'gallery', sourceDeclaration?: string|null }} opts
 * @returns {Promise<string>} public URL
 */
export async function uploadOperatorImage(rawFile, opts) {
  const assetKind = opts.assetKind === 'gallery' ? 'gallery' : 'hero'
  const file = await compressImage(rawFile)
  const params = { token: opts.token, listingId: opts.listingId, assetKind, sourceDeclaration: opts.sourceDeclaration || null }

  try {
    return await uploadDirect(file, params)
  } catch (err) {
    if (err && err.terminal) throw new Error(err.message) // genuine rejection — show it
    // Transport/server failure on the direct path → fall back to multipart.
    return await uploadMultipart(file, params)
  }
}
