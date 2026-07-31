import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { searchPlaces, getPlaceDetails, extractState } from '@/lib/prospector/google-places'
import { haversineKm } from '@/lib/trade/distance'
import { classifyClosure, scanSiteTextForClosure, nameSimilarity, NAME_MATCH_THRESHOLD } from '@/lib/closures/classify'
import { probeWebsite, placesEscalationReason } from '@/lib/closures/probe'
import { melbourneMonthKey, melbourneMonthStart } from '@/lib/closures/monthWindow'

/**
 * GET /api/cron/closure-sweep
 *
 * Monthly deep closure sweep — walks EVERY active listing once per Melbourne
 * calendar month looking for permanently closed and temporarily shut venues.
 *
 * Runs daily as a continuation: the work queue is "active listings whose
 * closure_checked_at predates the current month", oldest first, processed
 * within a wall-clock budget. Early-month runs chew through the backlog over
 * successive days; once the month is covered every later run no-ops in one
 * cheap query. Self-draining — every processed listing is stamped, success
 * or error, so no cursor state exists to corrupt.
 *
 * Two tiers per listing:
 *   1. FREE  — fetch its website, classify reachability (TLS errors and
 *      timeouts are NOT dead sites), scan the page text for closure phrases.
 *   2. PAID  — only when tier 1 is suspicious, the venue has no website, the
 *      public filed closure reports, or we're rechecking a temporarily-closed
 *      venue: Google Places search + details for business_status, guarded by
 *      name similarity (the rebrand trap: ~60% of raw CLOSED_PERMANENTLY hits
 *      were false positives). Spend is capped by the dedicated
 *      google_places_closure budget pool (AI_CAP_PLACES_CLOSURE_USD) and
 *      fails VISIBLY: exhaustion is counted, reported in the run summary and
 *      the admin console — never silently swallowed.
 *
 * The sweep NEVER changes a listing's public state. Verdicts land in
 * closure_signals for a human decision at /admin/closures.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const BATCH_SIZE = 25
const DELAY_MS = 250
// Stop dispatching with headroom before maxDuration: a platform kill never
// reaches the catch and would strand the agent_runs row at 'running'.
const TIME_BUDGET_MS = 270000
// A dismissed signal suppresses re-flagging the same signal type this long.
const DISMISSED_SUPPRESSION_DAYS = 90

const PLACES_OPTS = { budgetKey: 'google_places_closure', onBudgetExhausted: 'throw' }

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('closure-sweep')

  const monthKey = melbourneMonthKey()
  const monthStartIso = melbourneMonthStart().toISOString()

  const counts = {
    processed: 0,
    escalated: 0,
    places_searches: 0,
    places_details: 0,
    places_deferred: 0, // budget exhausted — listing stamped, Places skipped
    signals_created: 0,
    signals_refreshed: 0,
    suppressed_dismissed: 0,
    reopened_flagged: 0,
    errors: 0,
  }
  let timeCapped = false
  let placesBudgetExhausted = false
  let consecutiveStampFailures = 0

  try {
    const deadlineMs = Date.now() + TIME_BUDGET_MS

    while (Date.now() < deadlineMs) {
      // Every processed row gets stamped (success or error), leaving the
      // filtered set — so the window always starts at 0.
      const { data: batch, error: fetchError } = await dueListingsQuery(sb, monthStartIso)
        .range(0, BATCH_SIZE - 1)

      if (fetchError) throw new Error(`fetch batch: ${fetchError.message}`)
      if (!batch || batch.length === 0) break

      for (const listing of batch) {
        if (Date.now() >= deadlineMs) { timeCapped = true; break }

        const outcome = await deepCheckListing(sb, listing, counts, runId)
        if (outcome === 'places_budget_exhausted') placesBudgetExhausted = true

        // Stamp regardless of outcome — an unstampable row would loop forever.
        const { error: stampError } = await sb
          .from('listings')
          .update({ closure_checked_at: new Date().toISOString() })
          .eq('id', listing.id)
        if (stampError) {
          counts.errors++
          if (++consecutiveStampFailures >= 3) {
            throw new Error(`stamping closure_checked_at keeps failing (${stampError.message}) — aborting to avoid a hot loop`)
          }
        } else {
          consecutiveStampFailures = 0
        }
        counts.processed++

        await delay(DELAY_MS)
      }
      if (timeCapped) break
    }

    // How much of this month's sweep is still outstanding?
    const { count: remaining } = await dueListingsQuery(sb, monthStartIso, { head: true })
    const sweepComplete = (remaining ?? 0) === 0

    const summary = {
      month: monthKey,
      ...counts,
      remaining: remaining ?? null,
      sweep_complete: sweepComplete ? 'yes' : null,
      time_capped: timeCapped ? 'yes' : null,
      places_budget_exhausted: placesBudgetExhausted ? 'yes' : null,
    }
    await completeRun(runId, { summary })

    if (counts.signals_created > 0 || (sweepComplete && counts.processed > 0)) {
      await sendAgentEmail({
        subject: `Closure Sweep — ${counts.signals_created} new signal${counts.signals_created === 1 ? '' : 's'} (${monthKey})`,
        html: buildEmailHtml(monthKey, counts, remaining ?? 0, sweepComplete, placesBudgetExhausted),
      })
    }

    console.log(`[closure-sweep] ${monthKey}: processed ${counts.processed}, signals ${counts.signals_created} new / ${counts.signals_refreshed} refreshed, remaining ${remaining}`)
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('[closure-sweep] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: 'Closure sweep failed', detail: err.message }, { status: 500 })
  }
}

// Active listings not yet deep-checked this Melbourne month, oldest first.
function dueListingsQuery(sb, monthStartIso, { head = false } = {}) {
  let q = sb.from('listings')
  q = head
    ? q.select('id', { count: 'exact', head: true })
    : q.select('id,name,slug,vertical,source_id,suburb,region,state,lat,lng,website,closure_status,staleness_flags,community_reports,google_place_id')
        .order('closure_checked_at', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
  return q
    .eq('status', 'active')
    .or(`closure_checked_at.is.null,closure_checked_at.lt.${monthStartIso}`)
}

/**
 * Tier-1 probe + optional tier-2 Places check + verdict for one listing.
 * Never throws for per-listing problems; returns 'places_budget_exhausted'
 * when the paid tier was wanted but the monthly pool is dry.
 */
async function deepCheckListing(sb, listing, counts, runId) {
  let outcome = 'ok'
  const evidence = {
    community_reports: listing.community_reports || 0,
  }

  // ── Tier 1: free website probe + closure-phrase scan ──────────
  let websiteProbe = null
  let siteScan = null
  if (listing.website) {
    const probe = await probeWebsite(listing.website)
    websiteProbe = { classification: probe.classification }
    evidence.website = { classification: probe.classification, status_code: probe.statusCode || null }
    if (probe.text) {
      siteScan = scanSiteTextForClosure(probe.text)
      if (siteScan.permanent.length || siteScan.temporary.length) {
        evidence.site_snippets = siteScan
      }
    }
  }

  // ── Tier 2: Google Places, only when justified ────────────────
  let placesStatus = null
  let placesName = null
  const escalation = placesEscalationReason({
    website: listing.website,
    probeClassification: websiteProbe?.classification || null,
    siteScan,
    communityReports: listing.community_reports,
    closureStatus: listing.closure_status,
  })

  if (escalation) {
    counts.escalated++
    evidence.escalation = escalation
    try {
      const places = await resolvePlacesStatus(sb, listing, counts)
      if (places) {
        placesStatus = places.status
        placesName = places.name
        evidence.places = places.evidence

        // business_status's documented home (migration 060) — keep it current.
        if (placesStatus) {
          const flags = { ...(listing.staleness_flags || {}) }
          flags.google_status = placesStatus
          flags.google_status_at = new Date().toISOString()
          await sb.from('listings').update({ staleness_flags: flags }).eq('id', listing.id)
        }
      } else {
        evidence.places = { no_match: true }
      }
    } catch (e) {
      if (e?.code === 'PLACES_BUDGET_EXHAUSTED') {
        counts.places_deferred++
        evidence.places = { budget_exhausted: true }
        outcome = 'places_budget_exhausted'
      } else {
        counts.errors++
        evidence.places = { error: String(e?.message || e).slice(0, 120) }
      }
    }
  }

  // ── Verdict ───────────────────────────────────────────────────
  const verdict = classifyClosure({
    placesStatus,
    placesName,
    listingName: listing.name,
    websiteProbe,
    siteText: siteScan,
    currentClosureStatus: listing.closure_status,
  })

  if (verdict) {
    try {
      await recordSignal(sb, listing, verdict, evidence, counts, runId)
    } catch (e) {
      console.error(`[closure-sweep] signal write failed for "${listing.name}": ${e.message}`)
      counts.errors++
    }
  }
  return outcome
}

/**
 * Resolve the listing's Google Places business_status. Uses the cached
 * place_id when we have one (details only — half the cost), otherwise a
 * Text Search scored with nameSimilarity + a geographic sanity penalty,
 * mirroring the Gate Check website repair. Caches the place_id on a
 * confident match so next month's sweep skips the search.
 */
async function resolvePlacesStatus(sb, listing, counts) {
  if (listing.google_place_id) {
    const det = await getPlaceDetails(listing.google_place_id, PLACES_OPTS)
    counts.places_details++
    if (det?.business_status || det?.name) {
      return {
        status: det.business_status || null,
        name: det.name || null,
        evidence: {
          source: 'cached_place_id',
          place_id: listing.google_place_id,
          status: det.business_status || null,
          matched_name: det.name || null,
          name_similarity: det.name ? round2(nameSimilarity(listing.name, det.name)) : null,
        },
      }
    }
    // Stale cached id — fall through to a fresh search.
  }

  const lat = Number(listing.lat), lng = Number(listing.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  const locality = (listing.suburb || '').trim() || ((listing.region || '').split(',')[0] || '').trim()
  const query = `${listing.name} ${locality} ${listing.state || ''}`.replace(/\s+/g, ' ').trim()

  const results = await searchPlaces(query, hasCoords ? { lat, lng } : null, PLACES_OPTS)
  counts.places_searches++
  if (!results?.length) return null

  const scored = []
  for (const r of results) {
    if (!r.place_id) continue
    let score = nameSimilarity(listing.name, r.name || '')
    const rl = r.geometry?.location
    if (hasCoords && rl && Number.isFinite(rl.lat) && Number.isFinite(rl.lng)) {
      const km = haversineKm(lat, lng, rl.lat, rl.lng)
      if (km != null && km > 300) score -= 0.25
      else if (km != null && km > 100) score -= 0.1
    } else if (listing.state) {
      const rs = extractState(r.formatted_address || '')
      if (rs && rs !== listing.state) score -= 0.2
    }
    scored.push({ r, score })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  const det = await getPlaceDetails(best.r.place_id, PLACES_OPTS)
  counts.places_details++
  if (!det) return null

  const nameScore = round2(nameSimilarity(listing.name, det.name || best.r.name || ''))
  // Cache only a confident identity match — the cache is a cost shortcut,
  // never identity truth.
  if (nameScore >= NAME_MATCH_THRESHOLD) {
    await sb.from('listings').update({ google_place_id: best.r.place_id }).eq('id', listing.id)
  }

  return {
    status: det.business_status || null,
    name: det.name || best.r.name || null,
    evidence: {
      source: 'text_search',
      place_id: best.r.place_id,
      status: det.business_status || null,
      matched_name: det.name || best.r.name || null,
      name_similarity: nameScore,
    },
  }
}

/**
 * Upsert the verdict into closure_signals: refresh an existing open row,
 * respect the 90-day suppression on dismissed false positives, else insert.
 */
async function recordSignal(sb, listing, verdict, evidence, counts, runId) {
  const { data: openRow, error: openErr } = await sb
    .from('closure_signals')
    .select('id')
    .eq('listing_id', listing.id)
    .eq('status', 'open')
    .maybeSingle()
  if (openErr) throw new Error(openErr.message)

  const payload = {
    signal: verdict.signal,
    confidence: verdict.confidence,
    reasons: verdict.reasons,
    evidence,
    detected_at: new Date().toISOString(),
    agent_run_id: runId || null,
  }

  if (openRow) {
    const { error } = await sb.from('closure_signals').update(payload).eq('id', openRow.id)
    if (error) throw new Error(error.message)
    counts.signals_refreshed++
    return
  }

  const suppressAfter = new Date(Date.now() - DISMISSED_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: dismissed, error: disErr } = await sb
    .from('closure_signals')
    .select('id')
    .eq('listing_id', listing.id)
    .eq('signal', verdict.signal)
    .eq('status', 'dismissed')
    .gte('resolved_at', suppressAfter)
    .limit(1)
  if (disErr) throw new Error(disErr.message)
  if (dismissed?.length) {
    counts.suppressed_dismissed++
    return
  }

  const { error: insErr } = await sb.from('closure_signals').insert({ listing_id: listing.id, ...payload })
  if (insErr) throw new Error(insErr.message)
  counts.signals_created++
  if (verdict.signal === 'reopened') counts.reopened_flagged++
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildEmailHtml(monthKey, counts, remaining, sweepComplete, budgetExhausted) {
  const row = (label, value, color = '#1a1a1a') => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${label}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${color};">${value}</td>
    </tr>`
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Closure Sweep — ${monthKey}${sweepComplete ? ' (month complete)' : ''}</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${row('Listings deep-checked this run', counts.processed)}
        ${row('New closure signals', counts.signals_created, counts.signals_created > 0 ? '#dc2626' : '#16a34a')}
        ${row('Signals refreshed', counts.signals_refreshed)}
        ${row('Reopenings flagged', counts.reopened_flagged, counts.reopened_flagged > 0 ? '#16a34a' : '#666')}
        ${row('Still to check this month', remaining)}
        ${budgetExhausted ? row('Places budget', 'EXHAUSTED — raise AI_CAP_PLACES_CLOSURE_USD to deepen the sweep', '#f59e0b') : ''}
      </table>
      <div style="margin-top: 20px;">
        <a href="https://www.australianatlas.com.au/admin/closures" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Review closures
        </a>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by the Australian Atlas Closure Sweep. Nothing was hidden automatically — every signal awaits your decision.</p>
    </div>
  `.trim()
}
