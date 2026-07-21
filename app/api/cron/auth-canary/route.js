import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/auth-canary
 *
 * Synthetic end-to-end probe of the account-recovery path. Born from the
 * password-reset dead end (fixed 2026-07-21, commit 6825b9e): for months a
 * recovery link only minted a session on the machine it was opened on — the
 * password itself was never changed — so locked-out operators stayed locked
 * out everywhere else, and nothing on the platform noticed. This canary
 * exercises the REAL production flow daily with a dedicated inert account,
 * so a regression is an email the same day, not a support thread weeks later.
 *
 * Probes (each is a named check; any failure alerts):
 *   1. canary_user     — the canary auth user exists (auto-created on first
 *                        run, email-confirmed, random password).
 *   2. recovery_link   — auth admin generateLink(type 'recovery') mints a
 *                        token: Supabase Auth is up and can issue resets.
 *   3. callback_redirect — following /auth/callback?token_hash=..&type=recovery
 *                        (a REAL one-time token, consumed by this request)
 *                        302s to /auth/update-password. This is the exact
 *                        invariant that was broken: a recovery link must land
 *                        on the set-new-password screen, never straight into
 *                        a session.
 *   4. update_password_page — /auth/update-password serves 200 and contains
 *                        the set-password copy (the page exists and deployed).
 *   5. magiclink       — generateLink(type 'magiclink') mints a token: the
 *                        break-glass no-password sign-in path works. The
 *                        token is never followed; it just expires.
 *
 * The canary account's password is rotated to a fresh random value every run
 * so the account stays inert. No email is ever sent to it (generateLink does
 * not send mail).
 *
 * ?dryRun=1 runs every probe but never emails. Auth: Bearer CRON_SECRET
 */

export const maxDuration = 120

const AGENT_NAME = 'auth-canary'
const CANARY_EMAIL = process.env.AUTH_CANARY_EMAIL || 'auth-canary@australianatlas.com.au'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

function randomPassword() {
  return `Canary-${globalThis.crypto.randomUUID()}-${globalThis.crypto.randomUUID()}`
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const checks = [] // { check, ok, detail }
  let canaryUserId = null

  try {
    // ── 1+2. Recovery link for the canary user (created on first run) ──
    let linkRes = await sb.auth.admin.generateLink({
      type: 'recovery',
      email: CANARY_EMAIL,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
    })
    if (linkRes.error && (linkRes.error.status === 404 || /not found/i.test(linkRes.error.message || ''))) {
      // No canary user yet. admin.createUser 500s on this project (signup
      // trigger), but generateLink(magiclink) auto-creates the user and is
      // the path verified to work — mint one (discarded), then retry recovery.
      const { data: seeded, error: seedErr } = await sb.auth.admin.generateLink({
        type: 'magiclink',
        email: CANARY_EMAIL,
        options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
      })
      if (seedErr) {
        checks.push({ check: 'canary_user', ok: false, detail: `magiclink auto-create failed: ${seedErr.message}` })
      } else {
        canaryUserId = seeded?.user?.id || null
        checks.push({ check: 'canary_user', ok: true, detail: 'created on this run (magiclink auto-create)' })
        linkRes = await sb.auth.admin.generateLink({
          type: 'recovery',
          email: CANARY_EMAIL,
          options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
        })
      }
    } else {
      checks.push({ check: 'canary_user', ok: true, detail: 'exists' })
    }

    const hashedToken = linkRes.data?.properties?.hashed_token
    canaryUserId = canaryUserId || linkRes.data?.user?.id || null
    if (linkRes.error || !hashedToken) {
      checks.push({ check: 'recovery_link', ok: false, detail: linkRes.error?.message || 'generateLink returned no hashed_token' })
    } else {
      checks.push({ check: 'recovery_link', ok: true, detail: 'token minted' })

      // ── 3. The invariant that broke in the incident: a recovery link must
      //       land on the set-new-password screen. Follows the deployed
      //       production callback with a real one-time token. ──
      try {
        const cbUrl = `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=%2Faccount`
        const res = await fetchWithTimeout(cbUrl, { redirect: 'manual' })
        const location = res.headers.get('location') || ''
        const isRedirect = res.status >= 300 && res.status < 400
        let landing = ''
        try { landing = new URL(location, SITE_URL).pathname } catch { landing = location }
        if (isRedirect && landing === '/auth/update-password') {
          checks.push({ check: 'callback_redirect', ok: true, detail: `${res.status} → ${landing}` })
        } else {
          checks.push({ check: 'callback_redirect', ok: false, detail: `expected 3xx → /auth/update-password, got ${res.status} → ${location || '(no location)'}` })
        }
      } catch (e) {
        checks.push({ check: 'callback_redirect', ok: false, detail: `fetch failed: ${e.message}` })
      }
    }

    // ── 4. The set-password page itself renders ──
    try {
      const res = await fetchWithTimeout(`${SITE_URL}/auth/update-password`)
      const body = res.ok ? await res.text() : ''
      if (res.ok && body.includes('Choose a new password')) {
        checks.push({ check: 'update_password_page', ok: true, detail: '200 with set-password copy' })
      } else {
        checks.push({ check: 'update_password_page', ok: false, detail: res.ok ? 'page served but set-password copy missing' : `HTTP ${res.status}` })
      }
    } catch (e) {
      checks.push({ check: 'update_password_page', ok: false, detail: `fetch failed: ${e.message}` })
    }

    // ── 5. Break-glass path: magic links can still be minted ──
    const magicRes = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: CANARY_EMAIL,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=%2Faccount` },
    })
    if (magicRes.error || !magicRes.data?.properties?.hashed_token) {
      checks.push({ check: 'magiclink', ok: false, detail: magicRes.error?.message || 'no hashed_token' })
    } else {
      checks.push({ check: 'magiclink', ok: true, detail: 'token minted (not followed)' })
    }

    // ── Rotate the canary password so the account stays inert ──
    if (canaryUserId) {
      await sb.auth.admin.updateUserById(canaryUserId, { password: randomPassword() }).catch(() => {})
    }

    const failures = checks.filter(c => !c.ok)
    if (failures.length > 0 && !dryRun) {
      try {
        await sendAgentEmail({
          subject: `[Atlas] AUTH CANARY FAILING: ${failures.map(f => f.check).join(', ')} — account recovery may be broken`,
          html: `<p><strong>The daily auth canary failed ${failures.length} of ${checks.length} probes.</strong> If <em>callback_redirect</em> or <em>update_password_page</em> is failing, operators who reset their password are being stranded again — the 2026-07-21 lockout class.</p><ul>${
            checks.map(c => `<li>${c.ok ? '✅' : '❌'} <strong>${c.check}</strong>: ${c.detail}</li>`).join('')
          }</ul><p>Runbook: "Lockout Prevention" in CLAUDE.md. Unblock any affected operator immediately via <a href="https://www.australianatlas.com.au/admin/access-doctor">/admin/access-doctor</a> (magic sign-in link — no password needed).</p>`,
        })
      } catch { /* best-effort — the run log below still records the failure */ }
    }

    const summary = {
      probes: checks.length,
      failures: failures.length,
      failing_checks: failures.map(f => f.check).join(', ') || null,
      dry_run: dryRun,
    }
    await completeRun(runId, { status: failures.length ? 'partial' : 'success', summary })
    return NextResponse.json({ success: true, dryRun, summary, checks })
  } catch (err) {
    console.error('[auth-canary] fatal:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
