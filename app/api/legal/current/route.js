import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getCurrentLegalDocuments } from '@/lib/legal/documents'

/**
 * GET /api/legal/current?types=upload_terms,operator_agreement
 *
 * Returns the CURRENT (is_current) version of each requested legal doc_type so
 * client UIs can render the live wording (text is a data change, not code).
 * Public + read-only — legal_documents is public-readable for current docs.
 */
export async function GET(request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('types') || 'upload_terms'
  const valid = ['operator_agreement', 'upload_terms', 'terms_of_service', 'privacy_policy']
  const types = raw.split(',').map((t) => t.trim()).filter((t) => valid.includes(t))
  if (!types.length) {
    return NextResponse.json({ error: 'No valid doc types requested' }, { status: 400 })
  }
  const docs = await getCurrentLegalDocuments(getSupabaseAdmin(), types)
  return NextResponse.json({ docs })
}
