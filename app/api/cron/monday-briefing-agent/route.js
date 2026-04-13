import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/monday-briefing-agent
 *
 * Monday Morning Briefing — aggregates all weekly signals into a single
 * AI-written email for Matt. Runs Monday 8am AEST (Sunday 22:00 UTC),
 * after the Staleness and Editorial Signals agents have completed.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 60

const AGENT_NAME = 'monday-briefing'

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  collection: 'Collection',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

export async function GET(request) {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const signals = {}
  const errors = []

  // ── 1. Network health ───────────────────────────────────
  try {
    // Active listings by vertical
    const { data: activeListings, error: err1 } = await sb
      .from('listings')
      .select('vertical')
      .eq('status', 'active')

    if (err1) throw err1

    const byVertical = {}
    for (const row of (activeListings || [])) {
      byVertical[row.vertical] = (byVertical[row.vertical] || 0) + 1
    }

    // New listings in last 7 days by vertical
    const { data: newListings, error: err2 } = await sb
      .from('listings')
      .select('vertical')
      .gte('created_at', sevenDaysAgo)

    if (err2) throw err2

    const newByVertical = {}
    for (const row of (newListings || [])) {
      newByVertical[row.vertical] = (newByVertical[row.vertical] || 0) + 1
    }

    // Count unverified
    const { count: unverifiedCount, error: err3 } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'unverified')

    if (err3) throw err3

    // Count low geocode confidence
    const { count: lowGeoCount, error: err4 } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('geocode_confidence', 'low')

    if (err4) throw err4

    signals.networkHealth = {
      activeByVertical: byVertical,
      totalActive: (activeListings || []).length,
      newByVertical,
      totalNew: (newListings || []).length,
      unverified: unverifiedCount || 0,
      lowGeocode: lowGeoCount || 0,
    }
  } catch (err) {
    console.error('[monday-briefing] Network health error:', err.message)
    errors.push(`Network health: ${err.message}`)
    signals.networkHealth = null
  }

  // ── 2. Editorial signals (from last agent run) ──────────
  try {
    const { data, error: err } = await sb
      .from('agent_runs')
      .select('summary, completed_at')
      .eq('agent', 'editorial-signals')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    if (err) throw err
    signals.editorialSignals = data?.summary || null
  } catch (err) {
    console.error('[monday-briefing] Editorial signals error:', err.message)
    errors.push(`Editorial signals: ${err.message}`)
    signals.editorialSignals = null
  }

  // ── 3. Staleness signals (from last agent run) ──────────
  try {
    const { data, error: err } = await sb
      .from('agent_runs')
      .select('summary, completed_at')
      .eq('agent', 'staleness')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    if (err) throw err
    signals.stalenessSignals = data?.summary || null
  } catch (err) {
    console.error('[monday-briefing] Staleness signals error:', err.message)
    errors.push(`Staleness signals: ${err.message}`)
    signals.stalenessSignals = null
  }

  // ── 4. Enrichment signals ───────────────────────────────
  try {
    const { count, error: err } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('enrichment_status', 'pending_review')

    if (err) throw err
    signals.enrichmentPendingReview = count || 0
  } catch (err) {
    console.error('[monday-briefing] Enrichment signals error:', err.message)
    errors.push(`Enrichment signals: ${err.message}`)
    signals.enrichmentPendingReview = null
  }

  // ── 5. Operator signals ─────────────────────────────────
  try {
    const { count: newClaims, error: err1 } = await sb
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)

    if (err1) throw err1

    const { count: claimedListings, error: err2 } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_claimed', true)

    if (err2) throw err2

    signals.operatorSignals = {
      newClaims: newClaims || 0,
      totalClaimed: claimedListings || 0,
    }
  } catch (err) {
    console.error('[monday-briefing] Operator signals error:', err.message)
    errors.push(`Operator signals: ${err.message}`)
    signals.operatorSignals = null
  }

  // ── 6. User signals ─────────────────────────────────────
  try {
    // Top 5 search queries (last 7 days)
    const { data: searchRows, error: err1 } = await sb
      .from('search_logs')
      .select('query_text, result_count')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (err1) throw err1

    // Aggregate in JS since Supabase JS doesn't support GROUP BY
    const queryCounts = {}
    let zeroResultCount = 0
    for (const row of (searchRows || [])) {
      const q = (row.query_text || '').toLowerCase().trim()
      if (!q) continue
      queryCounts[q] = (queryCounts[q] || 0) + 1
      if (row.result_count === 0) zeroResultCount++
    }

    const topSearches = Object.entries(queryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }))

    signals.userSignals = {
      topSearches,
      totalSearches: (searchRows || []).length,
      zeroResultSearches: zeroResultCount,
    }
  } catch (err) {
    console.error('[monday-briefing] User signals (search) error:', err.message)
    errors.push(`User signals (search): ${err.message}`)
    signals.userSignals = { topSearches: null, totalSearches: null, zeroResultSearches: null }
  }

  // Top 3 most trail-added listings
  try {
    const { data: recentStops, error: err } = await sb
      .from('trail_stops')
      .select('listing_id, venue_name, vertical')
      .gte('created_at', sevenDaysAgo)
      .not('listing_id', 'is', null)

    if (err) throw err

    const stopCounts = new Map()
    for (const stop of (recentStops || [])) {
      const existing = stopCounts.get(stop.listing_id)
      if (existing) {
        existing.count++
      } else {
        stopCounts.set(stop.listing_id, {
          listing_id: stop.listing_id,
          venue_name: stop.venue_name,
          vertical: stop.vertical,
          count: 1,
        })
      }
    }

    const topTrailAdds = Array.from(stopCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    if (!signals.userSignals) signals.userSignals = {}
    signals.userSignals.topTrailAdds = topTrailAdds
  } catch (err) {
    console.error('[monday-briefing] User signals (trails) error:', err.message)
    errors.push(`User signals (trails): ${err.message}`)
    if (!signals.userSignals) signals.userSignals = {}
    signals.userSignals.topTrailAdds = null
  }

  // ── 7. Revenue signals ──────────────────────────────────
  try {
    const { data, error: err } = await sb
      .from('revenue_snapshots')
      .select('id, snapshot_date, active_subscribers, arr, new_this_week, churned_this_week, expiring_30_days, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (err) throw err
    signals.revenueSnapshot = data || null
  } catch (err) {
    // Table may not exist yet — graceful skip
    console.log('[monday-briefing] Revenue signals unavailable:', err.message)
    signals.revenueSnapshot = null
  }

  // ── Call Claude for briefing ────────────────────────────
  const totalActive = signals.networkHealth?.totalActive || 0
  let briefingHtml = ''

  try {
    const prompt = `You are the editorial intelligence layer for Australian Atlas, a curated guide to independent Australian places. Based on the weekly signals below, write a Monday morning briefing for Matt, the founder. Voice: direct, warm, non-corporate. Structure: five sections — Network, Editorial, Operators, Users, This Week's Priority. The final section identifies the single most impactful action Matt could take this week. Be specific — not "focus on growth" but "There are 4 high quality-score listings in the Mornington Peninsula that are unclaimed. Tuesday morning outreach window." Data: ${JSON.stringify(signals)}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errText}`)
    }

    const json = await res.json()
    const briefingText = json.content?.[0]?.text || ''
    briefingHtml = formatBriefingToHtml(briefingText)
  } catch (err) {
    console.error('[monday-briefing] Claude API error:', err.message)
    errors.push(`Claude briefing: ${err.message}`)
    briefingHtml = `<p style="color: #ef4444;">AI briefing generation failed: ${esc(err.message)}</p>`
  }

  // ── Build and send email ────────────────────────────────
  const dateLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const subject = `Good morning, Matt — Atlas briefing for ${dateLabel}`
  const html = buildEmailHtml({ briefingHtml, signals, errors, totalActive, dateLabel })

  await sendAgentEmail({ subject, html })

  // ── Complete run ────────────────────────────────────────
  const summary = {
    totalActive,
    totalNew: signals.networkHealth?.totalNew || 0,
    unverified: signals.networkHealth?.unverified || 0,
    enrichmentPending: signals.enrichmentPendingReview || 0,
    newClaims: signals.operatorSignals?.newClaims || 0,
    totalSearches: signals.userSignals?.totalSearches || 0,
    errors: errors.length,
  }

  await completeRun(runId, {
    status: errors.length > 0 ? 'partial' : 'success',
    summary,
    error: errors.length > 0 ? errors.join('; ') : null,
  })

  return NextResponse.json({ success: true, summary })
}

// ─── Format Claude's text response into styled HTML ────────────

function formatBriefingToHtml(text) {
  if (!text) return ''

  // Split into lines and process
  const lines = text.split('\n')
  const htmlLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      htmlLines.push('<br>')
      continue
    }

    // Section headers (## or **Header**)
    if (trimmed.startsWith('## ')) {
      const title = trimmed.replace(/^##\s*/, '')
      htmlLines.push(`<h3 style="font-size: 16px; font-weight: 600; color: #2d2a24; margin: 24px 0 8px; border-bottom: 1px solid #e5e0d5; padding-bottom: 6px;">${esc(title)}</h3>`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      const title = trimmed.replace(/^#\s*/, '')
      htmlLines.push(`<h2 style="font-size: 18px; font-weight: 700; color: #2d2a24; margin: 20px 0 8px;">${esc(title)}</h2>`)
      continue
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const content = trimmed.replace(/^[-•]\s*/, '')
      htmlLines.push(`<div style="padding: 3px 0 3px 16px; font-size: 14px; color: #374151; line-height: 1.6;">&bull; ${inlineFormat(content)}</div>`)
      continue
    }

    // Regular paragraph
    htmlLines.push(`<p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 6px 0;">${inlineFormat(trimmed)}</p>`)
  }

  return htmlLines.join('\n')
}

/** Convert **bold** and *italic* inline markdown to HTML */
function inlineFormat(text) {
  let out = esc(text)
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight: 600; color: #1a1a1a;">$1</strong>')
  // Italic
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>')
  return out
}

// ─── Email builder ─────────────────────────────────────────

function buildEmailHtml({ briefingHtml, signals, errors, totalActive, dateLabel }) {
  const sections = []

  // Header
  sections.push(`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #2d2a24; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #d4a843; margin: 0; font-size: 22px; font-weight: 600;">Monday Morning Briefing</h1>
      <p style="color: #a89a7e; margin: 4px 0 0; font-size: 13px;">Australian Atlas &middot; ${esc(dateLabel)}</p>
    </div>
    <div style="padding: 24px 32px; border: 1px solid #e5e0d5; border-top: none;">
  `)

  // AI briefing
  sections.push(`
    <div style="margin-bottom: 24px;">
      ${briefingHtml}
    </div>
  `)

  // Divider before raw data
  sections.push(`
    <hr style="border: none; border-top: 2px solid #e5e0d5; margin: 28px 0;">
    <h2 style="font-size: 14px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 16px;">Signal Data</h2>
  `)

  // Network health summary
  sections.push(renderNetworkHealth(signals.networkHealth))

  // Staleness summary
  sections.push(renderAgentSummary('Staleness', signals.stalenessSignals, '/admin/staleness'))

  // Editorial signals summary
  sections.push(renderAgentSummary('Editorial Signals', signals.editorialSignals, '/admin/agents'))

  // Enrichment
  sections.push(renderEnrichment(signals.enrichmentPendingReview))

  // Operator signals
  sections.push(renderOperatorSignals(signals.operatorSignals))

  // User signals
  sections.push(renderUserSignals(signals.userSignals))

  // Revenue
  sections.push(renderRevenue(signals.revenueSnapshot))

  // Errors
  if (errors.length > 0) {
    sections.push(`
      <div style="margin-top: 24px; padding: 12px 16px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b; font-size: 13px;">Data issues (${errors.length})</p>
        <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 12px;">
          ${errors.map(e => `<li>${esc(e)}</li>`).join('')}
        </ul>
      </div>
    `)
  }

  // Admin links
  sections.push(`
    <div style="margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap;">
      <a href="https://australianatlas.com.au/admin/agents" style="display: inline-block; padding: 8px 16px; background: #2d2a24; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Agent Runs</a>
      <a href="https://australianatlas.com.au/admin/enrichment-review" style="display: inline-block; padding: 8px 16px; background: #2d2a24; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Enrichment Review</a>
      <a href="https://australianatlas.com.au/admin/staleness" style="display: inline-block; padding: 8px 16px; background: #2d2a24; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Staleness</a>
    </div>
  `)

  // Footer
  sections.push(`
      <hr style="border: none; border-top: 1px solid #e5e0d5; margin: 28px 0 16px;">
      <p style="color: #6b7280; font-size: 13px; margin: 0;">
        Total listings: <strong>${totalActive.toLocaleString()}</strong> across nine atlases. Have a good week.
      </p>
      <p style="color: #c4bfb4; font-size: 11px; margin: 8px 0 0;">
        Sent by the Monday Briefing Agent &middot; Australian Atlas
      </p>
    </div></div>
  `)

  return sections.join('')
}

// ─── Section renderers ─────────────────────────────────────

function renderNetworkHealth(data) {
  if (!data) return renderUnavailable('Network Health')

  let verticalRows = ''
  const verticals = Object.keys(VERTICAL_LABELS)
  for (const v of verticals) {
    const active = data.activeByVertical[v] || 0
    const added = data.newByVertical[v] || 0
    if (active === 0 && added === 0) continue
    verticalRows += `
      <tr>
        <td style="padding: 4px 8px; font-size: 13px;">${esc(VERTICAL_LABELS[v])}</td>
        <td style="padding: 4px 8px; font-size: 13px; text-align: right; font-weight: 600;">${active.toLocaleString()}</td>
        <td style="padding: 4px 8px; font-size: 13px; text-align: right; color: ${added > 0 ? '#16a34a' : '#9ca3af'};">${added > 0 ? `+${added}` : '—'}</td>
      </tr>
    `
  }

  return `
    ${sectionHeader('Network Health')}
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
      <thead>
        <tr style="border-bottom: 1px solid #e5e0d5;">
          <th style="padding: 4px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
          <th style="padding: 4px 8px; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Active</th>
          <th style="padding: 4px 8px; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Added (7d)</th>
        </tr>
      </thead>
      <tbody>${verticalRows}</tbody>
      <tfoot>
        <tr style="border-top: 1px solid #e5e0d5;">
          <td style="padding: 6px 8px; font-size: 13px; font-weight: 600;">Total</td>
          <td style="padding: 6px 8px; font-size: 13px; text-align: right; font-weight: 600;">${data.totalActive.toLocaleString()}</td>
          <td style="padding: 6px 8px; font-size: 13px; text-align: right; font-weight: 600; color: ${data.totalNew > 0 ? '#16a34a' : '#9ca3af'};">${data.totalNew > 0 ? `+${data.totalNew}` : '—'}</td>
        </tr>
      </tfoot>
    </table>
    <div style="display: flex; gap: 12px; margin-top: 8px;">
      <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: 700; color: ${data.unverified > 0 ? '#f59e0b' : '#2d2a24'};">${data.unverified.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Unverified</div>
      </div>
      <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: 700; color: ${data.lowGeocode > 0 ? '#f59e0b' : '#2d2a24'};">${data.lowGeocode.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Low geocode</div>
      </div>
    </div>
  `
}

function renderAgentSummary(title, summary, adminPath) {
  if (!summary) return renderUnavailable(title)

  const entries = Object.entries(summary)
  if (entries.length === 0) return renderUnavailable(title)

  let rows = ''
  for (const [key, value] of entries) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    rows += `
      <tr>
        <td style="padding: 3px 8px; font-size: 13px; color: #6b7280;">${esc(label)}</td>
        <td style="padding: 3px 8px; font-size: 13px; text-align: right; font-weight: 600;">${typeof value === 'number' ? value.toLocaleString() : esc(String(value))}</td>
      </tr>
    `
  }

  return `
    ${sectionHeader(title)}
    <table style="width: 100%; border-collapse: collapse;">${rows}</table>
    <div style="margin-top: 6px;">
      <a href="https://australianatlas.com.au${adminPath}" style="font-size: 12px; color: #b8862b; text-decoration: none;">View details &rarr;</a>
    </div>
  `
}

function renderEnrichment(count) {
  if (count === null || count === undefined) return renderUnavailable('Enrichment')

  return `
    ${sectionHeader('Enrichment')}
    <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; display: inline-block;">
      <span style="font-size: 20px; font-weight: 700; color: ${count > 0 ? '#f59e0b' : '#2d2a24'};">${count.toLocaleString()}</span>
      <span style="font-size: 13px; color: #6b7280; margin-left: 8px;">listings pending review</span>
    </div>
    ${count > 0 ? `<div style="margin-top: 6px;"><a href="https://australianatlas.com.au/admin/enrichment-review" style="font-size: 12px; color: #b8862b; text-decoration: none;">Review now &rarr;</a></div>` : ''}
  `
}

function renderOperatorSignals(data) {
  if (!data) return renderUnavailable('Operator Signals')

  return `
    ${sectionHeader('Operator Signals')}
    <div style="display: flex; gap: 12px;">
      <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: 700; color: ${data.newClaims > 0 ? '#16a34a' : '#2d2a24'};">${data.newClaims.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">New claims (7d)</div>
      </div>
      <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: 700; color: #2d2a24;">${data.totalClaimed.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Total claimed</div>
      </div>
    </div>
  `
}

function renderUserSignals(data) {
  if (!data) return renderUnavailable('User Signals')

  let html = sectionHeader('User Signals')

  // Search stats
  if (data.totalSearches != null) {
    html += `
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #2d2a24;">${data.totalSearches.toLocaleString()}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Searches (7d)</div>
        </div>
        <div style="background: #f9fafb; border-radius: 6px; padding: 10px 16px; flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: ${data.zeroResultSearches > 0 ? '#ef4444' : '#2d2a24'};">${(data.zeroResultSearches || 0).toLocaleString()}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Zero results</div>
        </div>
      </div>
    `
  }

  // Top searches
  if (data.topSearches && data.topSearches.length > 0) {
    let rows = ''
    for (const s of data.topSearches) {
      rows += `
        <tr>
          <td style="padding: 3px 8px; font-size: 13px;">${esc(s.query)}</td>
          <td style="padding: 3px 8px; font-size: 13px; text-align: right; font-weight: 600;">${s.count}</td>
        </tr>
      `
    }
    html += `
      <p style="font-size: 12px; color: #9ca3af; margin: 0 0 4px; font-weight: 500;">Top searches</p>
      <table style="width: 100%; border-collapse: collapse;">${rows}</table>
    `
  }

  // Top trail adds
  if (data.topTrailAdds && data.topTrailAdds.length > 0) {
    let rows = ''
    for (const t of data.topTrailAdds) {
      rows += `
        <tr>
          <td style="padding: 3px 8px; font-size: 13px;">${esc(t.venue_name || t.listing_id)}</td>
          <td style="padding: 3px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[t.vertical] || t.vertical || '')}</td>
          <td style="padding: 3px 8px; font-size: 13px; text-align: right; font-weight: 600;">${t.count}</td>
        </tr>
      `
    }
    html += `
      <p style="font-size: 12px; color: #9ca3af; margin: 16px 0 4px; font-weight: 500;">Most added to trails</p>
      <table style="width: 100%; border-collapse: collapse;">${rows}</table>
    `
  }

  return html
}

function renderRevenue(snapshot) {
  if (!snapshot) return '' // Silently skip if no data — table may not exist yet

  const entries = Object.entries(snapshot).filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
  if (entries.length === 0) return ''

  let rows = ''
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    rows += `
      <tr>
        <td style="padding: 3px 8px; font-size: 13px; color: #6b7280;">${esc(label)}</td>
        <td style="padding: 3px 8px; font-size: 13px; text-align: right; font-weight: 600;">${typeof value === 'number' ? value.toLocaleString() : esc(String(value))}</td>
      </tr>
    `
  }

  return `
    ${sectionHeader('Revenue')}
    <table style="width: 100%; border-collapse: collapse;">${rows}</table>
  `
}

function sectionHeader(title) {
  return `
    <div style="margin-top: 20px; margin-bottom: 8px;">
      <h3 style="font-size: 14px; font-weight: 600; color: #2d2a24; margin: 0;">${esc(title)}</h3>
    </div>
  `
}

function renderUnavailable(title) {
  return `
    ${sectionHeader(title)}
    <p style="font-size: 13px; color: #9ca3af; font-style: italic;">Data unavailable</p>
  `
}

// ─── Utilities ─────────────────────────────────────────────

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
