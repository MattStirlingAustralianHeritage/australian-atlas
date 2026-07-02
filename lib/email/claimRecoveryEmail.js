// Atlas-branded "finish your claim" recovery email for abandoned paid claims,
// sent app-side via Resend. Same chrome as lib/email/billingEmails.js /
// authEmails.js (Playfair Display masthead, DM Sans body, ink/sage/amber).
//
// Returns { from, replyTo, subject, html } (authEmails.js shape). Grounded only
// in the passed listing name + claim URL — nothing invented.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'listings@australianatlas.com.au'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const BODY_P = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`

/**
 * @param {{ listingName?: string, claimantName?: string, claimUrl: string }} p
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function claimRecoveryEmail({ listingName, claimantName, claimUrl } = {}) {
  const name = escapeHtml(listingName || 'your venue')
  const greetingName = claimantName ? escapeHtml(String(claimantName).split(' ')[0]) : null
  const url = claimUrl
  const subject = `Your claim for ${listingName || 'your venue'} is saved — one step left`

  const bodyHtml = `
    <p style="${BODY_P}">${greetingName ? `Hi ${greetingName},` : 'Hello,'}</p>
    <p style="${BODY_P}">You started claiming <strong style="color:#1C1A17; font-weight:500;">${name}</strong> on the Australian Atlas — we&rsquo;ve held your place, but the Standard subscription wasn&rsquo;t finished. It only takes a couple of minutes to complete.</p>
    <p style="${BODY_P}">Standard lets you tell your story, add photos and events, list current offers, and see the only report of its kind — how searchers and AI assistants are already finding your venue. Your ranking is never affected; it&rsquo;s earned on merit.</p>
    <p style="${BODY_P}">Not ready for Standard? You can claim <strong style="color:#1C1A17; font-weight:500;">${name}</strong> for free from the same page and keep your hours and contact details current.</p>`

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
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">Finish claiming ${name} on the Australian Atlas.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px; max-width:520px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
          <tr>
            <td class="card" align="center" style="padding:44px 48px 40px 48px;">
              <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
              <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0 auto; font-size:0; line-height:0;">&nbsp;</div>
              <h1 style="margin:30px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em; text-align:left;">One step left</h1>
              <div style="text-align:left;">${bodyHtml}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${url}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Finish your claim</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Button not working? Paste this link into your browser:</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c; word-break:break-all;"><a href="${url}" style="color:#5f8a7e; text-decoration:underline;">${url}</a></p>
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Didn&rsquo;t start this? You can ignore this email &mdash; nothing happens without you.</p>
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
