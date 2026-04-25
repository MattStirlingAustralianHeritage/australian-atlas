import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

export const maxDuration = 60

const AGENT_NAME = 'editorial-signals'

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']
const VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
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
const MILESTONE_YEARS = [10, 25, 50, 75]

export async function GET(request) {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const signals = {}
  const errors = []

  // ── Signal 1: New high-quality listings ──────────────────
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await sb
      .from('listings')
      .select(`name, slug, vertical, region, state, quality_score, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .gte('quality_score', 75)
      .gte('created_at', sevenDaysAgo)
      .order('quality_score', { ascending: false })

    if (error) throw error
    signals.newHighQuality = data || []
  } catch (err) {
    console.error('[editorial-signals] Signal 1 error:', err.message)
    errors.push(`Signal 1 (new high-quality): ${err.message}`)
    signals.newHighQuality = null
  }

  // ── Signal 2: Trending listings (added to 3+ trails) ────
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentStops, error } = await sb
      .from('trail_stops')
      .select('listing_id, venue_name, vertical')
      .gte('created_at', sevenDaysAgo)
      .not('listing_id', 'is', null)

    if (error) throw error

    // Aggregate in JS: group by listing_id, count occurrences
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

    // Filter to those appearing in 3+ trails
    signals.trending = Array.from(stopCounts.values())
      .filter(s => s.count >= 3)
      .sort((a, b) => b.count - a.count)
  } catch (err) {
    console.error('[editorial-signals] Signal 2 error:', err.message)
    errors.push(`Signal 2 (trending): ${err.message}`)
    signals.trending = null
  }

  // ── Signal 3: Coverage gaps ──────────────────────────────
  try {
    // 3a. Regions with fewer than 5 listings
    const { data: regions, error: regErr } = await sb
      .from('regions')
      .select('name, slug, state, listing_count')
      .lt('listing_count', 5)
      .order('listing_count', { ascending: true })

    if (regErr) throw regErr

    // 3b. Verticals with thin state coverage (< 3 active listings)
    const thinVerticalStates = []
    for (const vertical of VERTICALS) {
      for (const state of STATES) {
        const { count, error: cErr } = await sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('vertical', vertical)
          .eq('state', state)

        if (cErr) continue
        if ((count || 0) < 3) {
          thinVerticalStates.push({
            vertical,
            verticalLabel: VERTICAL_LABELS[vertical],
            state,
            count: count || 0,
          })
        }
      }
    }

    signals.coverageGaps = {
      thinRegions: regions || [],
      thinVerticalStates,
    }
  } catch (err) {
    console.error('[editorial-signals] Signal 3 error:', err.message)
    errors.push(`Signal 3 (coverage gaps): ${err.message}`)
    signals.coverageGaps = null
  }

  // ── Signal 4: Approaching anniversaries ──────────────────
  try {
    const { data: withYear, error } = await sb
      .from('listings')
      .select('name, slug, vertical, state, founded_year')
      .eq('status', 'active')
      .not('founded_year', 'is', null)

    if (error) throw error

    const currentYear = new Date().getFullYear()
    const nextYear = currentYear + 1
    const approaching = []

    for (const listing of (withYear || [])) {
      const age = currentYear - listing.founded_year
      const ageNext = nextYear - listing.founded_year

      for (const milestone of MILESTONE_YEARS) {
        // Milestone this year
        if (age === milestone) {
          approaching.push({
            ...listing,
            milestone,
            year: currentYear,
            label: `Turning ${milestone} this year`,
          })
          break
        }
        // Milestone next year (within 90-day lookahead window)
        if (ageNext === milestone) {
          approaching.push({
            ...listing,
            milestone,
            year: nextYear,
            label: `Turning ${milestone} next year`,
          })
          break
        }
      }
    }

    signals.anniversaries = approaching.sort((a, b) => a.milestone - b.milestone)
  } catch (err) {
    console.error('[editorial-signals] Signal 4 error:', err.message)
    errors.push(`Signal 4 (anniversaries): ${err.message}`)
    signals.anniversaries = null
  }

  // ── Signal 5: Community reports ──────────────────────────
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await sb
      .from('listing_suggestions')
      .select('id, name, website, suburb, state, vertical, reason, submitter_email, created_at')
      .eq('status', 'pending')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    signals.communityReports = data || []
  } catch (err) {
    console.error('[editorial-signals] Signal 5 error:', err.message)
    errors.push(`Signal 5 (community reports): ${err.message}`)
    signals.communityReports = null
  }

  // ── Signal 6: Enrichment queue size ──────────────────────
  try {
    // Listings that have a website but no AI description, and description
    // is either null or shorter than 200 characters.
    // Supabase JS client doesn't support length filters natively, so we
    // do two queries: one for null description, one for short description.

    const { count: nullDescCount, error: e1 } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('website', 'is', null)
      .is('ai_description', null)
      .is('description', null)

    if (e1) throw e1

    // For short descriptions we need an RPC or fetch + filter.
    // Fetch IDs only to count — cap at 1000 to avoid large payloads.
    const { data: shortDesc, error: e2 } = await sb
      .from('listings')
      .select('id, description')
      .eq('status', 'active')
      .not('website', 'is', null)
      .is('ai_description', null)
      .not('description', 'is', null)
      .limit(1000)

    if (e2) throw e2

    const shortCount = (shortDesc || []).filter(l => l.description.length < 200).length

    signals.enrichmentQueue = {
      nullDescription: nullDescCount || 0,
      shortDescription: shortCount,
      total: (nullDescCount || 0) + shortCount,
    }
  } catch (err) {
    console.error('[editorial-signals] Signal 6 error:', err.message)
    errors.push(`Signal 6 (enrichment queue): ${err.message}`)
    signals.enrichmentQueue = null
  }

  // ── Totals for footer ────────────────────────────────────
  let totalListings = 0
  let activeListings = 0
  let unverifiedListings = 0
  try {
    const { count: total } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })

    const { count: active } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    const { count: unverified } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('verified', false)

    totalListings = total || 0
    activeListings = active || 0
    unverifiedListings = unverified || 0
  } catch (err) {
    console.error('[editorial-signals] Totals error:', err.message)
  }

  // ── Compile email ────────────────────────────────────────
  const allEmpty =
    (signals.newHighQuality?.length ?? 0) === 0 &&
    (signals.trending?.length ?? 0) === 0 &&
    (signals.coverageGaps?.thinRegions?.length ?? 0) === 0 &&
    (signals.coverageGaps?.thinVerticalStates?.length ?? 0) === 0 &&
    (signals.anniversaries?.length ?? 0) === 0 &&
    (signals.communityReports?.length ?? 0) === 0 &&
    (signals.enrichmentQueue?.total ?? 0) === 0

  const weekLabel = new Date().toLocaleDateString('en-AU')
  const subject = `Atlas Editorial Signals — week of ${weekLabel}`

  const html = buildEmailHtml({ signals, errors, allEmpty, totalListings, activeListings, unverifiedListings })

  await sendAgentEmail({ subject, html })

  // ── Complete run ─────────────────────────────────────────
  const summary = {
    newHighQuality: signals.newHighQuality?.length ?? 0,
    trending: signals.trending?.length ?? 0,
    thinRegions: signals.coverageGaps?.thinRegions?.length ?? 0,
    thinVerticalStates: signals.coverageGaps?.thinVerticalStates?.length ?? 0,
    anniversaries: signals.anniversaries?.length ?? 0,
    communityReports: signals.communityReports?.length ?? 0,
    enrichmentQueue: signals.enrichmentQueue?.total ?? 0,
    errors: errors.length,
  }

  await completeRun(runId, {
    status: errors.length > 0 ? 'partial' : 'success',
    summary,
    error: errors.length > 0 ? errors.join('; ') : null,
  })

  return NextResponse.json({ success: true, summary })
}

// ─── Email builder ──────────────────────────────────────────

function buildEmailHtml({ signals, errors, allEmpty, totalListings, activeListings, unverifiedListings }) {
  const sections = []

  // Header
  sections.push(`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #2d2a24; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #d4a843; margin: 0; font-size: 22px; font-weight: 600;">Editorial Signals</h1>
      <p style="color: #a89a7e; margin: 4px 0 0; font-size: 13px;">Australian Atlas &middot; Week of ${new Date().toLocaleDateString('en-AU')}</p>
    </div>
    <div style="padding: 24px 32px; border: 1px solid #e5e0d5; border-top: none; border-radius: 0 0 8px 8px;">
  `)

  if (allEmpty && errors.length === 0) {
    sections.push(`
      <p style="color: #6b7280; font-size: 15px; padding: 32px 0; text-align: center;">
        All clear this week &mdash; nothing flagged.
      </p>
    `)
  } else {
    // Signal 1
    sections.push(renderSignal1(signals.newHighQuality))
    // Signal 2
    sections.push(renderSignal2(signals.trending))
    // Signal 3
    sections.push(renderSignal3(signals.coverageGaps))
    // Signal 4
    sections.push(renderSignal4(signals.anniversaries))
    // Signal 5
    sections.push(renderSignal5(signals.communityReports))
    // Signal 6
    sections.push(renderSignal6(signals.enrichmentQueue))
  }

  // Errors
  if (errors.length > 0) {
    sections.push(`
      <div style="margin-top: 24px; padding: 12px 16px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b; font-size: 13px;">Query errors (${errors.length})</p>
        <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 12px;">
          ${errors.map(e => `<li>${esc(e)}</li>`).join('')}
        </ul>
      </div>
    `)
  }

  // Footer
  sections.push(`
      <hr style="border: none; border-top: 1px solid #e5e0d5; margin: 28px 0 16px;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Total listings: ${totalListings.toLocaleString()} &mdash; ${activeListings.toLocaleString()} active, ${unverifiedListings.toLocaleString()} unverified
      </p>
      <p style="color: #c4bfb4; font-size: 11px; margin: 8px 0 0;">
        Sent by the Editorial Signals Agent &middot; Australian Atlas
      </p>
    </div></div>
  `)

  return sections.join('')
}

// ─── Section renderers ──────────────────────────────────────

function sectionHeader(title, count) {
  return `
    <div style="margin-top: 24px; margin-bottom: 12px;">
      <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0; display: inline;">
        ${esc(title)}
      </h2>
      ${count != null ? `<span style="font-size: 12px; color: #9ca3af; margin-left: 8px;">(${count})</span>` : ''}
    </div>
  `
}

function renderSignal1(data) {
  if (data === null) return renderError('New High-Quality Listings', 'Query failed')
  if (data.length === 0) return ''

  let rows = ''
  for (const l of data) {
    rows += `
      <tr>
        <td style="padding: 6px 8px; font-size: 13px;">
          <a href="https://australianatlas.com.au/place/${esc(l.slug)}" style="color: #b8862b; text-decoration: none;">${esc(l.name)}</a>
        </td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[l.vertical] || l.vertical)}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(getListingRegion(l)?.name || '')}${l.state ? `, ${esc(l.state)}` : ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; text-align: right;">
          <span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 10px; font-weight: 500;">${l.quality_score}</span>
        </td>
      </tr>
    `
  }

  return `
    ${sectionHeader('New High-Quality Listings', data.length)}
    <p style="font-size: 12px; color: #9ca3af; margin: 0 0 8px;">Created in the last 7 days with quality score &ge; 75</p>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #e5e0d5;">
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Name</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Region</th>
          <th style="padding: 6px 8px; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderSignal2(data) {
  if (data === null) return renderError('Trending Listings', 'Query failed')
  if (data.length === 0) return ''

  let rows = ''
  for (const t of data) {
    rows += `
      <tr>
        <td style="padding: 6px 8px; font-size: 13px;">${esc(t.venue_name || t.listing_id)}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[t.vertical] || t.vertical || '')}</td>
        <td style="padding: 6px 8px; font-size: 12px; text-align: right; font-weight: 500;">${t.count} trails</td>
      </tr>
    `
  }

  return `
    ${sectionHeader('Trending Listings', data.length)}
    <p style="font-size: 12px; color: #9ca3af; margin: 0 0 8px;">Added to 3+ trails in the last 7 days</p>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #e5e0d5;">
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Listing</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
          <th style="padding: 6px 8px; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Trail adds</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderSignal3(data) {
  if (data === null) return renderError('Coverage Gaps', 'Query failed')

  const { thinRegions, thinVerticalStates } = data
  if (thinRegions.length === 0 && thinVerticalStates.length === 0) return ''

  let html = sectionHeader('Coverage Gaps')

  // Thin regions
  if (thinRegions.length > 0) {
    html += `<p style="font-size: 12px; color: #9ca3af; margin: 8px 0 4px; font-weight: 500;">Regions with fewer than 5 listings</p>`
    let regionRows = ''
    for (const r of thinRegions) {
      regionRows += `
        <tr>
          <td style="padding: 4px 8px; font-size: 13px;">
            <a href="https://australianatlas.com.au/regions/${esc(r.slug)}" style="color: #b8862b; text-decoration: none;">${esc(r.name)}</a>
          </td>
          <td style="padding: 4px 8px; font-size: 12px; color: #6b7280;">${esc(r.state || '')}</td>
          <td style="padding: 4px 8px; font-size: 12px; text-align: right;">${r.listing_count}</td>
        </tr>
      `
    }
    html += `
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>${regionRows}</tbody>
      </table>
    `
  }

  // Thin vertical-state combos
  if (thinVerticalStates.length > 0) {
    html += `<p style="font-size: 12px; color: #9ca3af; margin: 16px 0 4px; font-weight: 500;">Verticals with &lt; 3 listings in a state</p>`
    let vsRows = ''
    for (const vs of thinVerticalStates) {
      vsRows += `
        <tr>
          <td style="padding: 4px 8px; font-size: 13px;">${esc(vs.verticalLabel)}</td>
          <td style="padding: 4px 8px; font-size: 12px; color: #6b7280;">${esc(vs.state)}</td>
          <td style="padding: 4px 8px; font-size: 12px; text-align: right;">${vs.count}</td>
        </tr>
      `
    }
    html += `
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>${vsRows}</tbody>
      </table>
    `
  }

  return html
}

function renderSignal4(data) {
  if (data === null) return renderError('Approaching Anniversaries', 'Query failed')
  if (data.length === 0) return ''

  let rows = ''
  for (const a of data) {
    rows += `
      <tr>
        <td style="padding: 6px 8px; font-size: 13px;">
          <a href="https://australianatlas.com.au/place/${esc(a.slug)}" style="color: #b8862b; text-decoration: none;">${esc(a.name)}</a>
        </td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[a.vertical] || a.vertical)}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(a.state || '')}</td>
        <td style="padding: 6px 8px; font-size: 12px; text-align: right;">
          <span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-weight: 500;">${a.milestone}yr in ${a.year}</span>
        </td>
      </tr>
    `
  }

  return `
    ${sectionHeader('Approaching Anniversaries', data.length)}
    <p style="font-size: 12px; color: #9ca3af; margin: 0 0 8px;">Listings turning 10, 25, 50, or 75 this year or next</p>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #e5e0d5;">
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Name</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">State</th>
          <th style="padding: 6px 8px; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Milestone</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderSignal5(data) {
  if (data === null) return renderError('Community Reports', 'Query failed')
  if (data.length === 0) return ''

  let rows = ''
  for (const s of data) {
    const date = new Date(s.created_at).toLocaleDateString('en-AU')
    rows += `
      <tr>
        <td style="padding: 6px 8px; font-size: 13px;">
          <a href="https://australianatlas.com.au/admin" style="color: #b8862b; text-decoration: none;">${esc(s.name)}</a>
        </td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[s.vertical] || s.vertical || '—')}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(s.suburb || '')}${s.state ? `, ${esc(s.state)}` : ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #9ca3af;">${date}</td>
      </tr>
    `
  }

  return `
    ${sectionHeader('Community Reports', data.length)}
    <p style="font-size: 12px; color: #9ca3af; margin: 0 0 8px;">Pending suggestions submitted in the last 7 days</p>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #e5e0d5;">
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Name</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Location</th>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderSignal6(data) {
  if (data === null) return renderError('Enrichment Queue', 'Query failed')
  if (data.total === 0) return ''

  return `
    ${sectionHeader('Enrichment Queue')}
    <div style="display: flex; gap: 16px; margin-top: 8px;">
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2d2a24;">${data.total.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Total needing enrichment</div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2d2a24;">${data.nullDescription.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">No description</div>
      </div>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2d2a24;">${data.shortDescription.toLocaleString()}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Description &lt; 200 chars</div>
      </div>
    </div>
    <p style="font-size: 12px; color: #9ca3af; margin: 8px 0 0;">Active listings with a website but no AI description</p>
  `
}

function renderError(title, msg) {
  return `
    ${sectionHeader(title)}
    <p style="font-size: 13px; color: #ef4444;">Failed to load: ${esc(msg)}</p>
  `
}

// ─── Utilities ──────────────────────────────────────────────

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
