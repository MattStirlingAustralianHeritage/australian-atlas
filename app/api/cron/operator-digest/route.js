import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { readGalleryEntries } from '@/lib/listing-gallery'
import { reserveAnthropicBudget, reconcileAnthropicBudget } from '@/lib/ai/guardedAnthropic'
import { estimateTokens } from '@/lib/budget/governor'
import { buildOperatorDigestEmail, buildOperatorDigestSummaryHtml, esc } from '@/lib/email/operatorDigest'

/**
 * GET /api/cron/operator-digest
 *
 * "Your Atlas Week" — weekly digest email for every PAID operator (an active
 * or past_due `standard` claim in listing_claims). Runs Monday 8am AEST
 * (Sunday 22:00 UTC), alongside the Monday briefing.
 *
 * Per listing it computes the last 7 days (with the prior 7 for deltas):
 *   - human page views + unique visitors for the portal place page
 *     (pageviews, bot-filtered — same source as /api/dashboard/stats)
 *   - search appearances (listing_search_appearances)
 *   - saves (user_saves)
 *   - AI fetches (site_crawler_hits), split live-conversation fetchers
 *     (ChatGPT-User, Claude-User, Perplexity-User) vs index/training
 *     crawlers (GPTBot, ClaudeBot, PerplexityBot, others) — same split
 *     as /api/dashboard/ai-visibility
 *   - upcoming publicly-visible events hosted by the listing
 *
 * One "suggested action" line is chosen RULE-BASED (no AI): missing
 * highlights → highlights; missing keywords → keywords; empty gallery →
 * photos; stale highlights (>90d) → refresh; else a rotating generic tip
 * keyed on the week number so consecutive weeks differ. No invented facts.
 *
 * The one-sentence opener is OPTIONALLY composed by Haiku behind the budget
 * governor, grounded ONLY in the computed numbers; on budget/error it falls
 * back to a deterministic line.
 *
 * Idempotency: operator_digest_sends (migration 204) is unique on
 * (listing_id, week_start); the audit row is inserted BEFORE sending, so
 * re-runs and races skip instead of double-emailing an operator.
 *
 * Query params:
 *   ?dryRun=1          compute + return JSON; nothing is recorded and the
 *                      only mail sent goes to Matt (one sample digest + the
 *                      summary)
 *   ?listingId=<uuid>  restrict to a single listing
 *
 * REPORTING ONLY — nothing here reads into or influences search/map/discover
 * ranking or any visitor-facing ordering.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const AGENT_NAME = 'operator-digest'
const MATT_EMAIL = 'matt@australianatlas.com.au'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

const DAY_MS = 24 * 60 * 60 * 1000
const AEST_MS = 10 * 60 * 60 * 1000 // idempotency-week boundary; DST-agnostic
const ROW_CAP = 10000

// Live-conversation fetchers — an assistant pulled the page DURING a real user
// conversation. Everything else logged in site_crawler_hits counts as an
// index/training crawler. Mirrors /api/dashboard/ai-visibility.
const LIVE_BOTS = new Set(['ChatGPT-User', 'Claude-User', 'Perplexity-User'])
const NAMED_CRAWLERS = new Set(['GPTBot', 'ClaudeBot', 'PerplexityBot'])

// Same slug discipline as /api/dashboard/stats — kebab-case covers every real
// slug, and a conforming slug can't break the ilike pattern or the boundary
// regex below.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

// Generic tips for operators whose profile is already in good shape. These
// state no facts about the venue — pure suggestions — and rotate on the week
// number so consecutive weeks differ.
const ROTATING_TIPS = [
  'Add an upcoming event from your dashboard — events appear on your page and in the network events calendar.',
  'Give your description a two-minute read — details like hours and offerings drift more than anyone admits.',
  'Check your photo gallery leads with your strongest image — it is the first thing visitors see.',
  'If you are hiring, switch the hiring signal on in Highlights — it shows on your page while the role is open.',
  'Review your search keywords — the terms visitors actually type are often plainer than you would guess.',
]

export async function GET(request) {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'
  const onlyListingId = searchParams.get('listingId')

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()

  const nowMs = Date.now()
  const weekStart = aestWeekStart(nowMs)
  const weekLabel = `${fmtAestDate(nowMs - 7 * DAY_MS)} – ${fmtAestDate(nowMs)}`

  const results = [] // { listingId, venueName, sentTo, status, detail, action, metrics }
  const errors = []
  let budgetReached = false

  try {
    // ── 1. Every active PAID claim (active preferred over past_due) ──
    let claimsQuery = sb
      .from('listing_claims')
      .select('id, listing_id, claimant_email, tier, status')
      .eq('tier', 'standard')
      .in('status', ['active', 'past_due'])
      .order('status', { ascending: true }) // 'active' sorts before 'past_due'
    if (onlyListingId) claimsQuery = claimsQuery.eq('listing_id', onlyListingId)

    const { data: claims, error: claimsErr } = await claimsQuery
    if (claimsErr) throw claimsErr

    const claimByListing = new Map()
    for (const c of claims || []) {
      if (c.listing_id && !claimByListing.has(c.listing_id)) claimByListing.set(c.listing_id, c)
    }

    if (claimByListing.size === 0) {
      await completeRun(runId, {
        status: 'success',
        summary: { week_start: weekStart, paid_claims: 0, sent: 0, skipped: 0, failed: 0, dry_run: dryRun },
      })
      return NextResponse.json({ success: true, dryRun, weekStart, summary: { paid_claims: 0 }, results: [] })
    }

    const listingIds = [...claimByListing.keys()]

    // ── 2. Joined listings ───────────────────────────────────
    const { data: listings, error: listingsErr } = await sb
      .from('listings')
      .select('id, name, slug, vertical, operator_highlights, search_keywords')
      .in('id', listingIds)
    if (listingsErr) throw listingsErr
    const listingById = new Map((listings || []).map(l => [l.id, l]))

    // ── 3. Idempotency — skip already-sent listing/week pairs ─
    const { data: sentRows, error: sentErr } = await sb
      .from('operator_digest_sends')
      .select('listing_id')
      .eq('week_start', weekStart)
      .in('listing_id', listingIds)
    if (sentErr) throw sentErr
    const alreadySent = new Set((sentRows || []).map(r => r.listing_id))

    // ── 4. Per-listing digest ────────────────────────────────
    let dryRunSampleSent = false

    for (const listingId of listingIds) {
      const claim = claimByListing.get(listingId)
      const listing = listingById.get(listingId)

      if (!listing) {
        results.push({ listingId, venueName: '(listing missing)', sentTo: null, status: 'skipped', detail: 'claim has no matching listings row' })
        continue
      }
      if (alreadySent.has(listingId)) {
        results.push({ listingId, venueName: listing.name, sentTo: null, status: 'skipped', detail: 'already sent this week' })
        continue
      }
      if (!claim.claimant_email) {
        results.push({ listingId, venueName: listing.name, sentTo: null, status: 'skipped', detail: 'claim has no claimant_email' })
        continue
      }

      try {
        const metrics = await computeListingMetrics(sb, listing, nowMs)
        const action = await chooseSuggestedAction(sb, listing, weekStart, nowMs)

        // Optional Haiku opener — behind the budget governor, grounded ONLY
        // in the computed numbers. Skipped in dry runs (no spend) and once
        // the monthly cap is reached; the template's deterministic line is
        // the fallback either way.
        let introText = null
        if (!dryRun && !budgetReached && process.env.ANTHROPIC_API_KEY) {
          const composed = await composeIntro(listing.name, metrics)
          if (composed.budgetReached) budgetReached = true
          introText = composed.text
        }

        const email = buildOperatorDigestEmail({
          venueName: listing.name,
          weekLabel,
          metrics,
          actionText: action,
          introText,
        })

        const base = {
          listingId,
          venueName: listing.name,
          action,
          metrics,
        }

        if (dryRun) {
          // Dry run: nothing recorded, operators get nothing. One sample
          // digest goes to Matt so the rendered email can be eyeballed.
          let sentTo = null
          if (!dryRunSampleSent) {
            const ok = await sendResendEmail({
              from: email.from,
              replyTo: email.replyTo,
              to: MATT_EMAIL,
              subject: `[DRY RUN] ${email.subject}`,
              html: email.html,
            })
            if (ok) {
              sentTo = MATT_EMAIL
              dryRunSampleSent = true
            }
          }
          results.push({ ...base, sentTo, status: sentTo ? 'sent' : 'previewed', detail: sentTo ? 'dry-run sample to Matt' : 'dry run — not sent' })
          continue
        }

        // Claim the (listing, week) slot BEFORE sending: a unique-violation
        // means another run got here first, so we skip rather than risk
        // double-emailing the operator. If the send below then fails, the
        // row stands (no retry-spam) and the failure is surfaced to Matt.
        const { error: insErr } = await sb.from('operator_digest_sends').insert({
          listing_id: listingId,
          claim_id: claim.id,
          week_start: weekStart,
          sent_to: claim.claimant_email,
          metrics: { ...metrics, week_label: weekLabel, suggested_action: action, intro: introText ? 'ai' : 'fallback' },
        })
        if (insErr) {
          if (insErr.code === '23505') {
            results.push({ ...base, sentTo: null, status: 'skipped', detail: 'already sent this week (concurrent run)' })
            continue
          }
          throw insErr
        }

        try {
          const ok = await sendResendEmail({
            from: email.from,
            replyTo: email.replyTo,
            to: claim.claimant_email,
            subject: email.subject,
            html: email.html,
          })
          results.push({
            ...base,
            sentTo: claim.claimant_email,
            status: ok ? 'sent' : 'failed',
            detail: ok ? null : 'RESEND_API_KEY not set — audit row recorded, email not sent',
          })
        } catch (sendErr) {
          errors.push(`${listing.name}: send failed: ${sendErr.message}`)
          results.push({ ...base, sentTo: claim.claimant_email, status: 'failed', detail: `audit row recorded; send failed: ${sendErr.message}` })
        }
      } catch (err) {
        console.error(`[operator-digest] ${listing.name} (${listingId}):`, err.message)
        errors.push(`${listing.name}: ${err.message}`)
        results.push({ listingId, venueName: listing.name, sentTo: null, status: 'failed', detail: err.message })
      }
    }

    // ── 5. Summary email to Matt — who got what ──────────────
    const summaryRows = results.map(r => ({
      venueName: r.venueName,
      sentTo: r.sentTo,
      status: r.status,
      views: r.metrics?.views?.current ?? 0,
      liveAi: r.metrics?.ai?.live?.current ?? 0,
      crawlAi: r.metrics?.ai?.crawl?.current ?? 0,
      action: r.action,
      detail: r.detail,
    }))
    await sendAgentEmail({
      subject: `Operator Digest${dryRun ? ' (dry run)' : ''} — week of ${weekStart}: ${results.filter(r => r.status === 'sent').length} sent`,
      html: buildOperatorDigestSummaryHtml({ weekStart, weekLabel, dryRun, results: summaryRows }),
    })

    // ── 6. Complete run ──────────────────────────────────────
    const summary = {
      week_start: weekStart,
      paid_claims: claimByListing.size,
      sent: results.filter(r => r.status === 'sent').length,
      previewed: results.filter(r => r.status === 'previewed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      dry_run: dryRun,
      errors: errors.length,
    }
    await completeRun(runId, {
      status: errors.length > 0 ? 'partial' : 'success',
      summary,
      error: errors.length > 0 ? errors.join('; ') : null,
    })

    return NextResponse.json({
      success: true,
      dryRun,
      weekStart,
      summary,
      results: results.map(({ listingId, venueName, sentTo, status, detail, action, metrics }) => ({
        listingId, venueName, sentTo, status, detail, action, metrics,
      })),
    })
  } catch (err) {
    console.error('[operator-digest] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: 'Operator digest failed', detail: err.message }, { status: 500 })
  }
}

// ─── Metrics ───────────────────────────────────────────────

// Last 7 days + prior 7 for deltas. Sources and filters mirror the operator
// dashboard so the digest never disagrees with what the operator sees there.
async function computeListingMetrics(sb, listing, nowMs) {
  const sevenAgoMs = nowMs - 7 * DAY_MS
  const fourteenAgoMs = nowMs - 14 * DAY_MS
  const sevenAgoIso = new Date(sevenAgoMs).toISOString()
  const fourteenAgoIso = new Date(fourteenAgoMs).toISOString()

  const metrics = {
    views: { current: 0, previous: 0 },
    unique_visitors: { current: 0, previous: 0 },
    search_appearances: { current: 0, previous: 0 },
    saves: { current: 0, previous: 0 },
    ai: {
      live: { current: 0, previous: 0 },
      crawl: { current: 0, previous: 0 },
      crawlers_7d: { GPTBot: 0, ClaudeBot: 0, PerplexityBot: 0, others: 0 },
    },
    upcoming_events: 0,
  }

  // A listing without a well-formed slug has no /place page to match — its
  // pageview/AI numbers stay zero rather than risking a malformed filter.
  const slugOk = !!(listing.slug && SAFE_SLUG.test(listing.slug))
  // The ilike is a coarse match — '%/place/foo%' also catches /place/foo-bar.
  // Only count paths where the slug ends at a boundary.
  const exact = slugOk ? new RegExp(`/place/${listing.slug}(?:[/?#]|$)`, 'i') : null

  const [pvRes, hitRes, sa7, saPrev, sv7, svPrev, evRes] = await Promise.all([
    slugOk
      ? sb.from('pageviews')
          .select('ts, visitor_id, path')
          .ilike('path', `%/place/${listing.slug}%`)
          .not('is_bot', 'is', true)
          .gte('ts', fourteenAgoIso)
          .order('ts', { ascending: false })
          .limit(ROW_CAP)
      : Promise.resolve({ data: [], error: null }),
    slugOk
      ? sb.from('site_crawler_hits')
          .select('bot_name, path, fetched_at')
          .ilike('path', `%/place/${listing.slug}%`)
          .gte('fetched_at', fourteenAgoIso)
          .order('fetched_at', { ascending: false })
          .limit(ROW_CAP)
      : Promise.resolve({ data: [], error: null }),
    sb.from('listing_search_appearances')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .gte('appeared_at', sevenAgoIso),
    sb.from('listing_search_appearances')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .gte('appeared_at', fourteenAgoIso)
      .lt('appeared_at', sevenAgoIso),
    sb.from('user_saves')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .gte('saved_at', sevenAgoIso),
    sb.from('user_saves')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .gte('saved_at', fourteenAgoIso)
      .lt('saved_at', sevenAgoIso),
    // Publicly visible upcoming events hosted by the listing — same rule as
    // migration 158: published IS NOT FALSE AND status = 'approved'.
    sb.from('events')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing.id)
      .eq('status', 'approved')
      .not('published', 'is', false)
      .gte('start_date', aestDateString(nowMs)),
  ])

  for (const r of [pvRes, hitRes, sa7, saPrev, sv7, svPrev, evRes]) {
    if (r.error) throw r.error
  }

  const uniqCur = new Set()
  const uniqPrev = new Set()
  for (const row of pvRes.data || []) {
    if (exact && !exact.test(row.path || '')) continue
    const t = Date.parse(row.ts)
    if (!Number.isFinite(t) || t < fourteenAgoMs) continue
    if (t >= sevenAgoMs) {
      metrics.views.current += 1
      if (row.visitor_id) uniqCur.add(row.visitor_id)
    } else {
      metrics.views.previous += 1
      if (row.visitor_id) uniqPrev.add(row.visitor_id)
    }
  }
  metrics.unique_visitors.current = uniqCur.size
  metrics.unique_visitors.previous = uniqPrev.size

  for (const row of hitRes.data || []) {
    if (exact && !exact.test(row.path || '')) continue
    if (!row.bot_name) continue
    const t = Date.parse(row.fetched_at)
    if (!Number.isFinite(t) || t < fourteenAgoMs) continue
    const bucket = LIVE_BOTS.has(row.bot_name) ? metrics.ai.live : metrics.ai.crawl
    if (t >= sevenAgoMs) {
      bucket.current += 1
      if (!LIVE_BOTS.has(row.bot_name)) {
        const key = NAMED_CRAWLERS.has(row.bot_name) ? row.bot_name : 'others'
        metrics.ai.crawlers_7d[key] += 1
      }
    } else {
      bucket.previous += 1
    }
  }

  metrics.search_appearances = { current: sa7.count || 0, previous: saPrev.count || 0 }
  metrics.saves = { current: sv7.count || 0, previous: svPrev.count || 0 }
  metrics.upcoming_events = evRes.count || 0

  return metrics
}

// ─── Suggested action (rule-based, no AI) ──────────────────

async function chooseSuggestedAction(sb, listing, weekStart, nowMs) {
  const h = listing.operator_highlights
  const fieldValues = h?.fields && typeof h.fields === 'object' ? Object.values(h.fields) : []
  const hasFieldValue = fieldValues.some(v =>
    Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''
  )
  const hasHighlights = !!(h && (hasFieldValue || h.hiring?.open || (h.hiring?.note || '').trim()))

  if (!hasHighlights) {
    return 'Set a "right now" highlight from your dashboard — what is on this month. It appears on your page and feeds search.'
  }

  const keywords = Array.isArray(listing.search_keywords) ? listing.search_keywords : []
  if (keywords.length === 0) {
    return 'Add search keywords from your dashboard — up to 15 plain terms visitors might type that your description does not already say.'
  }

  // readGalleryEntries returns [] on any read problem, which safely lands on
  // the photos suggestion rather than throwing the whole digest.
  const gallery = await readGalleryEntries(sb, listing.id)
  if (gallery.length === 0) {
    return 'Add photos to your gallery — pages with photography hold visitors longer.'
  }

  const updatedMs = Date.parse(h?.updated_at || '')
  if (Number.isFinite(updatedMs) && nowMs - updatedMs > 90 * DAY_MS) {
    const days = Math.floor((nowMs - updatedMs) / DAY_MS)
    return `Your highlights were last updated ${days} days ago — refresh them so "right now" stays true.`
  }

  return ROTATING_TIPS[weekIndex(weekStart) % ROTATING_TIPS.length]
}

// ─── Optional AI opener (budget-governed, grounded) ────────

// One warm opening sentence composed by Haiku from ONLY the computed numbers.
// Returns { text: string|null, budgetReached: boolean } — text is null on any
// budget/API/sanity failure and the caller falls back to the deterministic
// template line.
async function composeIntro(venueName, metrics) {
  const data = {
    page_views_last_7_days: metrics.views.current,
    page_views_prior_7_days: metrics.views.previous,
    unique_visitors_last_7_days: metrics.unique_visitors.current,
    search_appearances_last_7_days: metrics.search_appearances.current,
    saves_last_7_days: metrics.saves.current,
    live_ai_conversation_fetches_last_7_days: metrics.ai.live.current,
    ai_crawler_fetches_last_7_days: metrics.ai.crawl.current,
    upcoming_events: metrics.upcoming_events,
  }
  const prompt = `You write the opening line of a weekly performance email to the owner of "${venueName}", a venue listed on Australian Atlas. Write ONE sentence, maximum 28 words. Tone: plain, warm, factual — no hype, no exclamation marks, no advice. Ground it ONLY in the numbers below; do not invent, estimate, or mention anything not present in the data. Reply with the sentence only, no quotes. Data: ${JSON.stringify(data)}`

  try {
    const resv = await reserveAnthropicBudget({
      model: HAIKU_MODEL,
      inputTokens: estimateTokens(prompt),
      maxOutputTokens: 120,
    })
    if (!resv.ok) {
      console.warn('[operator-digest] anthropic monthly budget reached — deterministic intros from here')
      return { text: null, budgetReached: true }
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errText}`)
    }
    const json = await res.json()
    await reconcileAnthropicBudget(resv, json.usage)

    const text = (json.content?.[0]?.text || '').trim().replace(/\s+/g, ' ')
    // Sanity: one short plain sentence or we fall back.
    if (!text || text.length > 240) return { text: null, budgetReached: false }
    return { text: esc(text), budgetReached: false }
  } catch (err) {
    console.warn('[operator-digest] intro composition failed — using fallback:', err.message)
    return { text: null, budgetReached: false }
  }
}

// ─── Email transport ───────────────────────────────────────

// Send one digest via Resend. Graceful no-op (returns false) when
// RESEND_API_KEY is missing — same degradation as lib/agents/email.js.
// Throws on an actual send failure so the caller can record it.
async function sendResendEmail({ from, replyTo, to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[operator-digest] RESEND_API_KEY not set — skipping email to ${to}`)
    return false
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from, replyTo, to, subject, html })
  if (error) throw new Error(error.message || 'Resend send failed')
  return true
}

// ─── Date helpers ──────────────────────────────────────────

// YYYY-MM-DD in AEST (UTC+10, DST-agnostic — used only as a day boundary).
function aestDateString(ms) {
  return new Date(ms + AEST_MS).toISOString().slice(0, 10)
}

// Monday of the current AEST week — the idempotency key. The cron fires
// Monday 08:00 AEST, so this is normally "today"; manual re-runs later in
// the week resolve to the same Monday and are skipped.
function aestWeekStart(ms) {
  const d = new Date(ms + AEST_MS)
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d.toISOString().slice(0, 10)
}

// Absolute week index since epoch — drives the rotating tip so consecutive
// weeks pick different entries.
function weekIndex(weekStartStr) {
  return Math.floor(Date.parse(`${weekStartStr}T00:00:00Z`) / (7 * DAY_MS))
}

function fmtAestDate(ms) {
  return new Date(ms).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  })
}
