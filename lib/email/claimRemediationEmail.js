// The claim-remediation email: what we say to the operators whose listings we
// marked as theirs without ever checking the email address was.
//
// ── Why the copy reads the way it does ──
//
// Before migration 265, approving a claim created ownership outright. 33
// listings still sit that way: owned, on our say-so, by an address nobody
// confirmed. Two facts shape every line here.
//
// 1. We do not know these people could not get in. Each was sent a working
//    sign-in link when their claim was approved; most simply never opened it.
//    An earlier draft said "you've had no way to sign in since you claimed it",
//    which would have been us inventing a worse fault than the real one and
//    telling the operator something they know to be untrue. The copy says "if
//    you've never managed to sign in" — a conditional, because that is the
//    actual state of our knowledge.
//
// 2. We do not know they are the right person. That is the whole point of the
//    fault: nobody checked. So the message has to offer a way OUT as plainly as
//    it offers a way in. An email that only says "here's your link" quietly
//    assumes the thing we got wrong.
//
// Tone follows the existing operator outreach: first person from Matt, short
// sentences, no apology theatre, no "we value your business". It states what
// happened, what it means, and what they can do — then stops.
//
// Returns { from, replyTo, subject, html } (authEmails.js shape).

const FROM = 'Australian Atlas <matt@australianatlas.com.au>'
const REPLY_TO = 'matt@australianatlas.com.au'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const BODY_P = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`
const STRONG = `color:#1C1A17; font-weight:500;`

/**
 * @param {{ listingName?: string, claimantName?: string, signInUrl: string,
 *           listingUrl?: string, comped?: boolean }} p
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function claimRemediationEmail({
  listingName, claimantName, signInUrl, listingUrl, comped = false,
} = {}) {
  const name = escapeHtml(listingName || 'your listing')
  const greetingName = claimantName ? escapeHtml(String(claimantName).split(' ')[0]) : null
  const url = signInUrl
  const subject = `About your ${listingName || 'listing'} claim on Australian Atlas`

  // Only for comped Standard holders, who were given paid features they may
  // never have seen. Sent one at a time, never in a batch.
  const compedLine = comped
    ? `<p style="${BODY_P}">You&rsquo;re also on a complimentary Standard listing, which you may never have had a chance to use. If you&rsquo;d rather not keep it, that&rsquo;s no trouble &mdash; just say.</p>`
    : ''

  const bodyHtml = `
    <p style="${BODY_P}">${greetingName ? `Hi ${greetingName},` : 'Hi,'}</p>

    <p style="${BODY_P}">When you claimed <strong style="${STRONG}">${name}</strong> on Australian Atlas, we marked the listing as yours before confirming that this email address belonged to you. That was a fault at our end. We&rsquo;ve since changed how claims work so it can&rsquo;t happen to anyone else, but it leaves two things worth saying to you directly.</p>

    <p style="${BODY_P}">If you&rsquo;ve never managed to sign in and use the listing, the link below will take you straight in. There&rsquo;s no password to set up.</p>`

  const afterCta = `
    <p style="${BODY_P}">And if this listing isn&rsquo;t yours &mdash; if it was claimed on your behalf, or claimed in error &mdash; reply to this email and I&rsquo;ll take it off your account the same day. We should have confirmed that with you at the time, and we didn&rsquo;t.</p>
    ${compedLine}
    <p style="${BODY_P}">Either way, nothing about how <strong style="${STRONG}">${name}</strong> appears publicly has changed.</p>
    <p style="${BODY_P}">Matt<br><span style="color:#9a958c;">Australian Atlas</span></p>`

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
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">We marked ${name} as yours before checking this address was. Here&rsquo;s how to finish it, or hand it back.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px; max-width:520px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
          <tr>
            <td class="card" align="center" style="padding:44px 48px 40px 48px;">
              <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; font-weight:400; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
              <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0 auto; font-size:0; line-height:0;">&nbsp;</div>
              <h1 style="margin:30px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em; text-align:left;">Something we got wrong</h1>
              <div style="text-align:left;">${bodyHtml}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${url}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Sign in to ${name}</a>
                  </td>
                </tr>
              </table>
              <div style="text-align:left;">${afterCta}</div>
              <p style="margin:28px 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Button not working? Paste this link into your browser:</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c; word-break:break-all;"><a href="${url}" style="color:#5f8a7e; text-decoration:underline;">${url}</a></p>
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">This link confirms your email and asks you to set a password. If it has expired, use &ldquo;Forgot password?&rdquo; at <a href="https://www.australianatlas.com.au/login" style="color:#5f8a7e;">australianatlas.com.au/login</a> for a fresh one.${listingUrl ? `<br>Your public listing: <a href="${listingUrl}" style="color:#5f8a7e;">${escapeHtml(listingUrl)}</a>` : ''}</p>
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
