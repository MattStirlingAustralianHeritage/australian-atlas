import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

const AGENT_NAME = 'listing-velocity'

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const VERT_NAMES = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

// ─── GET handler ────────────────────────────────────────────────

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun(AGENT_NAME)
  const now = new Date()
  const thisMonth = now.toISOString().slice(0, 7) // YYYY-MM
  const snapshotDate = now.toISOString().slice(0, 10) // YYYY-MM-DD

  const counts = { verticals_tracked: 0, regions_tracked: 0, net_change: 0, errors: 0 }

  try {
    // ── 1. Take current snapshot ──────────────────────────────
    console.log('[listing-velocity] Taking monthly snapshot...')

    // Count by vertical
    const { data: verticalCounts } = await sb
      .from('listings')
      .select('vertical, status, is_claimed')
      .eq('status', 'active')

    const byVertical = {}
    for (const l of (verticalCounts || [])) {
      if (!byVertical[l.vertical]) {
        byVertical[l.vertical] = { count: 0, active: 0, claimed: 0 }
      }
      byVertical[l.vertical].count++
      byVertical[l.vertical].active++
      if (l.is_claimed) byVertical[l.vertical].claimed++
    }

    // Count by region
    const { data: regionCounts } = await sb
      .from('listings')
      .select('region, state, status, is_claimed')
      .eq('status', 'active')

    const byRegion = {}
    for (const l of (regionCounts || [])) {
      const key = l.region || 'Unknown'
      if (!byRegion[key]) {
        byRegion[key] = { count: 0, active: 0, claimed: 0, state: l.state }
      }
      byRegion[key].count++
      byRegion[key].active++
      if (l.is_claimed) byRegion[key].claimed++
    }

    // Get average quality scores by vertical
    const { data: qualityByVert } = await sb
      .from('listings')
      .select('vertical, quality_score')
      .eq('status', 'active')
      .not('quality_score', 'is', null)

    const qualityAvgs = {}
    const qualitySums = {}
    const qualityCounts = {}
    for (const l of (qualityByVert || [])) {
      if (!qualitySums[l.vertical]) { qualitySums[l.vertical] = 0; qualityCounts[l.vertical] = 0 }
      qualitySums[l.vertical] += l.quality_score
      qualityCounts[l.vertical]++
    }
    for (const v of Object.keys(qualitySums)) {
      qualityAvgs[v] = Math.round(qualitySums[v] / qualityCounts[v])
    }

    // ── 2. Store snapshot ─────────────────────────────────────
    // Delete any existing snapshot for today (re-run safety)
    await sb.from('listing_history').delete().eq('snapshot_date', snapshotDate)

    // Insert vertical snapshots
    const verticalInserts = Object.entries(byVertical).map(([vertical, data]) => ({
      snapshot_date: snapshotDate,
      vertical,
      region: null,
      state: null,
      count: data.count,
      active_count: data.active,
      claimed_count: data.claimed,
      verified_count: 0,
      avg_quality_score: qualityAvgs[vertical] || null,
    }))

    if (verticalInserts.length > 0) {
      await sb.from('listing_history').insert(verticalInserts)
      counts.verticals_tracked = verticalInserts.length
    }

    // Insert top 30 region snapshots
    const regionEntries = Object.entries(byRegion)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)

    const regionInserts = regionEntries.map(([region, data]) => ({
      snapshot_date: snapshotDate,
      vertical: null,
      region,
      state: data.state,
      count: data.count,
      active_count: data.active,
      claimed_count: data.claimed,
      verified_count: 0,
      avg_quality_score: null,
    }))

    if (regionInserts.length > 0) {
      await sb.from('listing_history').insert(regionInserts)
      counts.regions_tracked = regionInserts.length
    }

    // ── 3. Compare with previous month ────────────────────────
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthStr = prevMonth.toISOString().slice(0, 7) // YYYY-MM

    // Fetch last month's snapshot (find the nearest snapshot date)
    const { data: prevSnapshots } = await sb
      .from('listing_history')
      .select('id, snapshot_date, vertical, region, state, count, active_count, claimed_count, verified_count, avg_quality_score')
      .gte('snapshot_date', `${prevMonthStr}-01`)
      .lt('snapshot_date', `${thisMonth}-01`)
      .order('snapshot_date', { ascending: false })

    const prevByVertical = {}
    const prevByRegion = {}
    for (const s of (prevSnapshots || [])) {
      if (s.vertical && !s.region) prevByVertical[s.vertical] = s
      if (s.region && !s.vertical) prevByRegion[s.region] = s
    }

    const hasPriorData = Object.keys(prevByVertical).length > 0

    // ── 4. Build velocity data ────────────────────────────────
    const verticalVelocity = Object.entries(byVertical).map(([vertical, current]) => {
      const prev = prevByVertical[vertical]
      const prevCount = prev?.count || 0
      const change = current.count - prevCount
      const pctChange = prevCount > 0 ? ((change / prevCount) * 100).toFixed(1) : null
      return {
        vertical,
        name: VERT_NAMES[vertical] || vertical,
        current: current.count,
        previous: prevCount,
        change,
        pctChange,
        claimed: current.claimed,
        avgQuality: qualityAvgs[vertical] || null,
      }
    }).sort((a, b) => b.change - a.change)

    const regionVelocity = regionEntries.map(([region, current]) => {
      const prev = prevByRegion[region]
      const prevCount = prev?.count || 0
      const change = current.count - prevCount
      return { region, state: current.state, current: current.count, previous: prevCount, change }
    }).sort((a, b) => b.change - a.change)

    // Total network change
    const totalCurrent = verticalVelocity.reduce((s, v) => s + v.current, 0)
    const totalPrevious = verticalVelocity.reduce((s, v) => s + v.previous, 0)
    counts.net_change = totalCurrent - totalPrevious

    // Find stagnant vertical/region combinations (no new listings in 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    // Get verticals with recent listings
    const { data: recentByVertical } = await sb
      .from('listings')
      .select('vertical')
      .eq('status', 'active')
      .gte('created_at', ninetyDaysAgo)

    const activeVerticals = new Set((recentByVertical || []).map(l => l.vertical))
    const stagnantVerticals = Object.keys(byVertical).filter(v => !activeVerticals.has(v))

    // ── 5. Claude narrative summary ──────────────────────────
    let narrative = ''
    try {
      const velocityData = JSON.stringify({
        total_current: totalCurrent,
        total_previous: totalPrevious,
        net_change: counts.net_change,
        has_prior_data: hasPriorData,
        verticals: verticalVelocity,
        top_5_growing_regions: regionVelocity.slice(0, 5),
        bottom_5_regions: regionVelocity.slice(-5).reverse(),
        stagnant_verticals: stagnantVerticals.map(v => VERT_NAMES[v] || v),
      })

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are the growth intelligence layer for Australian Atlas. Based on this month's listing velocity data, write a 150-word narrative summary for Matt, the founder. Voice: direct, specific, no spin. Identify: the fastest growing vertical, the fastest growing region, any vertical/region combination that has had zero new listings in 90 days (stagnant), and whether overall network growth is accelerating or decelerating compared to last month. End with one specific recommendation. ${!hasPriorData ? 'Note: this is the first snapshot — no prior month to compare. Focus on current state and where the biggest opportunities are.' : ''} Data: ${velocityData}`,
          }],
        }),
      })

      if (claudeRes.ok) {
        const data = await claudeRes.json()
        narrative = data.content?.[0]?.text || ''
      }
    } catch (err) {
      console.error('[listing-velocity] Claude narrative error:', err.message)
    }

    // ── 6. Build and send email ──────────────────────────────
    const growOrShrink = counts.net_change >= 0 ? 'grew' : 'shrank'
    const monthName = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

    await sendAgentEmail({
      subject: hasPriorData
        ? `Listing Velocity — ${monthName} — network ${growOrShrink} by ${Math.abs(counts.net_change)} listings`
        : `Listing Velocity — ${monthName} — first snapshot: ${totalCurrent} listings`,
      html: buildEmailHtml({
        totalCurrent,
        totalPrevious,
        netChange: counts.net_change,
        hasPriorData,
        verticalVelocity,
        regionVelocity,
        stagnantVerticals,
        narrative,
        monthName,
      }),
    })

    await completeRun(runId, {
      status: counts.errors > 0 ? 'partial' : 'success',
      summary: counts,
    })

    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    console.error(`[listing-velocity] Fatal error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// ─── Email HTML ──────────────────────────────────────────────────

function buildEmailHtml({ totalCurrent, totalPrevious, netChange, hasPriorData, verticalVelocity, regionVelocity, stagnantVerticals, narrative, monthName }) {
  // Vertical table rows
  const vertRows = verticalVelocity.map(v => {
    const changeColor = v.change > 0 ? '#4a7c59' : v.change < 0 ? '#c44' : '#8a7a5a'
    const changeStr = v.change > 0 ? `+${v.change}` : `${v.change}`
    return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24;font-weight:500">${esc(v.name)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#8a7a5a;text-align:center">${hasPriorData ? v.previous : '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#2d2a24;text-align:center;font-weight:600">${v.current}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:${changeColor};text-align:center;font-weight:600">${hasPriorData ? changeStr : '—'}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:13px;color:#8a7a5a;text-align:center">${v.pctChange !== null && hasPriorData ? `${v.pctChange}%` : '—'}</td>
      </tr>
    `
  }).join('')

  // Top 5 growing regions
  const growingRegions = regionVelocity.filter(r => r.change > 0).slice(0, 5)
  const decliningRegions = regionVelocity.filter(r => r.change < 0).slice(-5).reverse()
  const stagnantRegions = regionVelocity.filter(r => r.change === 0 && r.current > 5).slice(0, 5)

  const regionRows = (regions, label) => {
    if (regions.length === 0) return ''
    const rows = regions.map(r => {
      const changeColor = r.change > 0 ? '#4a7c59' : r.change < 0 ? '#c44' : '#8a7a5a'
      return `
        <tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f0ece4;font-family:sans-serif;font-size:12px;color:#2d2a24">${esc(r.region)}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0ece4;font-family:sans-serif;font-size:12px;color:#8a7a5a;text-align:center">${r.state || ''}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0ece4;font-family:sans-serif;font-size:12px;color:#2d2a24;text-align:center">${r.current}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f0ece4;font-family:sans-serif;font-size:12px;color:${changeColor};text-align:center;font-weight:600">${r.change > 0 ? '+' : ''}${r.change}</td>
        </tr>
      `
    }).join('')
    return `
      <p style="font-family:sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin:16px 0 6px">${label}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <tbody>${rows}</tbody>
      </table>
    `
  }

  // Stagnant alert
  const stagnantSection = stagnantVerticals.length > 0 ? `
    <div style="padding:14px 20px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;margin:20px 0">
      <p style="font-family:sans-serif;font-size:12px;font-weight:600;color:#92400e;margin:0 0 4px">Zero Growth Alert (90 days)</p>
      <p style="font-family:sans-serif;font-size:13px;color:#92400e;margin:0">
        ${stagnantVerticals.map(v => VERT_NAMES[v] || v).join(', ')} — no new listings in 90 days. These verticals need pipeline attention.
      </p>
    </div>
  ` : ''

  return `
    <div style="background:#2d2a24;padding:24px 32px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#d4a843">
        Listing Velocity
      </h1>
      <p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:#8a7a5a">
        ${monthName}
      </p>
    </div>

    <div style="padding:24px 32px;background:#faf8f4;border:1px solid #e8e4da;border-top:none;border-radius:0 0 8px 8px">
      <!-- Hero stat -->
      <div style="text-align:center;padding:20px;margin-bottom:24px">
        <div style="font-family:Georgia,serif;font-size:48px;color:${netChange >= 0 ? '#4a7c59' : '#c44'};line-height:1">
          ${hasPriorData ? (netChange >= 0 ? '+' : '') + netChange : totalCurrent}
        </div>
        <div style="font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:6px">
          ${hasPriorData ? 'Net listings added this month' : 'Total active listings (first snapshot)'}
        </div>
      </div>

      <!-- Vertical table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#f0ece4">
            <th style="padding:6px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Vertical</th>
            <th style="padding:6px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Last Month</th>
            <th style="padding:6px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">This Month</th>
            <th style="padding:6px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Change</th>
            <th style="padding:6px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">%</th>
          </tr>
        </thead>
        <tbody>${vertRows}</tbody>
      </table>

      <!-- Region breakdowns -->
      ${hasPriorData ? regionRows(growingRegions, 'Top Growing Regions') : ''}
      ${hasPriorData ? regionRows(stagnantRegions, 'Stagnant Regions (no change)') : ''}
      ${hasPriorData ? regionRows(decliningRegions, 'Declining Regions') : ''}

      ${stagnantSection}

      <!-- Claude narrative -->
      ${narrative ? `
        <div style="padding:16px 20px;border-radius:8px;background:#fff;border:1px solid #e8e4da;margin:20px 0">
          <p style="font-family:sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#C49A3C;margin:0 0 8px">Intelligence Summary</p>
          <p style="font-family:sans-serif;font-size:14px;line-height:1.7;color:#2d2a24;margin:0">${esc(narrative)}</p>
        </div>
      ` : ''}

      <p style="font-family:sans-serif;font-size:11px;color:#8a7a5a;margin-top:20px;border-top:1px solid #e8e4da;padding-top:12px;text-align:center">
        ${Object.keys(verticalVelocity).length} verticals · ${regionVelocity.length} regions tracked · No action required
      </p>
    </div>
  `
}
