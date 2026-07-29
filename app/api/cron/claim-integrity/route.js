import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { sweepExpiredComps } from '@/lib/claims/compSweep'

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
 *   7. flag_orphaned  — the MIRROR of check 1, and the half that was missing
 *                       until 2026-07-29: listings.is_claimed=true with no
 *                       live claim row. Check 1 only ever walked out from
 *                       live claims, so a true flag with nothing behind it
 *                       was invisible by construction. It is not a cosmetic
 *                       drift: POST /api/claim rejects is_claimed listings
 *                       with 409 "already been claimed", so the real operator
 *                       is locked OUT of claiming while no account can reach
 *                       a dashboard. Found two live examples (Bindi Wine
 *                       Growers, 1813) that had sat silent indefinitely.
 *
 * Checks 1–4 and 7 guard the listing side of the invariant; 5–6 guard the
 * account side — a live claim is worthless if its owner can't get in the
 * front door.
 *
 * Also runs the COMP EXPIRY SWEEP (migration 261) before the checks: comped
 * Standard grants can carry a term, and when one runs out this writes the tier
 * back to 'free' and emails the admin. That is reconciliation, not enforcement
 * — filterPaidListingIds stops the benefits the instant the term ends, with or
 * without this run. It lives here because the cadence (every 6h) and the domain
 * (claim state) already match, and because this agent is in fleet-health's
 * EXPECTED map, so the sweep inherits a deadman that would notice it dying.
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
    // ── Comp expiry sweep (reconciliation, runs before the checks) ──
    // Comped Standard grants can carry a term (migration 261). The paid gates
    // already treat a lapsed comp as Free at read time; this writes the stored
    // tier back to 'free' so every other reader — this monitor included — sees
    // the same truth. Done first so the checks below never reason about a claim
    // whose Standard has quietly run out.
    const compSweep = await sweepExpiredComps(sb, { dryRun })
    for (const e of compSweep.errors) {
      violations.push({ check: 'comp_sweep_failed', detail: `comp expiry sweep ${e.stage} error${e.claim_id ? ` on claim ${e.claim_id}` : ''}: ${e.error}` })
    }

    // ── Live claims + their listings, one pass for checks 1, 2, 4 ──
    const { data: liveClaims, error: lcErr } = await sb
      .from('listing_claims')
      .select('id, listing_id, claimed_by, claimant_email, tier, status, listings(id, name, vertical, is_claimed, status)')
      .in('status', ['active', 'past_due'])
    if (lcErr) throw lcErr

    // Owner profiles, resolved up front: checks 5 and 6 need them, and check 2
    // needs to know whether an owner is an admin before it decides to shout.
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
      // Check 2 exists to catch a real operator owning — or paying for — a page
      // the public cannot see. An ADMIN-owned claim on a hidden listing is a
      // test fixture, not a customer being harmed: "Admin Test Brewery" (auto-
      // hidden by the no-website rule, claimed by Matt on a Stripe-less
      // 'standard' row) made this fire on every 6-hourly run, so the agent
      // reported 'partial' permanently and the alert stopped carrying
      // information. That desensitisation is precisely how the missing
      // flag_orphaned check stayed unnoticed. Exempting admins keeps the signal
      // for every operator while retiring the standing false alarm.
      if (l.status !== 'active' && profileById.get(c.claimed_by)?.role !== 'admin') {
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

    // ── Check 7: is_claimed=true with nothing behind it ──
    // The mirror of check 1. Check 1 iterates live claims and asks "is the flag
    // set?"; it can never see a flag with NO claim to walk out from. That blind
    // spot is the worse direction of the two: the listing advertises itself as
    // claimed, so /api/claim 409s the genuine operator ("already been claimed"),
    // while the absent claim row means no dashboard exists for anyone. The
    // operator cannot get in and cannot ask to.
    const { data: flagged, error: fErr } = await sb
      .from('listings')
      .select('id, name, vertical, status')
      .eq('is_claimed', true)
    if (fErr) throw fErr

    const flaggedIds = (flagged || []).map(l => l.id)
    // Every claim row for those listings, ANY status — an all-inactive history
    // still leaves the flag lying, but it is a different story to tell.
    const claimStatusesByListing = new Map()
    for (let i = 0; i < flaggedIds.length; i += 100) {
      const { data: rows, error } = await sb
        .from('listing_claims')
        .select('listing_id, status')
        .in('listing_id', flaggedIds.slice(i, i + 100))
      if (error) throw error
      for (const r of rows || []) {
        if (!claimStatusesByListing.has(r.listing_id)) claimStatusesByListing.set(r.listing_id, [])
        claimStatusesByListing.get(r.listing_id).push(r.status)
      }
    }
    for (const l of flagged || []) {
      const statuses = claimStatusesByListing.get(l.id) || []
      if (statuses.some(s => s === 'active' || s === 'past_due')) continue // healthy
      const history = statuses.length
        ? `only ${statuses.join('/')} claim row(s) remain`
        : 'no listing_claims row has ever existed'
      violations.push({
        check: 'flag_orphaned',
        detail: `${l.name} [${l.vertical}]: is_claimed=true but ${history} — /claim returns 409 to the real operator and nobody has a dashboard`,
      })
    }

    // ── Checks 5 & 6: the account side — can the owner actually get in? ──
    // (profileById was resolved above, before check 2 needed it.)
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

    // ── Notify: a comp ran out ──
    // Not a violation — it is the term working as intended — but it IS a
    // commercial event Matt offered personally, so it should never happen
    // silently. Sent separately from the integrity alert so an expiry never
    // reads as a lockout.
    if (compSweep.downgraded.length > 0 && !dryRun) {
      try {
        await sendAgentEmail({
          subject: `[Atlas] ${compSweep.downgraded.length} comped Standard listing${compSweep.downgraded.length === 1 ? '' : 's'} reverted to Free`,
          html: `<p>The comped Standard term ran out on ${compSweep.downgraded.length} listing${compSweep.downgraded.length === 1 ? '' : 's'}. ${compSweep.downgraded.length === 1 ? 'It has' : 'They have'} dropped back to Free — the operator keeps the listing, just not the paid features.</p><ul>${
            compSweep.downgraded.map(d => `<li><strong>${d.listing_name || d.listing_id}</strong> [${d.vertical}] — ${d.claimant_email}, term ended ${String(d.expired_at).slice(0, 10)}${d.note ? ` (${d.note})` : ''}</li>`).join('')
          }</ul><p>To renew or extend, search the venue at <a href="https://www.australianatlas.com.au/admin/claims">/admin/claims</a> and grant a fresh term.</p>`,
        })
      } catch { /* best-effort — the run log below still records the sweep */ }
    }

    // ── Alert ──
    if (violations.length > 0 && !dryRun) {
      try {
        await sendAgentEmail({
          subject: `[Atlas] OWNERSHIP INTEGRITY: ${violations.length} violation${violations.length === 1 ? '' : 's'} — operators may be locked out`,
          html: `<p><strong>The claim-integrity monitor found ${violations.length} invariant violation${violations.length === 1 ? '' : 's'}.</strong> Operators affected by <em>flag_trampled</em> cannot see their listing in the dashboard right now; those under <em>flag_orphaned</em> are being turned away from claiming it at all.</p><ul>${
            violations.map(v => `<li><strong>${v.check}</strong>: ${v.detail}</li>`).join('')
          }</ul><p>Runbook: diagnose the affected operator first at <a href="https://www.australianatlas.com.au/admin/access-doctor">/admin/access-doctor</a>, then see "Ownership State Protection" in CLAUDE.md. The 2026-07-21 repair script pattern is _repair_claim_state.mjs in the repo root.</p>`,
        })
      } catch { /* best-effort — the run log below still records the drift */ }
    }

    const summary = {
      live_claims: (liveClaims || []).length,
      approved_reviews: (approved || []).length,
      flagged_listings: (flagged || []).length,
      violations: violations.length,
      by_check: violations.reduce((m, v) => ({ ...m, [v.check]: (m[v.check] || 0) + 1 }), {}),
      comps_expired: compSweep.downgraded.length,
      dry_run: dryRun,
    }
    await completeRun(runId, { status: violations.length ? 'partial' : 'success', summary })
    return NextResponse.json({ success: true, dryRun, summary, violations, compSweep })
  } catch (err) {
    console.error('[claim-integrity] fatal:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
