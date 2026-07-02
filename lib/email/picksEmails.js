// Atlas-branded Producer Picks reciprocity email, sent app-side via Resend —
// same chrome as lib/email/authEmails.js (Playfair Display masthead, DM Sans
// body, #1C1A17 ink / #5f8a7e sage / #d4a843 amber). If you change the design
// there, change it here.
//
// One moment: a PAID operator has just added another venue to their Producer
// Picks, and the picked venue is CLAIMED — so we tell its claimant the good
// news. Everything rendered is grounded in real DB fields passed by the
// caller (listing names + slug from the master `listings` table); nothing is
// invented, and nothing about the picker is revealed beyond their public
// venue name.
//
// The builder returns { from, replyTo, subject, html } (authEmails.js shape).
// sendPicksEmail() is the shared sender: graceful no-op when RESEND_API_KEY
// is missing (mirrors lib/agents/email.js), never throws — the picks API must
// never fail because of email.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'hello@australianatlas.com.au'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// Operator self-service home — where the claimant manages their listing.
const DASHBOARD_URL = `${SITE_URL}/dashboard`

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
function renderPicksEmail({ title, preheader, headline, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
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
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Questions? <a href="mailto:hello@australianatlas.com.au" style="color:#9a958c; text-decoration:underline;">hello@australianatlas.com.au</a></p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * "You've been recommended" — a paid operator added the recipient's venue to
 * their Producer Picks, and the recipient holds the claim for it.
 *
 * All args are REAL DB fields (master `listings` rows hydrated by
 * lib/picks/producerPicks.js). The only picker data disclosed is their public
 * venue name.
 *
 * @param {{
 *   pickerName: string,   // the vouching venue's public listing name
 *   pickedName: string,   // the recipient's venue name
 *   pickedSlug?: string,  // the recipient's portal slug → /place/[slug]
 * }} args
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function pickRecommendationEmail({ pickerName, pickedName, pickedSlug } = {}) {
  const safePicker = escapeHtml(pickerName)
  const safePicked = escapeHtml(pickedName || 'your venue')
  const placeUrl = pickedSlug ? `${SITE_URL}/place/${pickedSlug}` : DASHBOARD_URL
  const ctaLabel = pickedSlug ? 'See your place page' : 'Open your dashboard'

  return {
    from: FROM, replyTo: REPLY_TO,
    subject: `${pickerName} recommends you on the Australian Atlas`,
    html: renderPicksEmail({
      title: 'A fellow operator recommends you · Australian Atlas',
      preheader: `${safePicker} has added ${safePicked} to their Producer Picks &mdash; a public recommendation, live on the Atlas.`,
      headline: 'A fellow operator recommends you',
      bodyHtml: `<p style="${BODY_P}"><strong>${safePicker}</strong> has added <strong>${safePicked}</strong> to their Producer Picks on the Australian Atlas &mdash; a public, name-attached recommendation from one independent operator to another.</p>
              <p style="${BODY_P2}">Recommendations like this are how the Atlas surfaces who the makers themselves rate. You can see how your venue appears on your place page, or manage your listing any time from <a href="${DASHBOARD_URL}" style="color:#5f8a7e;">your dashboard</a>.</p>`,
      ctaLabel, ctaUrl: placeUrl,
      footerNote: 'Producer Picks are operator-attributed recommendations &mdash; they never affect search or map ranking on the Atlas. You&rsquo;re receiving this one-off note because your venue is claimed on the Australian Atlas.',
    }),
  }
}

// ─── Sender ──────────────────────────────────────────────────────────────────

/**
 * Send a picks email built by the helper above via Resend.
 * Graceful no-op when RESEND_API_KEY is missing (mirrors lib/agents/email.js);
 * never throws — the picks API must never fail because of email.
 * @param {string} to        recipient address (listing_claims.claimant_email)
 * @param {{ from: string, replyTo: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendPicksEmail(to, message) {
  if (!to || !message?.html) return { sent: false }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[picks-email] RESEND_API_KEY not set — skipping email')
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
    console.log(`[picks-email] Sent: ${message.subject} → ${to}`)
    return { sent: true }
  } catch (err) {
    console.error(`[picks-email] Failed to send: ${err.message}`)
    return { sent: false }
  }
}
