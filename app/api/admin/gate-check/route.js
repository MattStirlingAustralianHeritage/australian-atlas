import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchGateCheckRows, applyGateCheckAction } from '@/lib/gate-check/queue'
import { checkGate1Web, checkGate2Location, checkGate4Vertical, summariseFailures } from '@/lib/gate-check/gates'
import { gate4VerticalFit } from '@/lib/prospector/gates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_STATUS = ['pending', 'passed', 'hidden', 'deleted']

// ─── GET: list queue rows for a view (with filters) ─────────────────────────
export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }
  const vertical = searchParams.get('vertical') || null
  const gate = searchParams.get('gate') || null
  const action = searchParams.get('action') || null
  const severity = searchParams.get('severity') || null

  try {
    const sb = getSupabaseAdmin()
    const { rows, tableMissing } = await fetchGateCheckRows(sb, { status, vertical, gate, action, severity })
    return NextResponse.json({ rows, tableMissing })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to load queue' }, { status: 500 })
  }
}

// ─── POST: apply an action, or run an on-demand AI vertical-fit check ────────
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const sb = getSupabaseAdmin()

  // ── On-demand AI vertical-fit deep check (LLM Gate 4) for a single row ──
  if (body && body.aiCheck) {
    try {
      const result = await runAiCheck(sb, body.aiCheck)
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      return NextResponse.json({ error: err.message || 'AI check failed' }, { status: 400 })
    }
  }

  // ── Quick re-scan: Location + Vertical-fit gates only (pure compute, no
  //    network) so it runs inside the request. The deep Web-Presence sweep is
  //    the server-side script scripts/sweep-gate-check.mjs. ──
  if (body && body.quickScan) {
    try {
      const result = await runQuickScan(sb)
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Quick scan failed' }, { status: 500 })
    }
  }

  const { ids, action, reviewer } = body || {}
  try {
    const result = await applyGateCheckAction(sb, { ids, action, reviewer: reviewer || 'admin' })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 400 })
  }
}

// Re-evaluate the two instant gates (Location + service-trade Vertical-fit)
// across every active listing. Upserts new/changed failures and clears pending
// rows whose ONLY failures were these gates and that now pass (leaving any
// Web-Presence / Activity failures — which this fast path can't re-verify —
// untouched). CURRENT_YEAR unused here (no Activity gate in the quick path).
async function runQuickScan(sb) {
  const PAGE = 1000
  const listings = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('listings')
      .select('id,name,sub_type,description,state,lat,lng,website')
      .eq('status', 'active').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load listings: ${error.message}`)
    listings.push(...data)
    if (!data || data.length < PAGE) break
  }

  // Existing rows: id, listing_id, status, failed_gates.
  const existing = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('listing_gate_check')
      .select('id,listing_id,status,failed_gates,gate_details,website,http_status').range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to read gate-check rows: ${error.message}`)
    for (const r of data) existing.set(r.listing_id, r)
    if (!data || data.length < PAGE) break
  }

  const toUpsert = []
  const failingIds = new Set()
  for (const l of listings) {
    const failures = [checkGate2Location(l), checkGate4Vertical(l)].filter(Boolean)
    if (!failures.length) continue
    failingIds.add(l.id)
    const prev = existing.get(l.id)
    if (prev && prev.status !== 'pending') continue // already actioned — leave it
    // Preserve the deep sweep's web/activity findings (which this fast path can't
    // re-verify) and refresh only the location/fit gates on top.
    const kept = (prev?.gate_details || [])
      .filter(d => d.gate === 'gate1_web' || d.gate === 'gate3_activity')
      .map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason }))
    const summary = summariseFailures([...kept, ...failures], { website: l.website || prev?.website || null, http_status: prev?.http_status ?? null })
    toUpsert.push({ listing_id: l.id, scanned_at: new Date().toISOString(), status: 'pending', reviewed_at: null, reviewed_by: null, ...summary })
  }

  let upserted = 0
  for (let i = 0; i < toUpsert.length; i += 500) {
    const c = toUpsert.slice(i, i + 500)
    const { data, error } = await sb.from('listing_gate_check').upsert(c, { onConflict: 'listing_id' }).select('id')
    if (error) throw new Error(`Upsert failed after ${upserted}: ${error.message}`)
    upserted += data.length
  }

  // Clear pending rows whose failures were exclusively location/vertical and no longer apply.
  let cleared = 0
  const clearIds = []
  for (const [listingId, r] of existing.entries()) {
    if (r.status !== 'pending') continue
    if (failingIds.has(listingId)) continue
    const gates = r.failed_gates || []
    const onlyQuickGates = gates.length > 0 && gates.every(g => g === 'gate2_location' || g === 'gate4_vertical')
    if (onlyQuickGates) clearIds.push(r.id)
  }
  for (let i = 0; i < clearIds.length; i += 200) {
    const c = clearIds.slice(i, i + 200)
    const { data, error } = await sb.from('listing_gate_check')
      .update({ status: 'passed', reviewed_at: new Date().toISOString(), reviewed_by: 'quick_rescan_cleared' })
      .in('id', c).select('id')
    if (error) throw new Error(`Clear failed: ${error.message}`)
    cleared += data.length
  }

  return { scanned: listings.length, upserted, cleared }
}

// Run Claude vertical-fit on a single queue row's listing; persist the verdict
// into the row when it flags a wrong vertical / poor fit.
async function runAiCheck(sb, rowId) {
  const { data: row, error } = await sb.from('listing_gate_check')
    .select('id,listing_id,failed_gates,gate_details,reason_summary,suggested_action,severity')
    .eq('id', rowId).single()
  if (error || !row) throw new Error('Row not found')

  const { data: listing, error: lerr } = await sb.from('listings')
    .select('id,name,vertical,region,state,website,site_text').eq('id', row.listing_id).single()
  if (lerr || !listing) throw new Error('Listing not found')

  // Prefer cached site_text; fall back to a fresh fetch when we have a URL.
  let text = listing.site_text || ''
  if ((!text || text.length < 200) && listing.website) {
    try { const g1 = await checkGate1Web(listing, { timeoutMs: 12000, retries: 0 }); if (g1.text) text = g1.text } catch {}
  }

  const verdict = await gate4VerticalFit(
    { name: listing.name, vertical: listing.vertical, region: listing.region || listing.state, website_url: listing.website },
    text, {},
  )

  // verdict.pass === true → good fit. false → wrong vertical / low confidence / unverifiable.
  const isFit = verdict.pass === true
  // Distinguish a real "poor fit" verdict from an unverifiable one (no API key,
  // budget reached, API/parse error) — those carry no confidence and must NOT
  // be persisted as a fit failure.
  const unverifiable = !isFit && verdict.details?.confidence == null && !verdict.wrongVertical
  if (unverifiable) {
    return { isFit: null, unverifiable: true, verdict: { reason: verdict.reason || 'could not verify vertical fit', confidence: null, suggestedVertical: null } }
  }
  const detail = {
    gate: 'gate4_vertical',
    code: verdict.wrongVertical ? 'wrong_vertical_ai' : 'low_fit_ai',
    severity: verdict.wrongVertical ? 2 : 1,
    reason: `AI check: ${verdict.reason || (isFit ? 'good fit' : 'unverified')}`,
  }

  if (!isFit) {
    // Merge the AI finding into the row so it persists + becomes actionable.
    const details = Array.isArray(row.gate_details) ? row.gate_details.filter(d => !String(d.code || '').endsWith('_ai')) : []
    details.push(detail)
    const failedGates = [...new Set([...(row.failed_gates || []), 'gate4_vertical'])]
    const suggested = verdict.wrongVertical && row.suggested_action === 'pass' ? 'hide' : row.suggested_action
    const severity = verdict.wrongVertical && row.severity === 'low' ? 'medium' : row.severity
    await sb.from('listing_gate_check').update({
      gate_details: details, failed_gates: failedGates,
      reason_summary: details.map(d => d.reason).join(' '),
      suggested_action: suggested, severity,
    }).eq('id', rowId)
  }

  return { isFit, verdict: { reason: verdict.reason || null, confidence: verdict.details?.confidence ?? null, suggestedVertical: verdict.details?.suggestedVertical || verdict.wrongVertical?.suggested_vertical || null } }
}
