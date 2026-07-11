import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { fetchGateCheckRows, fetchHiddenListings, applyGateCheckAction, restoreHiddenListings } from '@/lib/gate-check/queue'
import { checkGate1Web, checkGate2Location, checkGate4Vertical, summariseFailures, stateFromCoords, normaliseState, nameSimilarity } from '@/lib/gate-check/gates'
import { gate4VerticalFit } from '@/lib/prospector/gates'
import { getRemediations, getAutoRemediations, DEAD_WEB_CODES, VERTICAL_LABELS } from '@/lib/gate-check/remediation'
import { updateListing } from '@/lib/admin/updateListing'
import { searchPlaces, getPlaceDetails, extractState } from '@/lib/prospector/google-places'
import { anchoredGeocode, localityCentroid } from '@/lib/geo/anchoredGeocode'
import { resolveRegionForCoords } from '@/lib/geo/resolveRegionForCoords'

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
    // 'hidden' is listing-driven (every hidden listing, not just Gate-Check
    // hides) so it can surface — and restore — listings hidden by the dedupe
    // merger or the editor too. All other views are gate-check-row-driven.
    if (status === 'hidden') {
      const { rows } = await fetchHiddenListings(sb, { vertical })
      return NextResponse.json({ rows, tableMissing: false })
    }
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

  // ── Repair: apply a remediation for a single row. ──
  //   { repair: id }                       → auto-apply the safe (non-destructive) set
  //   { repair: id, only: '<type>' }       → apply just that one remediation (incl. destructive)
  //   { repair: id, manualWebsite: '<url>' }→ set a reviewer-supplied website
  if (body && body.repair) {
    try {
      const result = await runRepair(sb, body.repair, { only: body.only || null, manualWebsite: body.manualWebsite || null })
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

  // ── Restore hidden listings by LISTING id (Hidden view) — reactivates the
  //    listing even when it has no gate-check row (dedupe/editor hides). ──
  if (body && Array.isArray(body.restoreListingIds)) {
    try {
      const result = await restoreHiddenListings(sb, { listingIds: body.restoreListingIds })
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Restore failed' }, { status: 400 })
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

// Haversine distance (km) — used to keep a same-name business in another state
// from being matched to this listing.
function kmBetween(aLat, aLng, bLat, bLng) {
  const rad = d => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

// Name-match thresholds: ≥ AUTO_MATCH may be swapped in automatically;
// SUGGEST_MATCH…AUTO_MATCH is only ever OFFERED to the reviewer (one click to
// accept via the manual-URL path) — never auto-applied. 0.62 is calibrated so
// a partial match that misses a locality word ("Adelaide Hills Distillery" vs
// "Cut Hill Wall Distillery" scores 0.57 — hills→hill + the generic
// 'distillery') lands in the suggestion tier for a human call, while full-name
// matches with venue-word noise still clear it comfortably.
const AUTO_MATCH = 0.62
const SUGGEST_MATCH = 0.3

/**
 * Find the official website for a listing via Google Places.
 *
 * Replaces the old single-shot lookup (one query, first result, hard 0.5 token
 * overlap) which failed constantly in practice: one wrong region word in the
 * query buried the venue, the one candidate it looked at often had no website,
 * and — worst — a month-exhausted Places budget silently returned [] and was
 * reported as "no confident replacement found".
 *
 * Strategy:
 *   1. Query ladder — "name locality state" first, bare "name" only if the
 *      localised query found no auto-tier match (Text Search ranks by query
 *      text, so a WRONG region label in the query hides the real venue).
 *   2. Score every unique result with nameSimilarity (fuzzy, generic-word-
 *      discounted) and a geographic sanity penalty (distance from the pin, or
 *      state mismatch when there is no pin).
 *   3. Walk the top auto-tier candidates (≤3 detail fetches): skip permanently-
 *      closed / website-less ones; verify the site is alive and matches the
 *      business (accepting Google's own name for it as an alias) before
 *      swapping it in.
 *   4. Anything promising that can't be auto-applied comes back as a
 *      `suggestion` for one-click reviewer confirmation, and every dead end is
 *      narrated in `note` so the reviewer knows exactly what was tried.
 *
 * Uses the dedicated `google_places_admin` budget pool — the cron prospector
 * exhausts the shared pool within days, which is what starved this repair.
 *
 * @returns {Promise<{url?:string, placeName?:string, notes:string[], note?:string, suggestion?:{url,placeName,reason}}>}
 */
async function findOfficialWebsite(listing) {
  const state = normaliseState(listing.state) || (listing.state || '').trim()
  const locality = ((listing.suburb || '').trim()) || (((listing.region || '').split(',')[0]) || '').trim()
  const lat = Number(listing.lat), lng = Number(listing.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  const loc = hasCoords ? { lat, lng } : null
  const currentHost = hostOf(listing.website || '')
  const places = { budgetKey: 'google_places_admin', onBudgetExhausted: 'throw' }

  const queries = [...new Set([
    `${listing.name} ${locality} ${state}`.replace(/\s+/g, ' ').trim(),
    String(listing.name || '').trim(),
  ])].filter(Boolean)

  const seen = new Set()
  const scored = []
  const notes = []
  try {
    for (const q of queries) {
      const results = await searchPlaces(q, loc, places)
      for (const r of results) {
        if (!r.place_id || seen.has(r.place_id)) continue
        seen.add(r.place_id)
        let score = nameSimilarity(listing.name, r.name || '')
        const rl = r.geometry?.location
        if (hasCoords && rl && Number.isFinite(rl.lat) && Number.isFinite(rl.lng)) {
          const km = kmBetween(lat, lng, rl.lat, rl.lng)
          if (km > 300) score -= 0.25
          else if (km > 100) score -= 0.1
        } else if (state) {
          const rs = extractState(r.formatted_address || '')
          if (rs && rs !== state) score -= 0.2
        }
        scored.push({ place_id: r.place_id, name: r.name || '', score })
      }
      if (scored.some(c => c.score >= AUTO_MATCH)) break // confident match — skip the broader query
    }
  } catch (e) {
    if (e?.code === 'PLACES_BUDGET_EXHAUSTED') {
      return { notes, note: 'the Google Places lookup budget for this month is used up (resets on the 1st; raise AI_CAP_PLACES_ADMIN_USD to extend it) — paste the correct URL below instead' }
    }
    return { notes, note: `the Google Places lookup failed (${String(e?.message || e).slice(0, 90)}) — try again or paste the URL below` }
  }

  if (!scored.length) {
    return { notes, note: `Google Places has no results for "${queries[0]}"${queries[1] ? ` or "${queries[1]}"` : ''} — the business may no longer exist` }
  }
  scored.sort((a, b) => b.score - a.score)

  let suggestion = null
  for (const cand of scored.filter(c => c.score >= AUTO_MATCH).slice(0, 3)) {
    let det = null
    try { det = await getPlaceDetails(cand.place_id, places) } catch (e) {
      if (e?.code === 'PLACES_BUDGET_EXHAUSTED') { notes.push('the Places budget ran out mid-lookup'); break }
      notes.push(`detail lookup failed for "${cand.name}"`); continue
    }
    if (!det) continue
    if (det.business_status === 'CLOSED_PERMANENTLY') { notes.push(`Google says "${det.name}" is permanently closed`); continue }
    if (!det.website) { notes.push(`matched "${det.name}" on Google Places but it lists no website`); continue }
    const url = normaliseWebsiteUrl(det.website)
    if (!url) { notes.push(`matched "${det.name}" but its listed website (${String(det.website).slice(0, 60)}) is not a usable URL`); continue }
    if (hostOf(url) === currentHost) {
      notes.push(`Google Places lists the same site (${currentHost}) for "${det.name}" — the link is current; the site itself is the problem`)
      continue
    }
    const gate = await urlPassesWebGate(listing.name, url, [det.name])
    if (gate.pass) return { url, placeName: det.name, notes }
    // Right business, but its site fails our automated checks (often just slow
    // or bot-blocked) → offer it rather than bury it.
    if (!suggestion) suggestion = { url, placeName: det.name, reason: gate.reason || 'the site did not pass the automated web check' }
    notes.push(`found ${hostOf(url)} for "${det.name}" but it did not pass the web check`)
  }

  // Near-miss tier: surface the best sub-threshold candidate for a human call.
  if (!suggestion) {
    const near = scored.find(c => c.score >= SUGGEST_MATCH && c.score < AUTO_MATCH)
    if (near) {
      try {
        const det = await getPlaceDetails(near.place_id, places)
        const url = det?.website ? normaliseWebsiteUrl(det.website) : null
        if (url && hostOf(url) !== currentHost && det.business_status !== 'CLOSED_PERMANENTLY') {
          suggestion = { url, placeName: det.name, reason: `the name is only a ${Math.round(near.score * 100)}% match — check it is the same business` }
        }
      } catch { /* best-effort — the suggestion tier never blocks the result */ }
    }
  }

  const note = notes.length
    ? notes.join('; ')
    : `the closest Google Places result ("${scored[0].name}") is not a confident name match (${Math.round(scored[0].score * 100)}%)`
  return { notes, note, suggestion }
}

// Apply a repair to a single row, then clear or refresh the affected gate(s).
// Any listing write goes through the canonical updateListing (which syncs to
// the vertical DB, so the fix is durable).
//
// opts.only         — apply just this one remediation type (incl. a destructive
//                     one, when the reviewer clicks it deliberately). When
//                     omitted, the SAFE non-destructive set is auto-applied.
// opts.manualWebsite — a reviewer-supplied URL to set as the listing's website
//                     (overrides the Places lookup; the reviewer knows best).
async function runRepair(sb, rowId, opts = {}) {
  const { only = null, manualWebsite = null } = opts
  const { data: row, error } = await sb.from('listing_gate_check')
    .select('id,listing_id,failed_gates,gate_details,reason_summary,severity,suggested_action,website,http_status,status')
    .eq('id', rowId).single()
  if (error || !row) throw new Error('Row not found')
  if (row.status !== 'pending') throw new Error('Row already actioned')

  const { data: listing, error: lerr } = await sb.from('listings')
    .select('id,name,region,state,address,suburb,lat,lng,website,vertical,verticals,sub_type,slug,source_id').eq('id', row.listing_id).single()
  if (lerr || !listing) throw new Error('Listing not found')

  // Decide which remediation(s) to run.
  let toRun
  if (manualWebsite != null) {
    // Manual URL entry: only valid when a web gate is actually failing.
    if (!(row.gate_details || []).some(d => d.gate === 'gate1_web')) throw new Error('This listing has no web gate to repair')
    const url = normaliseWebsiteUrl(manualWebsite)
    if (!url) throw new Error('That does not look like a valid URL')
    toRun = [{ type: 'set_website', gates: ['gate1_web'], url }]
  } else if (only) {
    toRun = getRemediations(row, listing).filter(r => r.type === only)
    if (!toRun.length) throw new Error('That repair no longer applies to this listing')
  } else {
    // The one-click auto-repair: safe, non-destructive remediations only.
    toRun = getAutoRemediations(row, listing)
    if (!toRun.length) throw new Error('Nothing to auto-repair on this listing')
  }

  const updates = {}
  const applied = []
  const repairedGates = new Set()
  let suggestion = null
  // Working copy of the findings so a regeocode that MOVES the pin but does not
  // clear the gate can refresh that finding's reason in place.
  let details = (row.gate_details || []).map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason }))

  for (const rem of toRun) {
    if (rem.type === 'fix_website') {
      // Replace-only: find the official site and swap it in. NEVER deletes.
      let found
      try { found = await findOfficialWebsite(listing) }
      catch (e) { found = { note: `the website lookup failed (${String(e?.message || e).slice(0, 90)})` } }

      if (found.url) {
        updates.website = found.url
        applied.push(`set website to ${hostOf(found.url)} — matched "${found.placeName}" on Google Places`)
        repairedGates.add('gate1_web')
      } else {
        // Do NOT delete, do NOT mark repaired — but say exactly what happened,
        // and pass any near-miss up as a one-click suggestion.
        applied.push(found.note || 'no confident match on Google Places')
        if (found.suggestion) suggestion = found.suggestion
      }

    } else if (rem.type === 'set_website') {
      // Reviewer-supplied URL — trust it and clear the gate.
      updates.website = rem.url
      const gate = await urlPassesWebGate(listing.name, rem.url)
      applied.push(gate.pass ? `set website to ${hostOf(rem.url)}` : `set website to ${hostOf(rem.url)} (heads-up: it did not pass the automated web check)`)
      repairedGates.add('gate1_web')

    } else if (rem.type === 'remove_dead_link') {
      // Destructive, explicit: only allowed for confidently-dead codes.
      const g1 = details.find(d => d.gate === 'gate1_web')
      if (!g1 || !DEAD_WEB_CODES.has(g1.code)) throw new Error('The link is not confirmed dead — remove is disabled')
      updates.website = null
      applied.push('removed the dead website link')
      repairedGates.add('gate1_web')

    } else if (rem.type === 'regeocode') {
      // The town/region we can trust: an explicit suburb, else the region TEXT
      // (state-stripped). We deliberately do NOT use region_computed_id — it can
      // be miscomputed (a "Noosa, QLD" listing whose computed region is "Adelaide"
      // is exactly what mis-pinned it to SA in the first place).
      const localityName = (listing.suburb || (listing.region || '').split(',')[0] || '').trim() || null
      const inState = (c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
        !checkGate2Location({ lat: c.lat, lng: c.lng, state: listing.state })
      let coords = null
      // 1. Precise, anchor-validated — only meaningful with a real street address.
      if (listing.address && listing.address.trim()) {
        try { coords = await anchoredGeocode({ address: listing.address, suburb: localityName, state: listing.state }) } catch {}
      }
      // 2. No usable precise result (or it isn't in the listed state) → fall back
      //    to the town / region CENTROID in the listed state. This lets a listing
      //    with no street address — just a town or region — re-pin to the right
      //    area (accurate to the region/city, not the exact building).
      if (!inState(coords)) {
        try {
          const loc = await localityCentroid({ locality: localityName, state: listing.state })
          if (inState(loc)) coords = loc
        } catch {}
      }
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        updates.lat = coords.lat; updates.lng = coords.lng
        // Re-verify: the flag clears ONLY if the fresh pin passes the location gate.
        const recheck = checkGate2Location({ lat: coords.lat, lng: coords.lng, state: listing.state })
        if (!recheck) {
          applied.push(`re-pinned to ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)} — now in ${listing.state || 'the listed state'}`)
          repairedGates.add('gate2_location')
        } else {
          // Pin moved, but the address still resolves outside the listed state.
          details = details.map(d => d.gate === 'gate2_location' ? { gate: recheck.gate, code: recheck.code, severity: recheck.severity, reason: recheck.reason } : d)
          applied.push(`re-pinned to ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}, but it still fails: ${recheck.reason}`)
        }
      } else {
        applied.push('could not re-geocode — no address, town or region to place it in the listed state. Pin left for manual fix.')
      }

    } else if (rem.type === 'fix_state') {
      // Trust the pin: the coordinates are right and the STATE column is what's
      // wrong (a Gold-Coast gallery tagged NSW). Derive the correct state from the
      // pin using the SAME box logic the gate flags with, then re-resolve the
      // region from those coords so the region label follows the corrected state.
      const lat = Number(listing.lat), lng = Number(listing.lng)
      const actual = (Number.isFinite(lat) && Number.isFinite(lng)) ? stateFromCoords(lat, lng) : null
      const expected = normaliseState(listing.state)
      if (!actual) {
        // The pin isn't squarely inside any single state (offshore / out of
        // Australia) — there's nothing trustworthy to copy the state from.
        applied.push('could not fix the state — the pin is not inside any single state. Re-pin from the address instead.')
      } else if (actual === expected) {
        // Already consistent — the wrong_state finding is stale; clear it.
        applied.push(`the pin is already in ${actual} — the state label matches, nothing to change`)
        repairedGates.add('gate2_location')
      } else {
        updates.state = actual
        // Re-derive the region from the trusted coords (mirrors the address-change
        // path in updateListing). Passing the resolved region NAME drives the FK
        // chain (region_override_id / region_computed_id) that the public page
        // actually reads — a bare state change would leave a stale region label.
        let regionName = null
        try {
          const region = await resolveRegionForCoords(sb, lat, lng, { state: actual })
          if (region?.name) { regionName = region.name; updates.region = region.name }
        } catch { /* region resolution best-effort — the state fix still lands */ }
        // Re-verify against the corrected state; wrong_state clears because the
        // pin sits inside `actual`'s box by construction.
        const recheck = checkGate2Location({ lat, lng, state: actual })
        if (!recheck) {
          applied.push(`set state to ${actual}${regionName ? ` and region to ${regionName}` : ''} to match the pin (was ${listing.state || 'blank'})`)
          repairedGates.add('gate2_location')
        } else {
          details = details.map(d => d.gate === 'gate2_location' ? { gate: recheck.gate, code: recheck.code, severity: recheck.severity, reason: recheck.reason } : d)
          applied.push(`set state to ${actual}, but the location gate still flags it: ${recheck.reason}`)
        }
      }

    } else if (rem.type === 'move_vertical' && rem.to) {
      updates.vertical = rem.to
      updates.verticals = [rem.to]
      applied.push(`moved to ${VERTICAL_LABELS[rem.to] || rem.to} Atlas`)
      repairedGates.add('gate4_vertical')
    }
  }

  // Nothing changed on the listing and no gate cleared (e.g. Places found no
  // replacement, or the address wouldn't geocode).
  if (!repairedGates.size && !Object.keys(updates).length) {
    return { applied, cleared: false, noop: true, repaired_gates: [], suggestion }
  }

  let listingPatch = null
  if (Object.keys(updates).length) {
    const res = await updateListing(row.listing_id, updates, { action: 'gate-check-repair' })
    if (!res.success) throw new Error(`Listing update failed: ${res.error}`)
    // Echo the changed fields back so the card reflects them (map moves, link
    // updates, corrected state/region label).
    listingPatch = {}
    for (const k of ['lat', 'lng', 'website', 'vertical', 'verticals', 'state', 'region']) if (k in updates) listingPatch[k] = res.listing?.[k] ?? updates[k]
  }

  // Clear the repaired gate(s); keep (with any refreshed reason) those that weren't.
  const remaining = details.filter(d => !repairedGates.has(d.gate))
  let cleared = false
  let updatedRow = null
  if (!remaining.length) {
    await sb.from('listing_gate_check').update({ status: 'passed', reviewed_at: new Date().toISOString(), reviewed_by: 'repaired' }).eq('id', rowId)
    cleared = true
  } else {
    const summary = summariseFailures(
      remaining,
      { website: ('website' in updates) ? updates.website : row.website, http_status: row.http_status },
    )
    await sb.from('listing_gate_check').update({ ...summary }).eq('id', rowId)
    updatedRow = summary
  }

  return { applied, cleared, updatedRow, listingPatch, repaired_gates: [...repairedGates], suggestion }
}

function hostOf(u) { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u } }

// Loose URL validation + normalisation for a reviewer-pasted / Places website.
// Returns a canonical https URL string, or null if it isn't a plausible web URL.
function normaliseWebsiteUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  let candidate = /^https?:\/\//i.test(s) ? s : 'https://' + s
  try {
    const u = new URL(candidate)
    // Must have a dotted hostname (reject "https://localhost", bare words, etc.).
    if (!u.hostname || !u.hostname.includes('.')) return null
    return u.toString()
  } catch { return null }
}

// Does a candidate URL clear the Web-Presence gate? Used to reject swapping in a
// replacement that is itself dead/parked/unrelated. Bot-blocks (401/403/429) and
// transient 5xx are treated as PASS by checkGate1Web, so they don't reject a
// legitimate site. `altNames` (e.g. Google Places' own name for the venue) let a
// site that identifies under a variant spelling clear the name check. On any
// error, fail open (don't block the repair on a hiccup).
async function urlPassesWebGate(name, url, altNames = []) {
  try {
    const r = await checkGate1Web({ name, website: url, altNames }, { timeoutMs: 9000, retries: 0 })
    return { pass: !r.failure, reason: r.failure?.reason || null }
  } catch { return { pass: true, reason: null } }
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
    // web/activity findings, character findings (commercial-group AND
    // site-content service-business), and any on-demand AI vertical finding
    // (code *_ai) — and refresh only the deterministic location/fit gates on top.
    const kept = (prev?.gate_details || [])
      .filter(d => d.gate === 'gate1_web' || d.gate === 'gate3_activity' || d.gate === 'gate5_character' || String(d.code || '').endsWith('_ai'))
      .map(d => ({ gate: d.gate, code: d.code, severity: d.severity, reason: d.reason, ...(d.suggested_vertical ? { suggested_vertical: d.suggested_vertical } : {}) }))
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
