// "Your Atlas Week" — weekly digest email for PAID operators, template helpers.
//
// Branded to match lib/email/authEmails.js exactly (Playfair Display masthead,
// DM Sans body, #1C1A17 ink / #5f8a7e sage / #d4a843 gold on the #faf8f5 cream
// ground). Sent via Resend by app/api/cron/operator-digest/route.js.
//
// Everything rendered here is grounded in real DB numbers computed by the
// cron — no invented facts, no hype. Deltas compare the last 7 days against
// the 7 days before.

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

// "▲ 4 on last week" / "▼ 2 on last week" / "level with last week".
// Sage for up, muted warm grey otherwise — no alarm colours in a warm digest.
function deltaLine(current, previous) {
  const cur = Number(current) || 0
  const prev = Number(previous) || 0
  const diff = cur - prev
  if (diff > 0) return `<span style="color:#5f8a7e;">&#9650; ${diff.toLocaleString()} on last week</span>`
  if (diff < 0) return `<span style="color:#9a958c;">&#9660; ${Math.abs(diff).toLocaleString()} on last week</span>`
  return `<span style="color:#9a958c;">level with last week</span>`
}

// One stat cell: big Playfair number, small-caps label, delta line beneath.
function statCell({ label, current, previous }) {
  return `
                <td width="50%" style="padding:6px;">
                  <div style="background:#faf8f5; border:1px solid #e7e3db; border-radius:10px; padding:16px 18px;">
                    <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:26px; font-weight:400; color:#1C1A17; line-height:1.1;">${(Number(current) || 0).toLocaleString()}</div>
                    <div style="margin-top:5px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#9a958c;">${esc(label)}</div>
                    <div style="margin-top:4px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300;">${deltaLine(current, previous)}</div>
                  </div>
                </td>`
}

// The AI-visibility strip: dark card, gold number. All three states are
// grounded — live conversations, crawler-only weeks, and quiet weeks.
function aiStrip(ai) {
  const live = Number(ai?.live?.current) || 0
  const crawl = Number(ai?.crawl?.current) || 0
  const crawlers = ai?.crawlers_7d || {}

  let headline
  if (live > 0) {
    headline = `Your page was pulled into <span style="color:#d4a843;">${live.toLocaleString()} live AI conversation${live === 1 ? '' : 's'}</span> this week.`
  } else if (crawl > 0) {
    headline = `AI crawlers fetched your page <span style="color:#d4a843;">${crawl.toLocaleString()} time${crawl === 1 ? '' : 's'}</span> this week, keeping assistants&rsquo; knowledge of your listing current.`
  } else {
    headline = `No AI fetches were recorded for your page this week.`
  }

  let breakdown = ''
  if (crawl > 0) {
    const parts = []
    for (const name of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
      const n = Number(crawlers[name]) || 0
      if (n > 0) parts.push(`${esc(name)} &times;${n.toLocaleString()}`)
    }
    const others = Number(crawlers.others) || 0
    if (others > 0) parts.push(`others &times;${others.toLocaleString()}`)
    if (live > 0) parts.unshift(`index crawlers &times;${crawl.toLocaleString()}`)
    if (parts.length > 0) {
      breakdown = `<div style="margin-top:8px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">${parts.join(' &middot; ')}</div>`
    }
  }

  return `
              <div style="margin-top:26px; background:#1C1A17; border-radius:12px; padding:20px 22px; text-align:left;">
                <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#d4a843;">AI visibility</div>
                <div style="margin-top:8px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.6; color:#ffffff;">${headline}</div>
                ${breakdown}
              </div>`
}

/**
 * Build the operator digest email.
 *
 * @param {object} args
 * @param {string} args.venueName    listing name (real DB value)
 * @param {string} args.weekLabel    e.g. "22–28 June 2026"
 * @param {object} args.metrics      snapshot computed by the cron:
 *   { views: {current, previous}, unique_visitors: {current, previous},
 *     search_appearances: {current, previous}, saves: {current, previous},
 *     ai: { live: {current, previous}, crawl: {current, previous},
 *           crawlers_7d: { GPTBot, ClaudeBot, PerplexityBot, others } },
 *     upcoming_events: n }
 * @param {string} args.actionText   rule-based "one thing worth doing" line
 * @param {string} [args.introText]  optional opening sentence (AI-composed from
 *                                   the metrics, or the deterministic fallback)
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function buildOperatorDigestEmail({ venueName, weekLabel, metrics, actionText, introText }) {
  const subject = `Your Atlas Week — ${venueName}`
  const m = metrics || {}
  const intro = introText || `Here&rsquo;s how ${esc(venueName)} travelled on the Atlas this week.`
  const upcomingEvents = Number(m.upcoming_events) || 0

  const eventsLine = upcomingEvents > 0
    ? `<p style="${P_BODY} margin-top:14px;">${upcomingEvents.toLocaleString()} upcoming event${upcomingEvents === 1 ? ' is' : 's are'} live on your page.</p>`
    : ''

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
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">Your week on the Atlas &mdash; page views, searches, saves, and where AI assistants pulled your page.</div>
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
              <div style="margin:30px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:#9a958c;">Your Atlas Week &middot; ${esc(weekLabel)}</div>
              <h1 style="margin:8px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em;">${esc(venueName)}</h1>

              <!-- Intro -->
              <p style="${P_BODY}">${intro}</p>

              <!-- Stat cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; border-collapse:separate;">
                <tr>
${statCell({ label: 'Page views', current: m.views?.current, previous: m.views?.previous })}
${statCell({ label: 'Unique visitors', current: m.unique_visitors?.current, previous: m.unique_visitors?.previous })}
                </tr>
                <tr>
${statCell({ label: 'Search appearances', current: m.search_appearances?.current, previous: m.search_appearances?.previous })}
${statCell({ label: 'Saves', current: m.saves?.current, previous: m.saves?.previous })}
                </tr>
              </table>

              <!-- AI visibility strip -->
              ${aiStrip(m.ai)}

              ${eventsLine}

              <!-- One thing worth doing -->
              <div style="margin-top:26px; border-left:2px solid #5f8a7e; padding:2px 0 2px 18px;">
                <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:#5f8a7e;">One thing worth doing this week</div>
                <p style="margin:6px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;">${esc(actionText)}</p>
              </div>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${DASHBOARD_URL}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Open your dashboard</a>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="${P_SMALL} margin-bottom:10px;">You&rsquo;re receiving this weekly digest because ${esc(venueName)} holds a paid listing on Australian Atlas. Nothing here affects how visitors see search or map results &mdash; ranking can&rsquo;t be bought.</p>
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
 * Summary email for Matt: who got what this week. Utilitarian agent-mail
 * style (goes out via lib/agents/email.js sendAgentEmail).
 *
 * @param {object} args
 * @param {string}  args.weekStart  YYYY-MM-DD idempotency key
 * @param {string}  args.weekLabel  human label for the window
 * @param {boolean} args.dryRun
 * @param {Array}   args.results    [{ venueName, sentTo, status, views, viewsPrev,
 *                                     liveAi, crawlAi, action, detail }]
 */
export function buildOperatorDigestSummaryHtml({ weekStart, weekLabel, dryRun, results }) {
  const sent = results.filter(r => r.status === 'sent')
  const previewed = results.filter(r => r.status === 'previewed')
  const skipped = results.filter(r => r.status === 'skipped')
  const failed = results.filter(r => r.status === 'failed')

  const STATUS_COLORS = { sent: '#16a34a', previewed: '#b45309', skipped: '#9ca3af', failed: '#dc2626' }

  const rows = results.map(r => `
    <tr>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">${esc(r.venueName)}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${esc(r.sentTo || '—')}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 12px; font-weight: 600; color: ${STATUS_COLORS[r.status] || '#666'};">${esc(r.status)}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px; text-align: right;">${(Number(r.views) || 0).toLocaleString()}</td>
      <td style="padding: 8px 8px 8px 0; border-bottom: 1px solid #eee; font-size: 13px; text-align: right;">${(Number(r.liveAi) || 0).toLocaleString()} / ${(Number(r.crawlAi) || 0).toLocaleString()}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${esc(r.detail || r.action || '')}</td>
    </tr>
  `).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 4px; font-size: 18px; color: #1a1a1a;">Operator Digest — week of ${esc(weekStart)}${dryRun ? ' <span style="color:#b45309;">(DRY RUN)</span>' : ''}</h2>
      <p style="margin: 0 0 16px; font-size: 13px; color: #666;">${esc(weekLabel)} &middot; ${sent.length} sent${previewed.length ? ` &middot; ${previewed.length} previewed` : ''} &middot; ${skipped.length} skipped &middot; ${failed.length} failed</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Venue</th>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Sent to</th>
          <th style="text-align: left; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
          <th style="text-align: right; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Views 7d</th>
          <th style="text-align: right; padding: 8px 8px 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">AI live/crawl</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Note</th>
        </tr>
        ${rows}
      </table>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Sent by the Operator Digest Agent &middot; Australian Atlas</p>
    </div>
  `.trim()
}
