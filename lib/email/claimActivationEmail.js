// Atlas-branded "your dashboard is waiting" email for operators whose claim was
// granted but who have never signed in. Sent app-side via Resend. Same chrome as
// lib/email/claimRecoveryEmail.js / authEmails.js.
//
// Why this exists: access to a granted claim is delivered as a single-use
// Supabase invite link, and grantClaim provisions these accounts with NO
// password. Miss that one link — it lands mid-service, it expires, it goes to
// spam — and the only route back is the "Use magic link instead" toggle on
// /login, which nothing ever tells the operator about. The 2026-07-29 audit
// found the cost: of the operators who did activate, 20 of 22 did so within two
// hours of the grant, and 24 who missed that window had never returned. This
// email is the second chance, carrying a fresh working link rather than asking
// them to go hunting for one.
//
// Returns { from, replyTo, subject, html } (authEmails.js shape). Grounded only
// in the passed listing name and sign-in URL — nothing invented.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'listings@australianatlas.com.au'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const BODY_P = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`

/**
 * @param {{ listingName?: string, claimantName?: string, signInUrl: string, listingUrl?: string, paid?: boolean }} p
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function claimActivationEmail({ listingName, claimantName, signInUrl, listingUrl, paid = false } = {}) {
  const name = escapeHtml(listingName || 'your venue')
  const greetingName = claimantName ? escapeHtml(String(claimantName).split(' ')[0]) : null
  const url = signInUrl
  const subject = `Your dashboard for ${listingName || 'your venue'} is ready`

  // A paying operator is owed a different sentence than a free one: they have
  // been charged for tools they have never once been able to open.
  const tierLine = paid
    ? `<p style="${BODY_P}">Your Standard subscription is active, so the paid tools — photos, events, offers, and the search-and-AI visibility report — are all sitting there waiting for you. If anything about the subscription needs sorting out, just reply to this email and it goes straight to a person.</p>`
    : `<p style="${BODY_P}">From the dashboard you can keep your hours and contact details current, add photos, tell your story in your own words, and see how travellers are finding you.</p>`

  const bodyHtml = `
    <p style="${BODY_P}">${greetingName ? `Hi ${greetingName},` : 'Hello,'}</p>
    <p style="${BODY_P}">Your claim on <strong style="color:#1C1A17; font-weight:500;">${name}</strong> was approved and the listing is yours — but our records show you haven&rsquo;t signed in yet. The original sign-in link we sent can only be used once, so here is a fresh one.</p>
    ${tierLine}
    <p style="${BODY_P}">There&rsquo;s no password to remember. If this link ever expires, go to the sign-in page, choose <strong style="color:#1C1A17; font-weight:500;">&ldquo;Use magic link instead&rdquo;</strong>, and we&rsquo;ll email you a new one.</p>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin: 0; padding: 0; background: #faf8f5; -webkit-text-size-adjust: 100%; }
    a { color: #5f8a7e; }
    @media only screen and (max-width: 540px) { .card { padding: 32px 24px !important; } }
  </style>
</head>
<body style="margin:0; padding:0; background:#faf8f5; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">A fresh sign-in link for ${name} on the Australian Atlas.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px; max-width:520px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
          <tr>
            <td class="card" align="center" style="padding:44px 48px 40px 48px;">
              <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
              <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0 auto; font-size:0; line-height:0;">&nbsp;</div>
              <h1 style="margin:30px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em; text-align:left;">Your dashboard is ready</h1>
              <div style="text-align:left;">${bodyHtml}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${url}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Open my dashboard</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Button not working? Paste this link into your browser:</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c; word-break:break-all;"><a href="${url}" style="color:#5f8a7e; text-decoration:underline;">${url}</a></p>
              ${listingUrl ? `<p style="margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Your public listing: <a href="${listingUrl}" style="color:#5f8a7e; text-decoration:underline;">${escapeHtml(listingUrl)}</a></p>` : ''}
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Didn&rsquo;t claim this listing? Reply and we&rsquo;ll put it right.</p>
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
