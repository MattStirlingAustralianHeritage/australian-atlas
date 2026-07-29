import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { mintSignInUrl } from '@/lib/auth/signInLink'
import { claimRemediationEmail } from '@/lib/email/claimRemediationEmail'
import { logListingActivity, ACTIVITY_ACTIONS } from '@/lib/activity/logListingActivity'

/**
 * Claim remediation console — API.
 *
 * The cohort: listings we marked as owned before migration 265, on the strength
 * of an email address nobody ever confirmed. Each row is a listing that says it
 * belongs to someone who has never once proven they can read mail at that
 * address.
 *
 * GET            the cohort, with everything needed to decide
 * POST send      one recipient, deliberately
 * POST send_bulk many at once, still one call per recipient, paced
 * POST preview   render the exact email for one recipient, mint nothing
 *
 * MANUAL BY DESIGN. This is not a cron and should not become one. The message
 * admits a fault to real operators, and some of them may not be the rightful
 * owner — that is the fault. Those are conversations to have with a person
 * deciding, one at a time.
 *
 * Auth: admin cookie (atlas_admin).
 */

// Resend allows ~2 requests/second.
const SEND_INTERVAL_MS = 600
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Bulk send refuses these outright. A comped Standard holder has been given
// something they may never have seen, which is a different conversation from
// "we marked this yours without checking" — and one Matt asked to handle
// individually. Reachable via a single send, never a batch.
const requiresIndividualHandling = (row) => row.tier === 'standard'

async function loadCohort(sb) {
  const { data: claims, error } = await sb
    .from('listing_claims')
    .select('id, listing_id, claimed_by, claimant_email, tier, status, claimed_at, activation_nudge_sent_at, remediation_sent_at, source_review_id, listings(name, slug, vertical, status)')
    .in('status', LIVE_CLAIM_STATUSES)
    .order('claimed_at', { ascending: true })
    .limit(500)
  if (error) throw error

  const { data: userList, error: uErr } = await sb.auth.admin.listUsers({ perPage: 2000 })
  if (uErr) throw uErr
  const byId = new Map((userList?.users || []).map(u => [u.id, u]))

  const reviewIds = (claims || []).map(c => c.source_review_id).filter(Boolean)
  const { data: reviews } = reviewIds.length
    ? await sb.from('claims_review').select('id, claimant_name, created_at').in('id', reviewIds)
    : { data: [] }
  const rById = new Map((reviews || []).map(r => [r.id, r]))

  const rows = []
  for (const c of claims || []) {
    const u = byId.get(c.claimed_by)
    // A verified owner is not in the cohort. Nothing was done to them that needs
    // undoing — they proved the address, whatever the order of events.
    if (u?.email_confirmed_at) continue
    const r = c.source_review_id ? rById.get(c.source_review_id) : null
    rows.push({
      claimId: c.id,
      listingId: c.listing_id,
      listing: c.listings?.name || '(unknown listing)',
      slug: c.listings?.slug || null,
      vertical: c.listings?.vertical || null,
      listingStatus: c.listings?.status || null,
      email: c.claimant_email,
      claimantName: r?.claimant_name || null,
      tier: c.tier,
      claimCreated: r?.created_at || c.claimed_at,
      grantedAt: c.claimed_at,
      nudgedAt: c.activation_nudge_sent_at,
      remediatedAt: c.remediation_sent_at,
      manualOnly: requiresIndividualHandling({ tier: c.tier }),
    })
  }
  // Individual-handling rows first, then oldest claim first.
  rows.sort((a, b) => (a.manualOnly === b.manualOnly)
    ? String(a.claimCreated).localeCompare(String(b.claimCreated))
    : (a.manualOnly ? -1 : 1))
  return rows
}

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const rows = await loadCohort(getSupabaseAdmin())
    return NextResponse.json({
      rows,
      counts: {
        total: rows.length,
        contacted: rows.filter(r => r.remediatedAt).length,
        manualOnly: rows.filter(r => r.manualOnly).length,
        resendConfigured: !!process.env.RESEND_API_KEY,
      },
    })
  } catch (err) {
    console.error('[claim-remediation] cohort load failed:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * Send to one claim. Stamps before sending and rolls the stamp back on failure,
 * so a transient Resend error leaves the operator retryable rather than
 * recorded as contacted and silently skipped forever.
 */
async function sendOne(sb, row, { force = false } = {}) {
  if (row.remediatedAt && !force) {
    return { claimId: row.claimId, to: row.email, status: 'already_sent' }
  }
  if (!row.email) {
    return { claimId: row.claimId, to: null, status: 'error', error: 'no claimant email' }
  }

  let stamped = false
  const previous = row.remediatedAt
  try {
    const { error: stampErr } = await sb
      .from('listing_claims')
      .update({ remediation_sent_at: new Date().toISOString() })
      .eq('id', row.claimId)
    if (stampErr) throw stampErr
    stamped = true

    const signInUrl = await mintSignInUrl(sb, row.email)
    const message = claimRemediationEmail({
      listingName: row.listing,
      claimantName: row.claimantName,
      signInUrl,
      listingUrl: row.slug ? `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'}/place/${row.slug}` : null,
      comped: row.tier === 'standard',
    })

    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured — nothing was sent')
    }
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: sendErr } = await resend.emails.send({ ...message, to: row.email })
    if (sendErr) throw new Error(sendErr.message || 'resend send failed')

    // Durable record on the listing's own timeline, so this shows up wherever
    // the operator's history is read — not only in this console.
    await logListingActivity(
      sb,
      { id: row.listingId, name: row.listing, slug: row.slug, vertical: row.vertical },
      { role: 'admin', email: 'matt@australianatlas.com.au' },
      {
        action: ACTIVITY_ACTIONS.CLAIM_REMEDIATION_SENT,
        field: 'claim_status',
        summary: `Remediation email sent to ${row.email}`,
        details: { claimant_email: row.email, tier: row.tier, resent: !!previous },
      }
    )

    return { claimId: row.claimId, to: row.email, listing: row.listing, status: 'sent' }
  } catch (err) {
    if (stamped) {
      await sb
        .from('listing_claims')
        .update({ remediation_sent_at: previous || null })
        .eq('id', row.claimId)
        .then(null, e => console.error('[claim-remediation] stamp rollback failed:', e.message))
    }
    return { claimId: row.claimId, to: row.email, listing: row.listing, status: 'error', error: err.message }
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const { action, claimId, claimIds, force } = body || {}

  const sb = getSupabaseAdmin()

  try {
    const rows = await loadCohort(sb)
    const byId = new Map(rows.map(r => [r.claimId, r]))

    if (action === 'preview') {
      const row = byId.get(claimId)
      if (!row) return NextResponse.json({ error: 'Claim not in the remediation cohort' }, { status: 404 })
      // A placeholder link, never a real one. A minted URL signs the holder in
      // as that operator; it has no business in a preview response.
      const message = claimRemediationEmail({
        listingName: row.listing,
        claimantName: row.claimantName,
        signInUrl: '#preview-link-not-minted',
        listingUrl: row.slug ? `https://www.australianatlas.com.au/place/${row.slug}` : null,
        comped: row.tier === 'standard',
      })
      return NextResponse.json({ subject: message.subject, html: message.html, to: row.email })
    }

    if (action === 'send') {
      const row = byId.get(claimId)
      if (!row) return NextResponse.json({ error: 'Claim not in the remediation cohort' }, { status: 404 })
      const result = await sendOne(sb, row, { force: !!force })
      return NextResponse.json({ results: [result] })
    }

    if (action === 'send_bulk') {
      const ids = Array.isArray(claimIds) ? claimIds : []
      if (!ids.length) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 })

      const targets = ids.map(id => byId.get(id)).filter(Boolean)
      const refused = targets.filter(requiresIndividualHandling)
      if (refused.length) {
        return NextResponse.json({
          error: `${refused.length} of these need handling individually (comped Standard): ${refused.map(r => r.listing).join(', ')}. Send those one at a time.`,
        }, { status: 400 })
      }

      const results = []
      for (const [i, row] of targets.entries()) {
        if (i > 0) await sleep(SEND_INTERVAL_MS)
        results.push(await sendOne(sb, row, { force: !!force }))
      }
      return NextResponse.json({ results })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[claim-remediation] failed:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
