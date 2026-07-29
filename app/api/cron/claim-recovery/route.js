import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { claimRecoveryEmail } from '@/lib/email/claimRecoveryEmail'
import { claimActivationEmail } from '@/lib/email/claimActivationEmail'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { mintSignInUrl } from '@/lib/auth/signInLink'

/**
 * GET /api/cron/claim-recovery
 *
 * Three phases, each a different way an operator falls out of the claim funnel
 * and is never chased. Runs daily 09:30 AEST (23:30 UTC).
 *
 * ── PHASE 1: abandoned checkout ──
 * A claims_review row (tier='standard', status='pending') is created before the
 * Stripe redirect; if payment is never completed the lead dies silently. Emails
 * each such claimant once, 24h–30d after they abandoned, inviting them to finish
 * (or claim free instead), and stamps nudge_sent_at (migration 213).
 *
 * Eligible when:
 *   - tier='standard', status='pending'
 *   - created_at between 24h and 30d ago
 *   - nudge_sent_at IS NULL
 *   - the listing has NO active/past_due listing_claims row (i.e. they didn't
 *     later pay or already own it)
 *
 * ── PHASE 2: granted but never activated (added 2026-07-29) ──
 * The larger leak, and the one nothing covered. Access to a granted claim is
 * delivered as a SINGLE-USE Supabase invite link, and grantClaim provisions
 * these accounts with no password. Miss that one link and the only way back is
 * the "Use magic link instead" toggle on /login, which nothing tells the
 * operator about. The audit that found this measured the cost: of the operators
 * who ever signed in, 20 of 22 did so within two hours of the grant, and 24 who
 * missed that window had never returned — including two paying Standard
 * subscribers who had never once opened what they were being charged for.
 *
 * Phase 1 could never catch them: it looks at claims_review rows still
 * 'pending', and these are 'approved' with a live ownership row. Different
 * population, different fix — this one carries a FRESH working sign-in link
 * rather than asking the operator to go hunting for one.
 *
 * Eligible when:
 *   - a live (active/past_due) listing_claims row exists
 *   - claimed_at between 48h and 90d ago
 *   - activation_nudge_sent_at IS NULL (migration 264)
 *   - the owning auth user has last_sign_in_at IS NULL — never once signed in
 *
 * ── PHASE 3: approved, but the address never confirmed (added 2026-07-29) ──
 * Migration 265 moved ownership behind proof, so an approved claim waits at
 * claims_review 'pending_verification' with NO listing_claims row until the
 * claimed address answers. That fixed the original fault and created a smaller
 * one: phase 2 reads listing_claims, so a claim with no ownership row is
 * invisible to it. A claimant who never opened their invite would sit unchased
 * and unreported — the same silent stranding as the original 33, one table over.
 *
 * Eligible when:
 *   - claims_review.status = 'pending_verification'
 *   - reviewed_at between 48h and 90d ago
 *   - verification_nudge_sent_at IS NULL (migration 266)
 *   - the claimed address is still unverified
 *
 * Its copy differs from phase 2 for a reason that matters: these claimants do
 * NOT own the listing yet, so they are told the claim is unfinished rather than
 * that a dashboard is waiting for them.
 *
 * Phases 2 and 3 send only when CLAIM_ACTIVATION_NUDGE_ENABLED='1' — one switch
 * for "may this agent mail operators", rather than two that can disagree.
 * Default OFF, the same posture as the outreach autopilots: a batch of mail to
 * real operators is not something a deploy should be able to trigger by itself.
 * With the flag off both phases compute their cohort and report it, sending
 * nothing.
 *
 * ?dryRun=1  compute + return JSON; nothing stamped, one sample mail to Matt.
 *
 * NOTE: funnel/billing only — nothing here influences ranking.
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const AGENT_NAME = 'claim-recovery'
const MATT_EMAIL = 'matt@australianatlas.com.au'
const DAY_MS = 24 * 60 * 60 * 1000
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// Resend's published limit is 2 requests/second. 600ms keeps a full cohort
// comfortably under it; 24 operators cost ~14s, well inside maxDuration.
const SEND_INTERVAL_MS = 600
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Sends made so far in THIS invocation, shared by every phase that mails.
// Phase-local counters would let phase 3's first send fire immediately after
// phase 2's last one and burst through Resend's limit at the seam. Reset at the
// top of GET, since a warm lambda keeps module state between invocations.
let sendsThisRun = 0
const paceSend = async () => { if (sendsThisRun > 0) await sleep(SEND_INTERVAL_MS) }

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const nowMs = Date.now()
  sendsThisRun = 0
  const results = []
  const errors = []

  try {
    // ── 1. Pending standard claims in the 24h–30d window, not yet nudged ──
    const windowNew = new Date(nowMs - DAY_MS).toISOString()      // ≤ this (older than 24h)
    const windowOld = new Date(nowMs - 30 * DAY_MS).toISOString() // ≥ this (younger than 30d)
    const { data: pending, error: pErr } = await sb
      .from('claims_review')
      .select('id, listing_id, vertical, claimant_name, claimant_email, created_at')
      .eq('tier', 'standard')
      .eq('status', 'pending')
      .is('nudge_sent_at', null)
      .lte('created_at', windowNew)
      .gte('created_at', windowOld)
      .order('created_at', { ascending: true })
      .limit(200)
    if (pErr) throw pErr

    // NB: no early return when phase 1 is empty — phase 2 below is a separate
    // population and must run regardless. (It used to bail here, which would
    // have skipped the activation nudge on every day with no abandoned
    // checkouts, i.e. most days.)

    // ── 2. Exclude any whose listing already has a live (active/past_due) claim ──
    const listingIds = [...new Set((pending || []).map(p => p.listing_id).filter(Boolean))]
    const ownedListingIds = new Set()
    if (listingIds.length) {
      const { data: liveClaims } = await sb
        .from('listing_claims')
        .select('listing_id, status')
        .in('listing_id', listingIds)
        .in('status', ['active', 'past_due'])
      for (const c of liveClaims || []) ownedListingIds.add(c.listing_id)
    }

    // ── 3. Listing names/slugs for the email + claim link ──
    const { data: listings } = await sb
      .from('listings')
      .select('id, name, slug')
      .in('id', listingIds.length ? listingIds : ['00000000-0000-0000-0000-000000000000'])
    const listingById = new Map((listings || []).map(l => [l.id, l]))

    const resendKey = process.env.RESEND_API_KEY
    const resend = resendKey ? new Resend(resendKey) : null
    let sampleSent = false

    for (const claim of pending || []) {
      if (ownedListingIds.has(claim.listing_id)) continue // already paid/owns it
      const listing = listingById.get(claim.listing_id)
      if (!listing?.slug || !claim.claimant_email) continue

      const claimUrl = `${SITE_URL}/claim/${listing.slug}`
      const message = claimRecoveryEmail({
        listingName: listing.name || 'your venue',
        claimantName: claim.claimant_name,
        claimUrl,
      })

      try {
        if (dryRun) {
          // Only send one sample to Matt; never stamp.
          if (!sampleSent && resend) {
            await resend.emails.send({ ...message, to: MATT_EMAIL, subject: `[dry-run] ${message.subject}` })
            sampleSent = true
          }
          results.push({ claimId: claim.id, listing: listing.name, to: claim.claimant_email, status: 'dry-run' })
          continue
        }

        // Stamp BEFORE sending (idempotency — never double-nudge on retry).
        const { error: stampErr } = await sb
          .from('claims_review')
          .update({ nudge_sent_at: new Date().toISOString() })
          .eq('id', claim.id)
          .is('nudge_sent_at', null)
        if (stampErr) throw stampErr

        if (resend) {
          await resend.emails.send({ ...message, to: claim.claimant_email })
        }
        results.push({ claimId: claim.id, listing: listing.name, to: claim.claimant_email, status: resend ? 'sent' : 'skipped_no_resend' })
      } catch (e) {
        errors.push({ claimId: claim.id, error: e.message })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length

    // ── PHASE 2: granted, but the operator has never once signed in ──
    const activation = await runActivationNudge({ sb, resend, dryRun, nowMs })

    // ── PHASE 3: approved, but the address never confirmed ──
    const verification = await runVerificationNudge({ sb, resend, dryRun, nowMs })

    // ── 4. Admin summary ──
    const totalSent = sent + activation.sent + verification.sent
    if (!dryRun && totalSent > 0) {
      try {
        const phase1Block = sent > 0
          ? `<p><strong>${sent}</strong> abandoned paid-claim nudge${sent === 1 ? '' : 's'} sent.</p><ul>${
            results.filter(r => r.status === 'sent').map(r => `<li>${r.listing} — ${r.to}</li>`).join('')
          }</ul>`
          : ''
        const phase2Block = activation.sent > 0
          ? `<p><strong>${activation.sent}</strong> operator${activation.sent === 1 ? '' : 's'} who had never signed in were sent a fresh sign-in link.</p><ul>${
            activation.results.filter(r => r.status === 'sent').map(r => `<li>${r.listing} — ${r.to}${r.paid ? ' <strong>(paying Standard)</strong>' : ''}</li>`).join('')
          }</ul>`
          : ''
        const phase3Block = verification.sent > 0
          ? `<p><strong>${verification.sent}</strong> approved claim${verification.sent === 1 ? '' : 's'} still unconfirmed were asked again to verify. These listings are NOT yet owned.</p><ul>${
            verification.results.filter(r => r.status === 'sent').map(r => `<li>${r.listing} — ${r.to} (approved ${r.approved})</li>`).join('')
          }</ul>`
          : ''
        const errCount = errors.length + activation.errors.length + verification.errors.length
        await sendAgentEmail({
          subject: `[Atlas] Claim recovery — ${totalSent} operator${totalSent === 1 ? '' : 's'} nudged`,
          html: `${phase1Block}${phase2Block}${phase3Block}${errCount ? `<p>${errCount} error(s).</p>` : ''}`,
        })
      } catch { /* best-effort */ }
    }

    const pendingCount = (pending || []).length
    const summary = {
      eligible: pendingCount,
      sent,
      skipped_owned: pendingCount - results.length,
      errors: errors.length,
      activation_eligible: activation.eligible,
      activation_sent: activation.sent,
      activation_errors: activation.errors.length,
      activation_enabled: activation.enabled,
      verification_eligible: verification.eligible,
      verification_sent: verification.sent,
      verification_errors: verification.errors.length,
      dry_run: dryRun,
    }
    await completeRun(runId, {
      status: errors.length || activation.errors.length || verification.errors.length ? 'partial' : 'success',
      summary,
    })
    return NextResponse.json({
      success: true,
      dryRun,
      summary,
      results,
      errors,
      activation,
      verification,
    })
  } catch (err) {
    console.error('[claim-recovery] fatal:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PHASE 2 — operators whose claim was granted but who have never signed in.
 *
 * Mints a FRESH single-use sign-in link per operator and emails it. The
 * original invite is long gone: single-use, and these accounts have no password
 * to fall back on. Stamps listing_claims.activation_nudge_sent_at (migration
 * 264) before sending, so a retry or an overlapping run can never double-mail.
 *
 * Gated on CLAIM_ACTIVATION_NUDGE_ENABLED='1'. With the flag unset it still
 * computes and reports the cohort — that visibility is the point — but sends
 * nothing and stamps nothing, so turning it on later still reaches everyone.
 *
 * @returns {{ enabled: boolean, eligible: number, sent: number, results: object[], errors: object[] }}
 */
async function runActivationNudge({ sb, resend, dryRun, nowMs }) {
  const enabled = process.env.CLAIM_ACTIVATION_NUDGE_ENABLED === '1'
  const out = { enabled, eligible: 0, sent: 0, results: [], errors: [] }

  // Grants younger than 48h are excluded: the operator may simply not have got
  // to their inbox yet, and the original invite is still fresh. Older than 90d
  // and a surprise sign-in link reads as a phishing attempt rather than a
  // helpful nudge — those are better handled by hand.
  const notBefore = new Date(nowMs - 90 * DAY_MS).toISOString()
  const notAfter = new Date(nowMs - 2 * DAY_MS).toISOString()

  const { data: claims, error } = await sb
    .from('listing_claims')
    .select('id, listing_id, claimed_by, claimant_email, tier, status, claimed_at')
    .in('status', LIVE_CLAIM_STATUSES)
    .is('activation_nudge_sent_at', null)
    .lte('claimed_at', notAfter)
    .gte('claimed_at', notBefore)
    .order('claimed_at', { ascending: true })
    .limit(200)
  if (error) {
    out.errors.push({ stage: 'query', error: error.message })
    return out
  }
  if (!claims?.length) return out

  // Who has genuinely never signed in? last_sign_in_at is the only honest
  // signal — email_confirmed_at can be set by paths that never reached a
  // session, so it would wrongly clear operators who are still locked out.
  const { data: userList, error: uErr } = await sb.auth.admin.listUsers({ perPage: 2000 })
  if (uErr) {
    out.errors.push({ stage: 'listUsers', error: uErr.message })
    return out
  }
  const authById = new Map((userList?.users || []).map(u => [u.id, u]))

  const stranded = claims.filter(c => {
    const u = c.claimed_by ? authById.get(c.claimed_by) : null
    return u && !u.last_sign_in_at
  })
  out.eligible = stranded.length
  if (!stranded.length) return out

  const { data: listings } = await sb
    .from('listings')
    .select('id, name, slug')
    .in('id', [...new Set(stranded.map(c => c.listing_id))])
  const listingById = new Map((listings || []).map(l => [l.id, l]))

  for (const claim of stranded) {
    const listing = listingById.get(claim.listing_id)
    const row = {
      claimId: claim.id,
      listing: listing?.name || claim.listing_id,
      to: claim.claimant_email,
      paid: claim.tier === 'standard',
      granted: claim.claimed_at?.slice(0, 10),
    }

    if (!enabled || dryRun) {
      // Report the cohort without touching it. No link is minted either —
      // a real sign-in link should not exist in a log nobody asked for.
      out.results.push({ ...row, status: enabled ? 'dry-run' : 'disabled' })
      continue
    }
    if (!claim.claimant_email) {
      out.errors.push({ claimId: claim.id, error: 'no claimant_email' })
      continue
    }

    // Resend allows ~2 requests/second. 24 sends in a tight loop trips that,
    // and a 429 here is not a harmless retry-later: the stamp below is written
    // first, so a rate-limited operator would be recorded as nudged and never
    // mailed. Pace the loop under the limit rather than rely on the rollback.
    await paceSend()

    let stamped = false
    try {
      // Stamp BEFORE minting/sending: a crash between a successful send and the
      // stamp would mail the operator twice, which is worse than a missed nudge.
      const { error: stampErr } = await sb
        .from('listing_claims')
        .update({ activation_nudge_sent_at: new Date().toISOString() })
        .eq('id', claim.id)
        .is('activation_nudge_sent_at', null)
      if (stampErr) throw stampErr
      stamped = true

      const signInUrl = await mintSignInUrl(sb, claim.claimant_email)
      const message = claimActivationEmail({
        listingName: listing?.name,
        signInUrl,
        listingUrl: listing?.slug ? `${SITE_URL}/place/${listing.slug}` : null,
        paid: claim.tier === 'standard',
      })

      if (resend) {
        const { error: sendErr } = await resend.emails.send({ ...message, to: claim.claimant_email })
        if (sendErr) throw new Error(sendErr.message || 'resend send failed')
        sendsThisRun++
      }
      out.results.push({ ...row, status: resend ? 'sent' : 'skipped_no_resend' })
      if (resend) out.sent++
    } catch (e) {
      // The send failed, so the stamp is a lie — clear it and let tomorrow's run
      // try again. Without this a transient 429 or a Resend blip would strand an
      // operator permanently, which is the exact failure this whole phase exists
      // to undo. The double-send window (send succeeded but threw) is far
      // narrower than the drop-forever window it replaces.
      if (stamped) {
        const { error: rollbackErr } = await sb
          .from('listing_claims')
          .update({ activation_nudge_sent_at: null })
          .eq('id', claim.id)
        if (rollbackErr) {
          out.errors.push({ claimId: claim.id, to: claim.claimant_email, error: `send failed (${e.message}) AND stamp rollback failed (${rollbackErr.message}) — this operator will not be retried automatically` })
          continue
        }
      }
      out.errors.push({ claimId: claim.id, to: claim.claimant_email, error: `${e.message} (stamp rolled back; will retry next run)` })
    }
  }

  return out
}

/**
 * PHASE 3 — approved by an admin, but the claimed address never confirmed.
 *
 * Migration 265 put ownership behind proof, so an approved claim now waits at
 * claims_review 'pending_verification' with NO listing_claims row. That closed
 * the original fault and opened a smaller one: phase 2 reads listing_claims, so
 * a claim with no ownership row is invisible to it. Without this phase a
 * claimant who never opened their invite would sit unchased and unreported —
 * the same silent stranding as the original 33, one table over.
 *
 * The copy differs from phase 2 for a reason that matters: these people do NOT
 * own the listing yet, so they are told the claim is unfinished rather than
 * that their dashboard is waiting.
 *
 * Shares CLAIM_ACTIVATION_NUDGE_ENABLED with phase 2 — one switch for "may this
 * agent mail operators", rather than two that can disagree.
 *
 * @returns {{ enabled: boolean, eligible: number, sent: number, results: object[], errors: object[] }}
 */
async function runVerificationNudge({ sb, resend, dryRun, nowMs }) {
  const enabled = process.env.CLAIM_ACTIVATION_NUDGE_ENABLED === '1'
  const out = { enabled, eligible: 0, sent: 0, results: [], errors: [] }

  // Younger than 48h and the original invite is still fresh in their inbox.
  const notBefore = new Date(nowMs - 90 * DAY_MS).toISOString()
  const notAfter = new Date(nowMs - 2 * DAY_MS).toISOString()

  const { data: waiting, error } = await sb
    .from('claims_review')
    .select('id, listing_id, vertical, claimant_name, claimant_email, tier, reviewed_at, listings(name, slug)')
    .eq('status', 'pending_verification')
    .is('verification_nudge_sent_at', null)
    .lte('reviewed_at', notAfter)
    .gte('reviewed_at', notBefore)
    .order('reviewed_at', { ascending: true })
    .limit(200)
  if (error) {
    out.errors.push({ stage: 'query', error: error.message })
    return out
  }
  if (!waiting?.length) return out

  // Anyone who has since verified is not stalled — the claim-integrity sweep
  // settles them. Mailing them "one step left" would be simply wrong.
  const { data: userList, error: uErr } = await sb.auth.admin.listUsers({ perPage: 2000 })
  if (uErr) {
    out.errors.push({ stage: 'listUsers', error: uErr.message })
    return out
  }
  const verifiedEmails = new Set(
    (userList?.users || []).filter(u => u.email_confirmed_at && u.email).map(u => u.email.toLowerCase())
  )

  const stalled = waiting.filter(c => c.claimant_email && !verifiedEmails.has(c.claimant_email.toLowerCase()))
  out.eligible = stalled.length
  if (!stalled.length) return out

  for (const claim of stalled) {
    const row = {
      claimId: claim.id,
      listing: claim.listings?.name || claim.listing_id,
      to: claim.claimant_email,
      approved: claim.reviewed_at?.slice(0, 10),
    }

    if (!enabled || dryRun) {
      out.results.push({ ...row, status: enabled ? 'dry-run' : 'disabled' })
      continue
    }

    // Same pacing as phase 2, and the two phases share the counter so a run
    // that mails in both does not burst through Resend's limit at the seam.
    await paceSend()

    let stamped = false
    try {
      // Stamp BEFORE minting/sending — a crash between send and stamp would
      // mail them twice, which is worse than missing one nudge.
      const { error: stampErr } = await sb
        .from('claims_review')
        .update({ verification_nudge_sent_at: new Date().toISOString() })
        .eq('id', claim.id)
        .is('verification_nudge_sent_at', null)
      if (stampErr) throw stampErr
      stamped = true

      const signInUrl = await mintSignInUrl(sb, claim.claimant_email)
      const message = claimActivationEmail({
        listingName: claim.listings?.name,
        claimantName: claim.claimant_name,
        signInUrl,
        listingUrl: claim.listings?.slug ? `${SITE_URL}/place/${claim.listings.slug}` : null,
        pendingVerification: true,
      })

      if (resend) {
        const { error: sendErr } = await resend.emails.send({ ...message, to: claim.claimant_email })
        if (sendErr) throw new Error(sendErr.message || 'resend send failed')
        sendsThisRun++
      }
      out.results.push({ ...row, status: resend ? 'sent' : 'skipped_no_resend' })
      if (resend) out.sent++
    } catch (e) {
      // A failed send makes the stamp a lie. Clear it so tomorrow retries —
      // otherwise a transient 429 strands the claimant permanently, which is
      // precisely the failure this phase exists to prevent.
      if (stamped) {
        const { error: rollbackErr } = await sb
          .from('claims_review')
          .update({ verification_nudge_sent_at: null })
          .eq('id', claim.id)
        if (rollbackErr) {
          out.errors.push({ claimId: claim.id, to: claim.claimant_email, error: `send failed (${e.message}) AND stamp rollback failed (${rollbackErr.message}) — this claimant will not be retried automatically` })
          continue
        }
      }
      out.errors.push({ claimId: claim.id, to: claim.claimant_email, error: `${e.message} (stamp rolled back; will retry next run)` })
    }
  }

  return out
}

