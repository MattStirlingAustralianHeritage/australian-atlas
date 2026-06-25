/**
 * Shared upload-warranty / provenance logging for operator image uploads.
 *
 * Extracted so the direct-upload finalize route and the multipart fallback route
 * write IDENTICAL provenance records — the upload-rights affirmation is a legal
 * record and the two ingest paths must not drift. Callers are expected to
 * fail closed: if this returns { ok: false }, remove the just-stored object and
 * fail the request (never expose an asset whose warranty we couldn't log).
 */

import { getCurrentLegalDocuments, UPLOAD_DOC_TYPE } from '@/lib/legal/documents'

/**
 * @param {object} sb        service-role Supabase client
 * @param {object} rec
 * @param {string} rec.listingId
 * @param {'hero'|'gallery'} rec.assetKind
 * @param {string} rec.storagePath
 * @param {string} rec.publicUrl
 * @param {string} rec.uploadedBy        user id
 * @param {string|null} [rec.sourceDeclaration]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function recordAssetProvenance(sb, rec) {
  // Capture which upload_terms version was in force (nice-to-have; the warranty
  // boolean is the real record).
  let uploadTermsVersion = null
  try {
    const docs = await getCurrentLegalDocuments(sb, [UPLOAD_DOC_TYPE])
    uploadTermsVersion = docs[UPLOAD_DOC_TYPE]?.version ?? null
  } catch { /* non-critical */ }

  const { error } = await sb.from('asset_provenance').insert({
    listing_id: rec.listingId,
    asset_kind: rec.assetKind,
    storage_path: rec.storagePath,
    public_url: rec.publicUrl,
    uploaded_by: rec.uploadedBy,
    upload_warranty_accepted: true,
    upload_warranty_accepted_at: new Date().toISOString(),
    upload_terms_version: uploadTermsVersion,
    source_declaration: rec.sourceDeclaration ?? null,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
