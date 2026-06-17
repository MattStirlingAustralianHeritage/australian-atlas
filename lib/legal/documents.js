// ── Legal documents + acceptance recording ──────────────────────────────────
// Reads the CURRENT (is_current) legal text from the legal_documents table so
// the claim/upload gates render wording straight from the DB — swapping in the
// solicitor's final copy is then a data change, not a code change.
//
// See migrations 166 (legal_documents) + 167 (legal_acceptances). All seeded
// copy is INTERIM / non-binding placeholder pending solicitor review.

// Docs an operator must affirm to complete a listing claim.
export const CLAIM_REQUIRED_DOC_TYPES = ['operator_agreement', 'upload_terms']
// Doc whose warranty governs image uploads.
export const UPLOAD_DOC_TYPE = 'upload_terms'

/**
 * Fetch the current version of each requested doc_type.
 * @returns {Promise<Record<string, {id, doc_type, version, title, body_md, content_hash}>>}
 *          keyed by doc_type. Missing types are simply absent from the map.
 *          Returns {} on error (callers fail closed).
 */
export async function getCurrentLegalDocuments(sb, docTypes = CLAIM_REQUIRED_DOC_TYPES) {
  const { data, error } = await sb
    .from('legal_documents')
    .select('id, doc_type, version, title, body_md, content_hash')
    .eq('is_current', true)
    .in('doc_type', docTypes)

  if (error) {
    console.error('[legal] getCurrentLegalDocuments error:', error.message)
    return {}
  }
  const out = {}
  for (const d of data || []) out[d.doc_type] = d
  return out
}

/**
 * Record one legal_acceptances row per supplied document. Recording is the
 * AUDIT TRAIL; the gate (requiring the affirmation up-front) is the enforcement.
 * operator_id is typically null at claim time (pre-account) — claim_id +
 * subjectEmail keep the row attributable (see migration 167).
 *
 * @returns {Promise<{written:number, error:(object|null)}>}
 */
export async function recordLegalAcceptances(sb, {
  documents,
  claimId = null,
  operatorId = null,
  subjectEmail = null,
  ipAddress = null,
  userAgent = null,
}) {
  const rows = (documents || [])
    .filter(Boolean)
    .map((d) => ({
      operator_id: operatorId,
      claim_id: claimId,
      subject_email: subjectEmail,
      document_id: d.id,
      doc_type: d.doc_type,
      doc_version: d.version,
      content_hash: d.content_hash || null,
      ip_address: ipAddress,
      user_agent: userAgent,
    }))

  if (!rows.length) return { written: 0, error: null }

  const { error } = await sb.from('legal_acceptances').insert(rows)
  if (error) {
    console.error('[legal] recordLegalAcceptances error:', error.message)
    return { written: 0, error }
  }
  return { written: rows.length, error: null }
}
