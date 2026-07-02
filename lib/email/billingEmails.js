// Atlas-branded billing-lifecycle emails for paid LISTING claims, sent
// app-side via Resend — same chrome as lib/email/authEmails.js (Playfair
// Display masthead, DM Sans body, #1C1A17 ink / #5f8a7e sage / #d4a843 amber).
// If you change the design there, change it here.
//
// Three moments in the subscription lifecycle:
//   paymentFailedEmail    — a renewal charge failed; grace period is on
//                           (Standard benefits stay live while Stripe retries)
//   renewalReminderEmail  — pre-renewal "year in review" digest; takes a stats
//                           object of REAL numbers pulled from the DB by the
//                           caller (nothing is invented here — absent stats are
//                           simply not rendered)
//   winBackEmail          — subscription ended; the listing is still on the
//                           Atlas, invite the operator back to Standard
//
// Each builder returns { from, replyTo, subject, html } (authEmails.js shape).
// sendBillingEmail() is the shared sender: graceful no-op when RESEND_API_KEY
// is missing (mirrors lib/agents/email.js), never throws.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'listings@australianatlas.com.au'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// Operator-facing billing surface: /dashboard/subscription hosts the "open
// billing portal" button (POST /api/dashboard/billing-portal → Stripe portal).
const BILLING_URL = `${SITE_URL}/dashboard/subscription`

// DB text (listing names etc.) goes through this before hitting HTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const BODY_P = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`
const BODY_P2 = `margin:14px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`

// Shared Atlas-branded chrome — masthead / headline / body / CTA / footer.
// Mirrors renderAuthEmail in lib/email/authEmails.js.
function renderBillingEmail({ title, preheader, headline, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #faf8f5; -webkit-text-size-adjust: 100%; }
    a { color: #5f8a7e; }
    @media only screen and (max-width: 540px) {
      .card { padding: 32px 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#faf8f5; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px; max-width:520px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
          <tr>
            <td class="card" align="center" style="padding:44px 48px 40px 48px;">

              <!-- Masthead -->
              <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
              <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0 auto; font-size:0; line-height:0;">&nbsp;</div>

              <!-- Headline -->
              <h1 style="margin:30px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em;">${headline}</h1>

              <!-- Body -->
              ${bodyHtml}

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${ctaUrl}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:28px 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Button not working? Paste this link into your browser:</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c; word-break:break-all;"><a href="${ctaUrl}" style="color:#5f8a7e; text-decoration:underline;">${ctaUrl}</a></p>

              <!-- Footer -->
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="margin:0 0 10px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">${footerNote}</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Questions? <a href="mailto:listings@australianatlas.com.au" style="color:#9a958c; text-decoration:underline;">listings@australianatlas.com.au</a></p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Stats table (year-in-review) ────────────────────────────────────────────

const STAT_LABELS = {
  pageviews: 'Page views',
  page_views: 'Page views',
  views: 'Page views',
  website_clicks: 'Website clicks',
  directions_clicks: 'Directions clicks',
  saves: 'Saves',
  search_appearances: 'Search appearances',
  gallery_photos: 'Gallery photos live',
}

function humaniseStatKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase())
}

// Renders ONLY finite numeric values the caller actually passed — the caller
// is responsible for pulling them from real DB records (pageviews etc.).
// Unknown keys get a humanised label; nothing is ever invented or defaulted.
function renderStatsRows(stats) {
  const entries = Object.entries(stats || {}).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v)
  )
  if (entries.length === 0) return ''
  const rows = entries.map(([key, value]) => `
                <tr>
                  <td style="padding:10px 0; border-bottom:1px solid #ece8e1; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:13px; font-weight:300; color:#6B6760; text-align:left;">${escapeHtml(STAT_LABELS[key] || humaniseStatKey(key))}</td>
                  <td style="padding:10px 0; border-bottom:1px solid #ece8e1; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:17px; font-weight:400; color:#1C1A17; text-align:right;">${value.toLocaleString('en-AU')}</td>
                </tr>`).join('')
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0; border-top:2px solid #d4a843;">${rows}
              </table>`
}

// ─── Builders ────────────────────────────────────────────────────────────────

/**
 * Renewal payment failed — grace period is on. Standard benefits stay live
 * while Stripe retries; the operator just needs to update their card.
 * @param {{ listingName?: string, verticalName?: string }} args  real DB fields only
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function paymentFailedEmail({ listingName, verticalName } = {}) {
  const safeName = escapeHtml(listingName || 'your listing')
  const safeVertical = escapeHtml(verticalName || 'Australian Atlas')
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: `Payment issue for ${listingName || 'your listing'} — your benefits stay live for now`,
    html: renderBillingEmail({
      title: 'Payment issue · Australian Atlas',
      preheader: 'A renewal payment didn&rsquo;t go through. Your Standard benefits stay live for now &mdash; just update your card.',
      headline: 'A payment didn&rsquo;t go through',
      bodyHtml: `<p style="${BODY_P}">We couldn&rsquo;t process the renewal payment for <strong>${safeName}</strong> on <strong>${safeVertical}</strong>. This is usually an expired or replaced card &mdash; nothing dramatic.</p>
              <p style="${BODY_P2}">Your <strong>Standard benefits stay live for now</strong> while the payment retries. To keep everything running, update your card via the billing portal &mdash; it takes about a minute.</p>`,
      ctaLabel: 'Update your card', ctaUrl: BILLING_URL,
      footerNote: 'If you&rsquo;ve already updated your payment details, you can safely ignore this email &mdash; the next retry will pick them up.',
    }),
  }
}

/**
 * Pre-renewal "year in review" digest — sent ahead of the annual renewal.
 * @param {{
 *   listingName?: string,
 *   verticalName?: string,
 *   renewalDate?: string|Date,  // billing_cycle_end from listing_claims
 *   stats?: Object,             // real numbers from the DB (pageviews etc.);
 *                               // only finite numeric values are rendered
 * }} args
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function renewalReminderEmail({ listingName, verticalName, renewalDate, stats } = {}) {
  const safeName = escapeHtml(listingName || 'your listing')
  const safeVertical = escapeHtml(verticalName || 'Australian Atlas')
  const statsRows = renderStatsRows(stats)

  let renewalLine = ''
  if (renewalDate) {
    const d = new Date(renewalDate)
    if (!Number.isNaN(d.getTime())) {
      const formatted = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      renewalLine = `<p style="${BODY_P2}">Your Standard plan renews on <strong>${escapeHtml(formatted)}</strong>. Nothing to do if your card is current &mdash; and you can review or change your plan any time.</p>`
    }
  }
  if (!renewalLine) {
    renewalLine = `<p style="${BODY_P2}">Your Standard plan renews soon. Nothing to do if your card is current &mdash; and you can review or change your plan any time.</p>`
  }

  return {
    from: FROM, replyTo: REPLY_TO,
    subject: 'Your Atlas year in review — renewing soon',
    html: renderBillingEmail({
      title: 'Your Atlas year in review · Australian Atlas',
      preheader: 'A look at the year for your listing &mdash; and a heads-up that your Standard plan renews soon.',
      headline: 'Your Atlas year in review',
      bodyHtml: `<p style="${BODY_P}">A year on the Atlas for <strong>${safeName}</strong> on <strong>${safeVertical}</strong>. Here&rsquo;s what it added up to:</p>
              ${statsRows}
              ${renewalLine}`,
      ctaLabel: 'Manage your subscription', ctaUrl: BILLING_URL,
      footerNote: 'You&rsquo;re receiving this because you hold the Standard plan for this listing.',
    }),
  }
}

/**
 * Win-back — the subscription has ended (cancelled or retries exhausted).
 * The listing remains on the Atlas; invite the operator back to Standard.
 * @param {{ listingName?: string, verticalName?: string }} args  real DB fields only
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function winBackEmail({ listingName, verticalName } = {}) {
  const safeName = escapeHtml(listingName || 'your listing')
  const safeVertical = escapeHtml(verticalName || 'Australian Atlas')
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: `${listingName || 'Your listing'} is still on the Atlas — pick up where you left off`,
    html: renderBillingEmail({
      title: 'Still on the Atlas · Australian Atlas',
      preheader: 'Your Standard plan has ended, but your listing is still here. Reactivate any time.',
      headline: 'Still on the map',
      bodyHtml: `<p style="${BODY_P}"><strong>${safeName}</strong> is still listed on <strong>${safeVertical}</strong> &mdash; travellers can still find it. What&rsquo;s ended is your Standard plan: editing, your photo gallery, and the rest of the operator tools are paused.</p>
              <p style="${BODY_P2}">Reactivating takes a couple of minutes and picks up exactly where you left off &mdash; your details and photos are kept as they were.</p>`,
      ctaLabel: 'Reactivate Standard', ctaUrl: BILLING_URL,
      footerNote: 'If you&rsquo;d rather we didn&rsquo;t write about this listing again, just reply and let us know.',
    }),
  }
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send a billing email built by one of the helpers above via Resend.
 * Graceful no-op when RESEND_API_KEY is missing (mirrors lib/agents/email.js);
 * never throws — billing emails must not fail a Stripe webhook.
 * @param {string} to        recipient address (listing_claims.claimant_email)
 * @param {{ from: string, replyTo: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendBillingEmail(to, message) {
  if (!to || !message?.html) return { sent: false }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[billing-email] RESEND_API_KEY not set — skipping email')
    return { sent: false }
  }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: message.from || FROM,
      replyTo: message.replyTo || REPLY_TO,
      to,
      subject: message.subject,
      html: message.html,
    })
    if (error) throw new Error(error.message || 'send failed')
    console.log(`[billing-email] Sent: ${message.subject} → ${to}`)
    return { sent: true }
  } catch (err) {
    console.error(`[billing-email] Failed to send: ${err.message}`)
    return { sent: false }
  }
}
