import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchGateCheckRows, applyGateCheckAction } from '@/lib/gate-check/queue'
import { checkGate1Web, checkGate2Location, checkGate4Vertical, summariseFailures } from '@/lib/gate-check/gates'
import { gate4VerticalFit } from '@/lib/prospector/gates'
import { getRemediations, VERTICAL_LABELS } from '@/lib/gate-check/remediation'
import { updateListing } from '@/lib/admin/updateListing'
import { searchPlaces, getPlaceDetails } from '@/lib/prospector/google-places'
import { anchoredGeocode } from '@/lib/geo/anchoredGeocode'

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

  // ── One-click Repair: apply the suggested remediation for a single row ──
  if (body && body.repair) {
    try {
      const result = await runRepair(sb, body.repair)
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Repair failed' }, { status: 400 })
    }
  }

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

// Token overlap between two names (0–1) — used to guard against attaching an
// unrelated Google Places result's website to a listing.
function nameOverlap(a, b) {
  const toks = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
  const ta = toks(a), tb = toks(b)
  if (!ta.size) return 0
  let m = 0
  for (const w of ta) if (tb.has(w)) m++
  return m / ta.size
}

// Apply the safe, one-click remediation(s) for a row, then clear the repaired
// gate(s). Any listing write goes through the canonical updateListing (which
// syncs to the vertical DB, so the fix is durable).
async function runRepair(sb, rowId) {
  const { data: row, error } = await sb.from('listing_gate_check')
    .select('id,listing_id,failed_gates,gate_details,reason_summary,severity,suggested_action,website,http_status,status')
    .eq('id', rowId).single()
  if (error || !row) throw new Error('Row not found')
  if (row.status !== 'pending') throw new Error('Row already actioned')

  const { data: listing, error: lerr } = await sb.from('listings')
    .select('id,name,region,state,address,suburb,lat,lng,website,vertical,verticals,sub_type,slug,source_id').eq('id', row.listing_id).single()
  if (lerr || !listing) throw new Error('Listing not found')

  const remediations = getRemediations(row, listing)
  if (!remediations.length) throw new Error('Nothing to repair on this listing')

  const updates = {}
  const applied = []
  const repairedGates = new Set()

  for (const rem of remediations) {
    if (rem.type === 'fix_website') {
      const g1 = (row.gate_details || []).find(d => d.gate === 'gate1_web')
      const confirmedDead = g1 && ['domain_dead', 'http_gone', 'parked_domain'].includes(g1.code)
      let found = null
      try {
        const loc = (Number.isFinite(Number(listing.lat)) && Number.isFinite(Number(listing.lng)) && !(Number(listing.lat) === 0 && Number(listing.lng) === 0))
          ? { lat: Number(listing.lat), lng: Number(listing.lng) } : null
        const results = await searchPlaces(`${listing.name} ${listing.region || listing.state || ''}`.trim(), loc)
        const best = (results || []).find(r => nameOverlap(listing.name, r.name) >= 0.5) || (results || [])[0]
        if (best && nameOverlap(listing.name, best.name) >= 0.5) {
          const det = await getPlaceDetails(best.place_id)
          // Only accept a genuinely different URL from the current dead one.
          if (det?.website && hostOf(det.website) !== hostOf(listing.website || '')) found = det.website
        }
      } catch (e) { /* Places unavailable → confirmed-dead falls back to nulling */ }

      if (found) { updates.website = found; applied.push(`set website to ${hostOf(found)}`); repairedGates.add('gate1_web') }
      else if (confirmedDead) { updates.website = null; applied.push('removed the dead website link'); repairedGates.add('gate1_web') }
      else { applied.push('no replacement website found — left for manual review') } // do NOT mark repaired

    } else if (rem.type === 'regeocode') {
      let coords = null
      try { coords = await anchoredGeocode({ address: listing.address || `${listing.name}, ${listing.region || ''}`, suburb: listing.suburb, state: listing.state }) } catch {}
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        updates.lat = coords.lat; updates.lng = coords.lng
        applied.push(`re-pinned to ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`)
        repairedGates.add('gate2_location')
      } else {
        applied.push('could not re-geocode (no usable address) — pin left for manual fix')
      }

    } else if (rem.type === 'move_vertical' && rem.to) {
      updates.vertical = rem.to
      updates.verticals = [rem.to]
      applied.push(`moved to ${VERTICAL_LABELS[rem.to] || rem.to} Atlas`)
      repairedGates.add('gate4_vertical')
    }
  }

  // Nothing could be auto-applied (e.g. Places quota exhausted on a name_mismatch).
  if (!repairedGates.size && !Object.keys(updates).length) {
    return { applied, cleared: false, noop: true, repaired_gates: [] }
  }

  let updatedListing = null
  if (Object.keys(updates).length) {
    const res = await updateListing(row.listing_id, updates, { action: 'gate-check-repair' })
    if (!res.success) throw new Error(`Listing update failed: ${res.error}`)
    updatedListing = res.listing
  }

  // Clear the repaired gate(s); keep any that weren't repaired.
  const remaining = (row.gate_details || []).filter(d => !repairedGates.has(d.gate))
  let cleared = false
  let updatedRow = null
  if (!remaining.length) {
    await sb.from('listing_gate_check').update({ status: 'passed', reviewed_at: new Date().toISOString(), reviewed_by: 'repaired' }).eq('id', rowId)
    cleared = true
  } else {
    const summary = summariseFailures(
      remaining.map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason })),
      { website: ('website' in updates) ? updates.website : row.website, http_status: row.http_status },
    )
    await sb.from('listing_gate_check').update({ ...summary }).eq('id', rowId)
    updatedRow = summary
  }

  return { applied, cleared, updatedRow, repaired_gates: [...repairedGates] }
}

function hostOf(u) { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u } }

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

  // Existing rows. MUST .order() a stable column — a paged range() over >1000
  // rows without it can skip rows and clobber prior admin decisions.
  const existing = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('listing_gate_check')
      .select('id,listing_id,status,failed_gates,gate_details,website,http_status').order('listing_id').range(from, from + PAGE - 1)
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
    // Preserve every finding this fast path does NOT recompute — the deep sweep's
    // web/activity findings AND any on-demand AI vertical finding (code *_ai) —
    // and refresh only the deterministic location/fit gates on top.
    const kept = (prev?.gate_details || [])
      .filter(d => d.gate === 'gate1_web' || d.gate === 'gate3_activity' || String(d.code || '').endsWith('_ai'))
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
    // Never clear a row carrying an on-demand AI finding — this pass doesn't re-verify it.
    if ((r.gate_details || []).some(d => String(d.code || '').endsWith('_ai'))) continue
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

  const { count: pending } = await sb.from('listing_gate_check').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  return { scanned: listings.length, upserted, cleared, pending: pending ?? null }
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
  // gate4VerticalFit coerces a malformed/absent confidence to 0 (not null) — treat
  // confidence 0 with no wrong-vertical as unverifiable too (a model non-answer),
  // so a hiccup never persists a fabricated "poor fit".
  const conf = verdict.details?.confidence
  const unverifiable = !isFit && !verdict.wrongVertical && (conf == null || Number(conf) === 0)
  if (unverifiable) {
    return { isFit: null, unverifiable: true, verdict: { reason: verdict.reason || 'could not verify vertical fit', confidence: null, suggestedVertical: null } }
  }
  const suggestedVertical = verdict.wrongVertical?.suggested_vertical || verdict.details?.suggestedVertical || null
  const detail = {
    gate: 'gate4_vertical',
    code: verdict.wrongVertical ? 'wrong_vertical_ai' : 'low_fit_ai',
    severity: verdict.wrongVertical ? 2 : 1,
    reason: `AI check: ${verdict.reason || (isFit ? 'good fit' : 'unverified')}`,
    ...(suggestedVertical ? { suggested_vertical: suggestedVertical } : {}),
  }

  let updatedRow = null
  if (!isFit) {
    // Merge the AI finding into the row so it persists + becomes actionable.
    const details = Array.isArray(row.gate_details) ? row.gate_details.filter(d => !String(d.code || '').endsWith('_ai')) : []
    details.push(detail)
    const failedGates = [...new Set([...(row.failed_gates || []), 'gate4_vertical'])]
    const suggested = verdict.wrongVertical && row.suggested_action === 'pass' ? 'hide' : row.suggested_action
    const severity = verdict.wrongVertical && row.severity === 'low' ? 'medium' : row.severity
    const reason_summary = details.map(d => d.reason).join(' ')
    await sb.from('listing_gate_check').update({
      gate_details: details, failed_gates: failedGates, reason_summary,
      suggested_action: suggested, severity,
    }).eq('id', rowId)
    // Return the new fields so the client can reconcile the row without a refetch.
    updatedRow = { gate_details: details, failed_gates: failedGates, reason_summary, suggested_action: suggested, severity }
  }

  return {
    isFit,
    updatedRow,
    verdict: { reason: verdict.reason || null, confidence: verdict.details?.confidence ?? null, suggestedVertical: verdict.details?.suggestedVertical || verdict.wrongVertical?.suggested_vertical || null },
  }
}
