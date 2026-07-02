import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { computeRegionMetricsBatch } from '@/lib/analytics/regionMetrics'
import { computeWeeklyTrends, computeSearchInsights, computePresenceAudit } from '@/lib/council/insights'

/**
 * GET /api/cron/council-digest — the monthly "Region Pulse".
 *
 * On the 1st of each month, every approved, active council partner receives an
 * email digest of the last 30 days for its region(s): views/clicks with
 * period-on-period change, most-viewed places, search interest, demand gaps,
 * and a digital-presence snapshot. The product shows up in the council's inbox
 * whether or not anyone logs in — the artefact IS the retention.
 *
 * Auth: Bearer CRON_SECRET. ?dryRun=1 computes and returns the HTML without
 * sending (for verification). ?council=<slug> narrows to one account.
 */

export const maxDuration = 300

const WINDOW_DAYS = 30

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-AU') : '0')

function deltaText(current, previous) {
  if (!previous) return ''
  const pct = Math.round(((current - previous) / previous) * 100)
  if (!isFinite(pct) || pct === 0) return ''
  const up = pct > 0
  return ` <span style="color:${up ? '#4a7166' : '#C4603A'};font-size:13px;font-weight:600">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>`
}

// Email-safe styling: system serif for display (Fraunces isn't email-safe),
// table-free single column, Atlas palette.
function renderDigestHtml({ council, month, regionsHtml }) {
  return `
<div style="background:#EFE7D8;padding:28px 12px;font-family:Georgia,'Times New Roman',serif;color:#1C1A17">
  <div style="max-width:620px;margin:0 auto">
    <p style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#6B6760;margin:0 0 4px;text-align:center">Australian Atlas</p>
    <h1 style="font-size:26px;font-weight:400;margin:0 0 4px;text-align:center">Region Pulse</h1>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6B6760;margin:0 0 22px;text-align:center">${esc(month)} · prepared for ${esc(council.name)}</p>
    ${regionsHtml}
    <div style="background:#faf8f5;border:1px solid #e2ddd2;border-radius:12px;padding:18px 22px;margin:0 0 18px;text-align:center">
      <a href="https://www.australianatlas.com.au/council" style="display:inline-block;background:#1C1A17;color:#faf8f5;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:10px 22px;border-radius:9px;margin:0 4px 6px">Open your dashboard</a>
    </div>
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6B6760;line-height:1.6;margin:0;text-align:center">
      Figures cover the last ${WINDOW_DAYS} days, bot-filtered, compared with the preceding ${WINDOW_DAYS} days.<br/>
      You receive this monthly as an Australian Atlas founding partner. To change recipients or opt out,
      reply or email <a href="mailto:councils@australianatlas.com.au" style="color:#4a7166">councils@australianatlas.com.au</a>.
    </p>
  </div>
</div>`
}

function renderRegionHtml({ metrics, trend, insight, presence }) {
  const name = metrics.region?.name || 'Your region'
  const cur = trend?.current || {}
  const prev = trend?.previous || {}

  const statCell = (value, label, delta = '') => `
    <td width="33%" style="background:#faf8f5;border:1px solid #e2ddd2;border-radius:10px;padding:12px 14px;text-align:center">
      <div style="font-size:24px">${value}${delta}</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#6B6760;margin-top:2px">${label}</div>
    </td>`

  const list = (rows, renderRow) => rows.length
    ? `<ul style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#1C1A17;line-height:1.7;margin:4px 0 0;padding:0 0 0 18px">${rows.map(renderRow).join('')}</ul>`
    : ''

  const topPlaces = (metrics.topListings || []).slice(0, 5)
  const topSearches = (insight?.topQueries || []).slice(0, 5)
  const gaps = (insight?.gaps || []).slice(0, 5)

  const sectionLabel = (text) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#6B6760;margin:16px 0 2px">${text}</p>`

  return `
  <div style="background:#fff;border:1px solid #e2ddd2;border-radius:12px;padding:22px 24px;margin:0 0 18px">
    <h2 style="font-size:20px;font-weight:400;margin:0 0 12px;border-bottom:2px solid #1C1A17;padding-bottom:8px">${esc(name)}</h2>
    <table width="100%" cellspacing="6" cellpadding="0" style="border-collapse:separate"><tr>
      ${statCell(fmt(cur.views ?? metrics.regionPageViews), 'Page views', deltaText(cur.views, prev.views))}
      ${statCell(fmt(cur.clicks ?? metrics.totalClicks), 'Listing clicks', deltaText(cur.clicks, prev.clicks))}
      ${statCell(fmt(metrics.totalListings), 'Listings')}
    </tr></table>

    ${topPlaces.length ? sectionLabel('Most-viewed places') + list(topPlaces, (l) =>
      `<li>${esc(l.name)} <span style="color:#6B6760">· ${esc(l.verticalLabel || '')} · ${fmt(l.clicks)} views</span></li>`) : ''}

    ${topSearches.length ? sectionLabel('What visitors searched for') + list(topSearches, (q) =>
      `<li>&ldquo;${esc(q.query)}&rdquo; <span style="color:#6B6760">· ${fmt(q.count)}×</span></li>`) : ''}

    ${gaps.length ? sectionLabel('Demand gaps — searches that found little') + list(gaps, (g) =>
      `<li>&ldquo;${esc(g.query)}&rdquo; <span style="color:#C4603A">· ${fmt(g.count)}× searched, ~${Math.round(g.avgResults)} results</span></li>`) : ''}

    ${presence ? sectionLabel('Digital presence') + `
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#1C1A17;line-height:1.6;margin:4px 0 0">
        ${fmt(presence.noWebsite.count)} venues have no website and ${fmt(presence.deadWebsite.count)} have a website that appears down
        — the full hit-list is on your <a href="https://www.australianatlas.com.au/council/presence" style="color:#4a7166">Digital presence</a> page.
      </p>` : ''}

    <p style="margin:16px 0 0"><a href="https://www.australianatlas.com.au/council/${esc(metrics.region?.slug)}/report?range=30d" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#4a7166">Open the print-ready report →</a></p>
  </div>`
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'
  const onlyCouncil = searchParams.get('council')

  const sb = getSupabaseAdmin()
  const runId = await startRun('council-digest')
  const summary = { councils: 0, emails_sent: 0, skipped: 0, errors: 0 }
  const previews = []

  try {
    let q = sb
      .from('council_accounts')
      .select('id, name, slug, contact_email, approved, status')
      .eq('approved', true)
      .eq('status', 'active')
    if (onlyCouncil) q = q.eq('slug', onlyCouncil)
    const { data: councils, error } = await q
    if (error) throw error

    const month = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()

    for (const council of councils || []) {
      summary.councils += 1
      try {
        const { data: councilRegions } = await sb
          .from('council_regions')
          .select('regions(id, slug, name, state, center_lat, center_lng)')
          .eq('council_id', council.id)
        const regions = (councilRegions || []).map((cr) => cr.regions).filter(Boolean)
        if (!regions.length || !council.contact_email) {
          summary.skipped += 1
          continue
        }

        const [metricsList, trends, insights, presence] = await Promise.all([
          computeRegionMetricsBatch(sb, regions, { since, limit: 5 }),
          computeWeeklyTrends(sb, regions, { rangeDays: WINDOW_DAYS }).catch(() => null),
          computeSearchInsights(sb, regions, { rangeDays: WINDOW_DAYS }).catch(() => null),
          computePresenceAudit(sb, regions).catch(() => null),
        ])

        const regionsHtml = metricsList.map((metrics) => {
          const slug = metrics.region?.slug
          return renderRegionHtml({
            metrics,
            trend: trends?.byRegion?.find((r) => r.region.slug === slug),
            insight: insights?.byRegion?.find((r) => r.region.slug === slug),
            presence: presence?.byRegion?.find((r) => r.region.slug === slug),
          })
        }).join('')

        const html = renderDigestHtml({ council, month, regionsHtml })
        const subject = `Region Pulse — ${regions.map((r) => r.name).join(', ')} · ${month}`

        if (dryRun) {
          previews.push({ council: council.slug, subject, html })
          continue
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Australian Atlas <noreply@australianatlas.com.au>',
            to: council.contact_email,
            reply_to: 'councils@australianatlas.com.au',
            subject,
            html,
          }),
        })
        if (!res.ok) {
          summary.errors += 1
          console.error(`council-digest: Resend failed for ${council.slug}:`, await res.text())
          continue
        }
        summary.emails_sent += 1

        try {
          await sb.from('council_activity').insert({
            council_id: council.id,
            action: 'digest_sent',
            metadata: { month, regions: regions.map((r) => r.slug) },
          })
        } catch { /* non-fatal */ }
      } catch (err) {
        summary.errors += 1
        console.error(`council-digest: failed for council ${council.slug}:`, err)
      }
    }

    await completeRun(runId, { status: summary.errors ? 'partial' : 'success', summary })
    return NextResponse.json({ ok: true, dryRun, summary, ...(dryRun ? { previews } : {}) })
  } catch (err) {
    console.error('council-digest fatal:', err)
    await completeRun(runId, { status: 'error', summary, error: String(err?.message || err) })
    return NextResponse.json({ error: 'Digest run failed' }, { status: 500 })
  }
}
