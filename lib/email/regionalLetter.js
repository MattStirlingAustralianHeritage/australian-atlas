// "State of your region" — quarterly letter for PAID operators, template helpers.
//
// Branded to match lib/email/authEmails.js / lib/email/operatorDigest.js exactly
// (Playfair Display masthead, DM Sans body, #1C1A17 ink / #5f8a7e sage /
// #d4a843 gold on the #faf8f5 cream ground). Sent via Resend by
// app/api/cron/regional-letter/route.js.
//
// Composition is entirely RULE-BASED — no AI call anywhere in this letter.
// Every number and every search query rendered here comes straight from the
// analytics_region_metrics RPC / pageviews / listing_search_appearances
// snapshots computed by the cron. No invented facts, no hype.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'hello@australianatlas.com.au'

const DASHBOARD_URL = 'https://www.australianatlas.com.au/dashboard'

const P_BODY = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`
const P_SMALL = `margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;`

export function esc(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// One stat cell: big Playfair number, small-caps label. No deltas — the letter
// is a single-window (last 90 days) snapshot, unlike the weekly digest.
function statCell({ label, value }) {
  return `
                <td width="50%" style="padding:6px;">
                  <div style="background:#faf8f5; border:1px solid #e7e3db; border-radius:10px; padding:16px 18px;">
                    <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:26px; font-weight:400; color:#1C1A17; line-height:1.1;">${(Number(value) || 0).toLocaleString()}</div>
                    <div style="margin-top:5px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#9a958c;">${esc(label)}</div>
                  </div>
                </td>`
}

// Dark card listing the top searches that named the region or its towns.
// Queries are raw visitor input — escaped, truncated, counts straight from the
// RPC. Renders a grounded "quiet quarter" line when there were none.
function searchesCard(topSearches) {
  const rows = (topSearches || [])
    .filter(s => s && s.query)
    .slice(0, 5)
    .map(s => {
      const q = String(s.query).length > 60 ? `${String(s.query).slice(0, 57)}…` : String(s.query)
      const n = Number(s.count) || 0
      return `<div style="margin-top:8px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:300; line-height:1.6; color:#ffffff;">&ldquo;${esc(q)}&rdquo; <span style="color:#9a958c;">&middot; &times;${n.toLocaleString()}</span></div>`
    })

  const body = rows.length > 0
    ? rows.join('')
    : `<div style="margin-top:8px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:300; line-height:1.6; color:#ffffff;">No searches naming the region or its towns were recorded this quarter.</div>`

  return `
              <div style="margin-top:26px; background:#1C1A17; border-radius:12px; padding:20px 22px; text-align:left;">
                <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#d4a843;">What visitors searched</div>
                ${body}
              </div>`
}

/**
 * Build the quarterly "State of your region" letter.
 *
 * @param {object} args
 * @param {string} args.venueName     listing name (real DB value)
 * @param {string} args.regionName    effective region name (FK-resolved)
 * @param {string} [args.regionState] region state code, e.g. "TAS"
 * @param {string} args.quarterLabel  e.g. "Q2 2026" (the quarter just ended)
 * @param {string} args.windowLabel   the actual 90-day window, e.g. "2 April 2026 – 1 July 2026"
 * @param {object} args.regionMetrics computeRegionMetrics() output:
 *   { regionPageViews, totalClicks, totalListings, newListings,
 *     topSearches: [{ query, count }] }
 * @param {object} args.ownMetrics    { views, search_appearances } for the venue, last 90d
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function buildRegionalLetterEmail({
  venueName, regionName, regionState, quarterLabel, windowLabel, regionMetrics, ownMetrics,
}) {
  const subject = `State of ${regionName} — ${quarterLabel}`
  const rm = regionMetrics || {}
  const own = ownMetrics || {}
  const ownViews = Number(own.views) || 0
  const ownAppearances = Number(own.search_appearances) || 0

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background: #faf8f5; -webkit-text-size-adjust: 100%; }
    a { color: #5f8a7e; }
    @media only screen and (max-width: 540px) {
      .card { padding: 32px 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#faf8f5; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">The quarterly view of your region &mdash; page views, top searches, new listings, and how your own page travelled.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px; max-width:520px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
          <tr>
            <td class="card" align="left" style="padding:44px 48px 40px 48px;">

              <!-- Masthead -->
              <div style="text-align:center; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
              <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0 auto; font-size:0; line-height:0;">&nbsp;</div>

              <!-- Headline -->
              <div style="margin:30px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:#9a958c;">State of your region &middot; ${esc(quarterLabel)}</div>
              <h1 style="margin:8px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em;">${esc(regionName)}</h1>
              <div style="margin:6px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#9a958c;">${esc(regionState || '')}${regionState ? ' &middot; ' : ''}${esc(windowLabel)}</div>

              <!-- Intro -->
              <p style="${P_BODY}">Once a quarter we step back from your own numbers and look at the region around you. Here&rsquo;s how ${esc(regionName)} &mdash; the corner of the Atlas that ${esc(venueName)} calls home &mdash; travelled over the last 90 days.</p>

              <!-- Region stat cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; border-collapse:separate;">
                <tr>
${statCell({ label: 'Region page views', value: rm.regionPageViews })}
${statCell({ label: 'Clicks through to venues', value: rm.totalClicks })}
                </tr>
                <tr>
${statCell({ label: 'Active listings in region', value: rm.totalListings })}
${statCell({ label: 'New listings this quarter', value: rm.newListings })}
                </tr>
              </table>

              <!-- Top searches -->
              ${searchesCard(rm.topSearches)}

              <!-- Your venue -->
              <div style="margin-top:26px; border-left:2px solid #5f8a7e; padding:2px 0 2px 18px;">
                <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#5f8a7e;">Your venue &middot; last 90 days</div>
                <p style="margin:6px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;">${esc(venueName)} recorded ${ownViews.toLocaleString()} page view${ownViews === 1 ? '' : 's'} and appeared in ${ownAppearances.toLocaleString()} search${ownAppearances === 1 ? '' : 'es'} over the quarter.</p>
              </div>

              <!-- Closing invitation -->
              <p style="${P_BODY}">A new season is the natural moment to refresh your seasonal highlights &mdash; what&rsquo;s on right now at ${esc(venueName)} appears on your page the moment you save it.</p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${DASHBOARD_URL}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Update your highlights</a>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="${P_SMALL} margin-bottom:10px;">You&rsquo;re receiving this quarterly letter because ${esc(venueName)} holds a paid listing on Australian Atlas. Nothing here affects how visitors see search or map results &mdash; ranking can&rsquo;t be bought.</p>
              <p style="${P_SMALL}">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Questions? <a href="mailto:hello@australianatlas.com.au" style="color:#9a958c; text-decoration:underline;">hello@australianatlas.com.au</a></p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { from: FROM, replyTo: REPLY_TO, subject, html }
}

/**
 * Summary email for Matt: who got which region's letter this quarter.
 * Utilitarian agent-mail style (goes out via lib/agents/email.js sendAgentEmail).
 *
 * @param {object} args
 * @param {string}  args.quarterLabel  e.g. "Q2 2026"
 * @param {string}  args.quarterKey    YYYY-MM-DD idempotency key
 * @param {string}  args.windowLabel   human label for the 90-day window
 * @param {boolean} args.dryRun
 * @param {Array}   args.results       [{ venueName, regionName, sentTo, status,
 *                                        regionViews, ownViews, detail }]
 */
export function buildRegionalLetterSummaryHtml({ quarterLabel, quarterKey, windowLabel, dryRun, results }) {
  const sent = results.filter(r => r.status === 'sent')
  const previewed = results.filter(r => r.status === 'previewed')
  const skipped = results.filter(r => r.status === 'skipped')
  const failed = results.filter(r => r.status === 'failed')

  const STATUS_COLORS = { sent: '#16a34a', previewed: '#b45309', skipped: '#9ca3af', failed: '#dc2626' }

  const rows = results.map(r => `
    <tr>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${esc(r.venueName)}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${esc(r.regionName || '—')}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${esc(r.sentTo || '—')}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 12px; font-weight: 600; color: ${STATUS_COLORS[r.status] || '#666'};">${esc(r.status)}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px; text-align: right;">${(Number(r.regionViews) || 0).toLocaleString()}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px; text-align: right;">${(Number(r.ownViews) || 0).toLocaleString()}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${esc(r.detail || '')}</td>
    </tr>
  `).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 4px; font-size: 18px; color: #1a1a1a;">Regional Letter — ${esc(quarterLabel)}${dryRun ? ' <span style="color:#b45309;">(DRY RUN)</span>' : ''}</h2>
      <p style="margin: 0 0 16px; font-size: 13px; color: #666;">${esc(windowLabel)} &middot; idempotency key ${esc(quarterKey)} &middot; ${sent.length} sent${previewed.length ? ` &middot; ${previewed.length} previewed` : ''} &middot; ${skipped.length} skipped &middot; ${failed.length} failed</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Venue</th>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Region</th>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Sent to</th>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
          <th style="text-align: right; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Region views 90d</th>
          <th style="text-align: right; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Venue views 90d</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Note</th>
        </tr>
        ${rows}
      </table>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Sent by the Regional Letter Agent &middot; Australian Atlas</p>
    </div>
  `.trim()
}
