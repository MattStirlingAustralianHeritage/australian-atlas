# Atlas-branded Supabase Auth email

There are TWO ways to brand auth email, and this repo now uses BOTH:

- **Signup confirmation → app-side via Resend (LIVE in code, no dashboard needed).**
  `/login` and the `AuthModal` post to `app/api/auth/signup/route.js`, which mints the
  confirmation link with `admin.generateLink()` (no GoTrue email) and sends the branded
  `lib/email/authEmails.js` message via Resend. This is the path chosen for the
  "new account → verification link from Atlas" goal. See §A.
- **All other auth email (invite, magic link, recovery, email change) → still GoTrue.**
  Those remain on Supabase's built-in mailer ("Supabase Auth" sender) until you either
  enable custom SMTP in the dashboard (§1–§5 below) or move them app-side the same way
  signup was. The five staged `supabase/templates/*.html` are for the dashboard route.

**Project:** `nyhkcmvhwbydsqsyvizs` (small-batch-atlas / "australian-atlas") — the portal
master/auth-hub project.

---

## A. App-side signup confirmation (the live path)

**What it is:** public self-signup no longer calls `supabase.auth.signUp()` client-side
(which would trigger GoTrue's "Supabase Auth" email). Instead:

1. `app/login/page.js` / `components/AuthModal.js` POST `{ email, password, next }` to
   `app/api/auth/signup/route.js`.
2. The route calls `admin.generateLink({ type:'signup', email, password })` — this creates
   the unconfirmed user and returns a `hashed_token` **without sending any email**.
3. It builds a callback URL `…/auth/callback?token_hash=<hashed_token>&type=signup&next=…`
   and sends the branded `signupConfirmationEmail()` (Resend, from
   `Australian Atlas <noreply@australianatlas.com.au>`).
4. The recipient clicks → `app/auth/callback/route.js` runs `verifyOtp({type:'signup',
   token_hash})` → session → `/account`.

**Why token_hash, not the raw `action_link`:** admin-minted links carry no PKCE verifier,
so the callback's `exchangeCodeForSession` path can't complete them; the `token_hash` +
`verifyOtp` path can (and is what the callback was built for).

**Env required (all already in Vercel prod):** `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. No new env, no dashboard step.

**Design source of truth:** `lib/email/authEmails.js` mirrors `supabase/templates/confirmation.html`.
If you edit the look, edit both (keep them in sync).

**Status — LIVE on prod (updated 2026-06-10):** the app-side signup route is deployed
(`a8b6d6f`) and verification emails are sending — a real prod signup returns
`{success:true,requiresEmailConfirmation:true}` and the branded Confirm-email message
goes out via Resend. The route is also self-healing: if the Resend send ever fails it
falls back to auto-confirming the account so signup never dead-ends. Reaching this state
required (a) actually verifying `australianatlas.com.au` in Resend and (b) rotating
`RESEND_API_KEY` to a key in the **same** Resend account as the verified domain — see the
corrected note in §below. (Originally, 2026-06-05: mechanic proven in dev via a throwaway
create→verify→delete probe, but it was NOT yet deployed and no live Resend send had been
tested — that gap is now closed.)

---

## Dashboard custom-SMTP route (for the other auth emails, or to unify everything)

The sections below brand auth email at the GoTrue layer. Use them for invite / magic link /
recovery / email change, or to move signup back onto GoTrue. (If you enable this AND keep
the app-side signup route, signup still sends exactly one email — the app-side one — because
`generateLink` never sends; GoTrue would only mail signup if something calls `signUp`.)

**Why this exists:** today every auth email (invite, signup confirmation, magic link,
password recovery, email change) is generated and sent by Supabase's built-in mail
service, so the sender shows as **"Supabase Auth"** with stock templates. Routing GoTrue
through Resend re-brands all of them at once and lifts the built-in rate limit
(~3–4/hr). The domain `australianatlas.com.au` is verified in Resend **as of 2026-06-10**
(account `stirling.mattski`, region ap-northeast-1) — it was NOT before; an earlier
version of this doc wrongly asserted it was "already verified", and that false assumption
masked a full prod transactional-email outage (every `@australianatlas.com.au` send
403'd). CRITICAL: the app's `RESEND_API_KEY` must belong to the **same** Resend account as
the verified domain — a key from a different account 403s with "domain is not verified"
even while the dashboard shows the domain green.

**End state:** someone creates an account → receives a branded, editorial **verification
link from Australian Atlas** (`confirmation.html`), not a "Supabase Auth" email. That
requires BOTH the SMTP switch (§1, makes it come *from Atlas*) and Confirm-email ON (§2,
makes a verification email get *sent at all*).

---

## 1. SMTP settings — Dashboard → Authentication → Emails → SMTP Settings

Enable **Custom SMTP** and enter:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the **`RESEND_API_KEY`** value (a Resend API key *is* the SMTP password) |
| Sender email | `noreply@australianatlas.com.au` |
| Sender name | `Australian Atlas` |

Notes:
- The Resend account's `australianatlas.com.au` domain must remain verified (verified
  2026-06-10), AND `RESEND_API_KEY` must be a key from that same Resend account.
- `noreply@australianatlas.com.au` is already the `from:` used by the app's transactional
  Resend sends (e.g. `app/api/admin/claims/route.js`), so it's a known-good sender.
- Port 465 is implicit-TLS. If GoTrue reports TLS issues, 587 (STARTTLS) is the fallback;
  Resend supports both.

## 2. Require email confirmation — Dashboard → Authentication → Providers → Email

For a **new account to receive a verification link at all**, the **Confirm email** toggle
must be **ON** (Authentication → Providers → Email → *Confirm email*). Behaviour:
- **ON:** `supabase.auth.signUp()` (the `/login` "Create account" flow) creates the user in
  an *unconfirmed* state and sends the **Confirm signup** email — i.e. `confirmation.html`.
  This is the verification link this whole task is about.
- **OFF:** signups auto-confirm and **no verification email is sent** — the user is logged
  straight in.

This toggle is independent of SMTP. The end state ("new account → branded verification
link from Atlas") needs both: Confirm-email ON *and* custom SMTP enabled.

## 3. Templates — Dashboard → Authentication → Emails → Templates

Each dashboard template tab maps to one staged file. Paste the file's HTML into the
**Message body (HTML)** field and set the **Subject** to the value in the file's first
line (`<!-- Subject: … -->`). The subject comment is metadata for this mapping — it is
harmless if left in the body, but the dashboard Subject field must be set explicitly.

| Dashboard template | File | Subject |
|---|---|---|
| Invite user | `supabase/templates/invite.html` | Accept your Australian Atlas invitation |
| Confirm signup | `supabase/templates/confirmation.html` | Confirm your email · Australian Atlas |
| Magic Link | `supabase/templates/magic_link.html` | Your Australian Atlas sign-in link |
| Reset Password | `supabase/templates/recovery.html` | Reset your Australian Atlas password |
| Change Email Address | `supabase/templates/email_change.html` | Confirm your new Australian Atlas email |

Design + voice: each template uses the Atlas masthead (Playfair serif wordmark + hairline
rule), `--color-ink` pill CTA, `--color-muted` body in DM Sans, and the "part of Australian
Heritage" footer in heritage gold (`#C4973B`) — matching the About page and the app's
transactional mail. Copy is editorial and grounded in real site copy ("an independent guide
to *independent* Australia"; "the things that actually make a region interesting"). Tables +
inline CSS, single CTA, responsive at ≤540px.

GoTrue template variables used (do not hardcode links):
- Every template's CTA is `{{ .ConfirmationURL }}` (button + paste-this-link fallback).
- `magic_link.html` also surfaces `{{ .Token }}` as a one-time sign-in code (code-based
  sign-in is a recognized GoTrue flow). NOTE: the portal `/login` page does not currently
  render a code-entry field, so the code is actionable only via a future code box or
  Supabase's hosted verify — strip it if you want link-only. `recovery.html` is
  deliberately link-only (a reset code has no set-password screen to land on).
- `email_change.html` surfaces `{{ .NewEmail }}` (the new address being confirmed).

## 4. Redirect / callback compatibility

The portal callback `app/auth/callback/route.js` already handles both link styles GoTrue
emits — `?code=…` (PKCE/OAuth) via `exchangeCodeForSession`, and `?token_hash=…&type=…`
via `verifyOtp` — for every `type`: `invite`, `magiclink`, `recovery`, `signup`
(confirmation), and `email_change`. No code change is needed to adopt these templates.

Before/while toggling, confirm in **Authentication → URL Configuration**:
- **Site URL** = `https://www.australianatlas.com.au`
- **Redirect URLs** include `https://www.australianatlas.com.au/auth/callback` (and any
  preview origins in use). `{{ .ConfirmationURL }}` is built from these.

## 5. Verify after the toggles (non-destructive)

- Create a test account at `/login` → "Create account". Confirm the email arrives from
  **Australian Atlas `<noreply@australianatlas.com.au>`** (not "Supabase Auth") with the
  branded "Confirm your email" layout.
- Click **Confirm email** and confirm the link lands on `/auth/callback` and signs in
  to `/account`.
- Spot-check rendering in at least one webmail client (Gmail) and Apple Mail.
- Optional: repeat for a magic link at `/login` and an admin invite from `/admin`.

---

## Appendix — why this is dashboard-applied, not config-as-code

The installed Supabase CLI is **v2.95.6** (devDependency; no global install). Its
`config.toml` schema *does* support `[auth.email.smtp]` and `[auth.email.template.*]`.
It was **not** encoded in `supabase/config.toml` here, deliberately:

- `supabase config push` is the only mechanism that applies `config.toml` auth settings to
  a remote, and it is **holistic** — `config push --help` exposes no field/section
  selectivity. It pushes the **entire `[auth]` namespace**.
- `config.toml` is currently a bare scaffold with **no `[auth]` block**. This project's
  auth config (Google OAuth provider, Site URL, redirect allowlist, JWT/rate-limit
  settings) lives **only in the dashboard**. Pushing a `config.toml` that specifies just
  the email subset would send CLI **defaults** for everything else — resetting Site URL to
  `localhost`, disabling Google OAuth, wiping redirect URLs. That is a live-incident-grade
  footgun.
- A *clean* config-as-code adoption would first require faithfully representing the entire
  remote auth config (including OAuth client id/secret via env refs) in `config.toml` —
  a much larger, secret-laden change beyond this task. Until then, the dashboard is the
  correct apply path.

**Finding: config-as-code is NOT cleanly viable for this remote. Do not run
`supabase config push` against `nyhkcmvhwbydsqsyvizs`** unless/until the full auth config
is mirrored into `config.toml` first.

If/when that day comes, the email block would look like this (template content is read
from the staged files at push time):

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_API_KEY)"        # RESEND_API_KEY doubles as the SMTP password
admin_email = "noreply@australianatlas.com.au"
sender_name = "Australian Atlas"

[auth.email.template.invite]
subject = "Accept your Australian Atlas invitation"
content_path = "./supabase/templates/invite.html"

[auth.email.template.confirmation]
subject = "Confirm your email · Australian Atlas"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Your Australian Atlas sign-in link"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.recovery]
subject = "Reset your Australian Atlas password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.email_change]
subject = "Confirm your new Australian Atlas email"
content_path = "./supabase/templates/email_change.html"
```
