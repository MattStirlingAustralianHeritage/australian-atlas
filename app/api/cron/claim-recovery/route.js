import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { claimRecoveryEmail } from '@/lib/email/claimRecoveryEmail'

/**
 * GET /api/cron/claim-recovery
 *
 * Abandoned paid-claim recovery. A claims_review row (tier='standard',
 * status='pending') is created before the Stripe redirect; if payment is never
 * completed the lead dies silently. This cron emails each such claimant once,
 * 24h–30d after they abandoned, inviting them to finish (or claim free
 * instead), and stamps nudge_sent_at (migration 213) so nobody is emailed
 * twice. Runs daily 09:30 AEST (23:30 UTC).
 *
 * A claim is eligible when:
 *   - tier='standard', status='pending'
 *   - created_at between 24h and 30d ago
 *   - nudge_sent_at IS NULL
 *   - the listing has NO active/past_due listing_claims row (i.e. they didn't
 *     later pay or already own it)
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

    if (!pending || pending.length === 0) {
      await completeRun(runId, { status: 'success', summary: { eligible: 0, sent: 0, dry_run: dryRun } })
      return NextResponse.json({ success: true, dryRun, summary: { eligible: 0 }, results: [] })
    }

    // ── 2. Exclude any whose listing already has a live (active/past_due) claim ──
    const listingIds = [...new Set(pending.map(p => p.listing_id).filter(Boolean))]
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

    for (const claim of pending) {
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
    // ── 4. Admin summary ──
    if (!dryRun && sent > 0) {
      try {
        await sendAgentEmail({
          subject: `[Atlas] Claim recovery — ${sent} operator${sent === 1 ? '' : 's'} nudged`,
          html: `<p>${sent} abandoned paid-claim nudge${sent === 1 ? '' : 's'} sent.</p><ul>${
            results.filter(r => r.status === 'sent').map(r => `<li>${r.listing} — ${r.to}</li>`).join('')
          }</ul>${errors.length ? `<p>${errors.length} error(s).</p>` : ''}`,
        })
      } catch { /* best-effort */ }
    }

    await completeRun(runId, {
      status: errors.length ? 'partial' : 'success',
      summary: { eligible: pending.length, sent, skipped_owned: pending.length - results.length, errors: errors.length, dry_run: dryRun },
    })
    return NextResponse.json({ success: true, dryRun, summary: { eligible: pending.length, sent }, results, errors })
  } catch (err) {
    console.error('[claim-recovery] fatal:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
