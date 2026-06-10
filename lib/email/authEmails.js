// Atlas-branded auth emails sent APP-SIDE via Resend (not by Supabase/GoTrue).
//
// These mirror the GoTrue templates in supabase/templates/*.html so the look
// is identical whether mail goes out app-side (current path) or one day via
// Supabase custom SMTP (the dashboard option in docs/auth-email-setup.md).
// If you change the design in one place, change it in both.
//
// The only difference vs the .html templates is the link: GoTrue injects
// `{{ .ConfirmationURL }}`; here the caller passes a real, fully-built URL.

const FROM = 'Australian Atlas <noreply@australianatlas.com.au>'
const REPLY_TO = 'hello@australianatlas.com.au'

/**
 * Signup email-confirmation message.
 * @param {{ confirmationUrl: string }} args  fully-built verify URL (token_hash flow)
 * @returns {{ from: string, replyTo: string, subject: string, html: string }}
 */
export function signupConfirmationEmail({ confirmationUrl }) {
  const subject = 'Confirm your email · Australian Atlas'
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Confirm your email · Australian Atlas</title>
  <style>
    body { margin: 0; padding: 0; background: #faf8f5; -webkit-text-size-adjust: 100%; }
    a { color: #5f8a7e; }
    @media only screen and (max-width: 540px) {
      .card { padding: 32px 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#faf8f5; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">Confirm your address to activate your account &mdash; then save places, build trails, and plan trips.</div>
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
              <h1 style="margin:30px 0 0 0; font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:27px; font-weight:400; color:#1C1A17; line-height:1.2; letter-spacing:-0.01em;">Confirm your email</h1>

              <!-- Body -->
              <p style="margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;">Welcome to Australian Atlas, an independent guide to <em style="font-style:italic;">independent</em> Australia. Confirm your email address to activate your account.</p>
              <p style="margin:14px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;">From there you can save the places worth knowing about, build your own trails, and plan trips around the things that actually make a region interesting.</p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 0 auto;">
                <tr>
                  <td align="center" bgcolor="#1C1A17" style="border-radius:999px;">
                    <a href="${confirmationUrl}" style="display:inline-block; padding:15px 38px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:999px;">Confirm email</a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:28px 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Button not working? Paste this link into your browser:</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c; word-break:break-all;"><a href="${confirmationUrl}" style="color:#5f8a7e; text-decoration:underline;">${confirmationUrl}</a></p>

              <!-- Footer -->
              <div style="width:100%; height:1px; background:#ece8e1; margin:34px 0 20px 0; font-size:0; line-height:0;">&nbsp;</div>
              <p style="margin:0 0 10px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">If you didn&rsquo;t create an account, you can safely ignore this email.</p>
              <p style="margin:0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:300; line-height:1.6; color:#9a958c;">Australian Atlas &middot; part of <a href="https://australianheritage.au" style="color:#C4973B; text-decoration:none;">Australian Heritage</a><br>Questions? <a href="mailto:hello@australianatlas.com.au" style="color:#9a958c; text-decoration:underline;">hello@australianatlas.com.au</a></p>

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

// Shared Atlas-branded chrome for the other auth emails (magic link, recovery,
// invite). Mirrors the masthead/CTA/footer of signupConfirmationEmail above and
// the staged supabase/templates/*.html. `bodyHtml` is one or more <p> blocks.
function renderAuthEmail({ title, preheader, headline, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
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

const BODY_P = `margin:18px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`
const BODY_P2 = `margin:14px 0 0 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:300; line-height:1.7; color:#6B6760;`

/** Passwordless sign-in (magic link). Link-only — /login has no code-entry field. */
export function magicLinkEmail({ url }) {
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: 'Your Australian Atlas sign-in link',
    html: renderAuthEmail({
      title: 'Your Australian Atlas sign-in link',
      preheader: 'Your one-time sign-in link for Australian Atlas. Valid for one hour.',
      headline: 'Sign in to Australian Atlas',
      bodyHtml: `<p style="${BODY_P}">Use the button below to sign in. The link is valid for one hour and can be used once.</p>`,
      ctaLabel: 'Sign in', ctaUrl: url,
      footerNote: 'If you didn&rsquo;t request this link, you can safely ignore this email.',
    }),
  }
}

/** Password reset (recovery). */
export function recoveryEmail({ url }) {
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: 'Reset your Australian Atlas password',
    html: renderAuthEmail({
      title: 'Reset your Australian Atlas password',
      preheader: 'Reset the password for your Australian Atlas account. Valid for one hour.',
      headline: 'Reset your password',
      bodyHtml: `<p style="${BODY_P}">We received a request to reset the password for your Australian Atlas account. Choose a new one using the button below. The link is valid for one hour.</p>`,
      ctaLabel: 'Reset password', ctaUrl: url,
      footerNote: 'If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t change.',
    }),
  }
}

/** Operator invite (claim approval provisions the account). */
export function inviteEmail({ url }) {
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: 'Accept your Australian Atlas invitation',
    html: renderAuthEmail({
      title: 'Accept your Australian Atlas invitation',
      preheader: 'Accept your Australian Atlas invitation.',
      headline: 'You&rsquo;ve been invited',
      bodyHtml: `<p style="${BODY_P}">An account has been opened for you on Australian Atlas, an independent guide to <em style="font-style:italic;">independent</em> Australia. Accept the invitation to set a password and reach your dashboard.</p>
              <p style="${BODY_P2}">From there you can manage your listing &mdash; update details, add photography, and keep your information current.</p>`,
      ctaLabel: 'Accept invitation', ctaUrl: url,
      footerNote: 'If you weren&rsquo;t expecting this invitation, you can safely ignore this email.',
    }),
  }
}

/** Newsletter double opt-in confirmation. */
export function newsletterConfirmEmail({ url }) {
  return {
    from: FROM, replyTo: REPLY_TO,
    subject: 'Confirm your Australian Atlas subscription',
    html: renderAuthEmail({
      title: 'Confirm your Australian Atlas subscription',
      preheader: 'One click to confirm — then one independent place, every week.',
      headline: 'Confirm your subscription',
      bodyHtml: `<p style="${BODY_P}">You&rsquo;re one click from <em style="font-style:italic;">one independent place, every week</em> &mdash; new openings, the occasional essay, and the quiet finds worth a detour.</p>
              <p style="${BODY_P2}">One considered email a week. No noise, no algorithms.</p>`,
      ctaLabel: 'Confirm subscription', ctaUrl: url,
      footerNote: 'If you didn&rsquo;t sign up for this, you can safely ignore this email &mdash; nothing will be sent.',
    }),
  }
}
