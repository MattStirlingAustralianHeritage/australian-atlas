import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/claim-integrity
 *
 * Ownership invariant monitor. Born from the 2026-07-21 incident: the
 * nightly sync silently un-claimed 27 of 28 operator-owned listings and
 * nobody knew for four weeks until an operator complained. The invariants
 * are now enforced in code (syncSourceRows claim guard) and in the database
 * (migration 256 triggers); this cron is the tripwire that says so OUT LOUD
 * if they ever drift anyway — a novel code path, a migration regression, a
 * restore from backup. Runs daily 01:30 UTC, 90 minutes after the sync, so
 * a trample is flagged the same night it happens, not weeks later.
 *
 * Checks:
 *   1. flag_trampled  — live claim (active/past_due) but listings.is_claimed
 *                       is not true. Impossible post-migration-256; CRITICAL.
 *   2. listing_hidden — live claim whose listing status isn't 'active': the
 *                       operator is paying for / owns a page the public
 *                       can't see. Deliberate hides should deactivate the
 *                       claim first.
 *   3. grant_fell_through — claims_review approved but NO listing_claims row
 *                       of any status exists for that listing: grantClaim
 *                       failed after approval and nobody retried.
 *   4. duplicate_live — more than one live claim on a listing (the partial
 *                       unique index only covers 'active'; an active row can
 *                       coexist with past_due).
 *   5. orphaned_claimant — live claim whose claimed_by is null or has no
 *                       profiles row: the "owner" has no working login
 *                       identity, so the listing is unreachable by anyone.
 *   6. role_locked_out — live claim whose claimant profile role is neither
 *                       vendor nor admin: /api/dashboard 403s them at the
 *                       door ('Vendor role required') no matter how valid
 *                       their claim is.
 *
 * Checks 1–4 guard the listing side of the invariant; 5–6 guard the account
 * side — a live claim is worthless if its owner can't get in the front door.
 *
 * Any violation → email Matt. ?dryRun=1 computes and returns JSON, no email.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 120

const AGENT_NAME = 'claim-integrity'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const violations = []

  try {
    // ── Live claims + their listings, one pass for checks 1, 2, 4 ──
    const { data: liveClaims, error: lcErr } = await sb
      .from('listing_claims')
      .select('id, listing_id, claimed_by, claimant_email, tier, status, listings(id, name, vertical, is_claimed, status)')
      .in('status', ['active', 'past_due'])
    if (lcErr) throw lcErr

    const byListing = new Map()
    for (const c of liveClaims || []) {
      const l = c.listings
      const label = l ? `${l.name} [${l.vertical}]` : `listing ${c.listing_id}`

      if (!l) {
        // FK cascade should make this impossible — a live claim always has
        // its listing. If the embed comes back empty something is deeply
        // wrong (RLS change, FK dropped); flag as trampled-class.
        violations.push({ check: 'flag_trampled', detail: `${label}: claim ${c.id} has no joinable listing row`, email: c.claimant_email })
        continue
      }
      if (l.is_claimed !== true) {
        violations.push({ check: 'flag_trampled', detail: `${label}: is_claimed=${l.is_claimed} with live ${c.tier} claim (${c.claimant_email})`, email: c.claimant_email })
      }
      if (l.status !== 'active') {
        violations.push({ check: 'listing_hidden', detail: `${label}: listing status='${l.status}' with live ${c.tier} claim (${c.claimant_email})`, email: c.claimant_email })
      }
      byListing.set(c.listing_id, (byListing.get(c.listing_id) || 0) + 1)
    }
    for (const [listingId, n] of byListing) {
      if (n > 1) {
        violations.push({ check: 'duplicate_live', detail: `listing ${listingId} has ${n} live claims` })
      }
    }

    // ── Check 3: approved reviews with no ownership row at all ──
    const { data: approved, error: apErr } = await sb
      .from('claims_review')
      .select('id, listing_id, claimant_email, reviewed_at')
      .eq('status', 'approved')
      .not('listing_id', 'is', null)
    if (apErr) throw apErr

    const approvedIds = [...new Set((approved || []).map(a => a.listing_id))]
    const anyClaimByListing = new Set()
    for (let i = 0; i < approvedIds.length; i += 100) {
      const { data: rows, error } = await sb
        .from('listing_claims')
        .select('listing_id')
        .in('listing_id', approvedIds.slice(i, i + 100))
      if (error) throw error
      for (const r of rows || []) anyClaimByListing.add(r.listing_id)
    }
    for (const a of approved || []) {
      if (!anyClaimByListing.has(a.listing_id)) {
        violations.push({ check: 'grant_fell_through', detail: `claims_review ${a.id} approved ${a.reviewed_at?.slice(0, 10)} (${a.claimant_email}) but no listing_claims row exists for listing ${a.listing_id}` })
      }
    }

    // ── Checks 5 & 6: the account side — can the owner actually get in? ──
    const claimantIds = [...new Set((liveClaims || []).map(c => c.claimed_by).filter(Boolean))]
    const profileById = new Map()
    for (let i = 0; i < claimantIds.length; i += 100) {
      const { data: rows, error } = await sb
        .from('profiles')
        .select('id, email, role')
        .in('id', claimantIds.slice(i, i + 100))
      if (error) throw error
      for (const p of rows || []) profileById.set(p.id, p)
    }
    for (const c of liveClaims || []) {
      const l = c.listings
      const label = l ? `${l.name} [${l.vertical}]` : `listing ${c.listing_id}`
      if (!c.claimed_by) {
        violations.push({ check: 'orphaned_claimant', detail: `${label}: live ${c.tier} claim (${c.claimant_email}) has no claimed_by user id — no account can reach this listing`, email: c.claimant_email })
        continue
      }
      const profile = profileById.get(c.claimed_by)
      if (!profile) {
        violations.push({ check: 'orphaned_claimant', detail: `${label}: claimed_by ${c.claimed_by} has no profiles row (${c.claimant_email}) — the owner's login identity is gone`, email: c.claimant_email })
      } else if (profile.role !== 'vendor' && profile.role !== 'admin') {
        violations.push({ check: 'role_locked_out', detail: `${label}: owner ${profile.email || c.claimant_email} has role '${profile.role}' — /api/dashboard requires vendor/admin, so their dashboard 403s`, email: c.claimant_email })
      }
    }

    // ── Alert ──
    if (violations.length > 0 && !dryRun) {
      try {
        await sendAgentEmail({
          subject: `[Atlas] OWNERSHIP INTEGRITY: ${violations.length} violation${violations.length === 1 ? '' : 's'} — operators may be locked out`,
          html: `<p><strong>The claim-integrity monitor found ${violations.length} invariant violation${violations.length === 1 ? '' : 's'}.</strong> Operators affected by <em>flag_trampled</em> cannot see their listing in the dashboard right now.</p><ul>${
            violations.map(v => `<li><strong>${v.check}</strong>: ${v.detail}</li>`).join('')
          }</ul><p>Runbook: diagnose the affected operator first at <a href="https://www.australianatlas.com.au/admin/access-doctor">/admin/access-doctor</a>, then see "Ownership State Protection" in CLAUDE.md. The 2026-07-21 repair script pattern is _repair_claim_state.mjs in the repo root.</p>`,
        })
      } catch { /* best-effort — the run log below still records the drift */ }
    }

    const summary = {
      live_claims: (liveClaims || []).length,
      approved_reviews: (approved || []).length,
      violations: violations.length,
      by_check: violations.reduce((m, v) => ({ ...m, [v.check]: (m[v.check] || 0) + 1 }), {}),
      dry_run: dryRun,
    }
    await completeRun(runId, { status: violations.length ? 'partial' : 'success', summary })
    return NextResponse.json({ success: true, dryRun, summary, violations })
  } catch (err) {
    console.error('[claim-integrity] fatal:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
