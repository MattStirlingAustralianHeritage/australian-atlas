// ============================================================
// Outreach send engine
// ------------------------------------------------------------
// The one place operator outreach email actually goes out. Used by the admin
// send route (manual batches) and the autopilot cron (scheduled batches +
// follow-ups) so eligibility rules, compliance headers, delivery bookkeeping
// and campaign records can never drift between the two.
//
// Eligibility is enforced here even when callers pre-filter: invalid address,
// suppression list, prior send on the row, and — new — the same email having
// already been contacted via a *different* listing (multi-venue operators used
// to be emailable once per listing).
// ============================================================

import crypto from 'node:crypto'
import { renderEmail, REPLY_TO } from '@/lib/outreach/template'
import { signUnsubscribeToken, signRemovalToken } from '@/lib/outreach/unsubscribeToken'
import { assertWithinSendWindow } from '@/lib/outreach/sendWindow'

export const FROM = 'Matt at Australian Atlas <matt@australianatlas.com.au>'
export const ADMIN_EMAIL = 'matt@australianatlas.com.au'
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

const BATCH_SIZE = 100
const BATCH_DELAY_MS = 600

export const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Resend rejects the WHOLE batch.send() call if any single `to` is malformed —
// so one bad address (e.g. a truncated legacy discovery capture like
// "s@gmail.c") would fail every good recipient alongside it. Linear + anchored
// on a short string, so no backtracking risk; requires a real ≥2-char TLD.
export function isSendableEmail(email) {
  if (typeof email !== 'string') return false
  const e = email.trim()
  if (e.length < 6 || e.length > 254) return false
  if (/[\s<>(),;:"\\]/.test(e)) return false
  // Reject scraping artifacts that are RFC-legal but never a real operator
  // inbox: a URL fragment captured as an address ("//tiktok.com/@handle"), or a
  // quote/dot that leaked in from surrounding page source ("'weborders@…").
  // These slip past the char-class regex below and hard-bounce, eroding the
  // sending domain's reputation on every autopilot run.
  if (e.includes('/')) return false
  const local = e.slice(0, e.indexOf('@'))
  if (/^['".]|['".]$/.test(local)) return false
  return /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(e)
}

export function newCampaignId(prefix = 'cmp') {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}_${crypto.randomBytes(3).toString('hex')}`
}

export function unsubscribeUrl(email, origin = ORIGIN) {
  return `${origin}/api/outreach/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(email))}`
}

// The "remove this listing" link in the email footer. Token-bound to this
// recipient + this listing, so it can only take down the listing the email
// was about. GET on the route is a confirmation page; the delete is POST-only.
export function removeListingUrl(email, listingId, origin = ORIGIN) {
  if (!listingId) return ''
  return `${origin}/api/outreach/remove?token=${encodeURIComponent(signRemovalToken(email, listingId))}`
}

/**
 * Filter candidate rows down to the recipients this run may actually email,
 * tracking why each exclusion happened.
 *
 * @param {object} p
 * @param {object} p.sb          service-role Supabase client
 * @param {Array}  p.candidates  [{ listing, outreach }] — listing row + operator_outreach row
 * @param {object} [p.notesOverride]  { [listingId]: editedPersonalNote }
 * @returns {{ recipients: Array, skips: object }}
 */
export async function filterSendable({ sb, candidates, notesOverride = {} }) {
  const skips = {
    no_listing: 0, not_active: 0, claimed: 0, no_email: 0, invalid_email: 0,
    suppressed: 0, already_sent: 0, duplicate_email: 0, email_already_contacted: 0,
  }

  // Suppression set for every candidate email, one query.
  const allEmails = [...new Set(
    candidates.map((c) => c.outreach?.contact_email).filter(Boolean).map((e) => e.toLowerCase())
  )]
  const suppressed = new Set()
  if (allEmails.length) {
    const { data: srows } = await sb.from('outreach_suppressions').select('email').in('email', allEmails)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  // Emails already contacted on ANY listing (multi-venue operators). Paged
  // read — Supabase caps a select at 1000 rows and the contacted set grows
  // past that once autopilot runs.
  const candidateEmails = new Set(allEmails)
  const alreadyContacted = new Set()
  if (allEmails.length) {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data: crows } = await sb
        .from('operator_outreach')
        .select('contact_email')
        .in('send_status', [...UNSENDABLE_STATUSES])
        .not('contact_email', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      for (const r of crows || []) {
        const lower = r.contact_email.toLowerCase()
        if (candidateEmails.has(lower)) alreadyContacted.add(lower)
      }
      if (!crows || crows.length < PAGE) break
    }
  }

  const recipients = []
  const seenEmails = new Set()

  for (const c of candidates) {
    const { listing, outreach: o } = c
    if (!listing) { skips.no_listing++; continue }
    if (listing.status !== 'active') { skips.not_active++; continue }
    if (listing.is_claimed) { skips.claimed++; continue }
    const email = o?.contact_email
    if (!email) { skips.no_email++; continue }
    if (!isSendableEmail(email)) { skips.invalid_email++; continue }
    const lower = email.toLowerCase()
    if (suppressed.has(lower)) { skips.suppressed++; continue }
    if (UNSENDABLE_STATUSES.has(o.send_status)) { skips.already_sent++; continue }
    if (seenEmails.has(lower)) { skips.duplicate_email++; continue }
    if (alreadyContacted.has(lower)) { skips.email_already_contacted++; continue }
    seenEmails.add(lower)
    const overridden = Object.prototype.hasOwnProperty.call(notesOverride, listing.id)
    const personalNote = overridden ? String(notesOverride[listing.id] || '') : (o.personal_note || '')
    recipients.push({ listing, outreachId: o.id, email, personalNote, noteEdited: overridden })
  }

  return { recipients, skips }
}

/**
 * Send one campaign (first touch or follow-up) to pre-filtered recipients.
 * Persists per-recipient delivery state and the campaign summary row.
 *
 * @param {object} p
 * @param {object} p.sb            service-role Supabase client
 * @param {Array}  p.recipients    from filterSendable()
 * @param {string} p.subject       raw subject with {{merge tokens}}
 * @param {string} p.body          raw body with {{merge tokens}}
 * @param {string} [p.campaignId]  defaults to a fresh cmp_/fup_ id
 * @param {string} [p.campaignName]
 * @param {string} [p.kind]        'manual' | 'autopilot' | 'followup'
 * @param {object} [p.segment]     filter snapshot stored on the campaign row
 * @param {boolean} [p.isFollowup] stamps followup_* columns instead of send_*
 * @param {function} [p.resolveTemplate]  optional (recipient) => ({subject, body})
 *                   for per-recipient templates (autopilot uses the vertical
 *                   variant per listing); falls back to the campaign subject/body
 * @returns {{ campaignId, sent, failed, errors }}
 */
export async function sendCampaign({
  sb, recipients, subject, body,
  campaignId = null, campaignName = null, kind = 'manual', segment = null,
  isFollowup = false, resolveTemplate = null,
}) {
  assertWithinSendWindow('Outreach')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const cid = campaignId || newCampaignId(isFollowup ? 'fup' : 'cmp')
  const now = () => new Date().toISOString()

  let sent = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE)
    const payloads = chunk.map((r) => {
      const unsub = unsubscribeUrl(r.email)
      const t = resolveTemplate ? resolveTemplate(r) : null
      const rendered = renderEmail({
        subject: t?.subject || subject, body: t?.body || body,
        listing: r.listing, origin: ORIGIN,
        unsubscribeUrl: unsub, removeUrl: removeListingUrl(r.email, r.listing?.id),
        personalNote: r.personalNote, campaignId: cid,
      })
      return {
        from: FROM,
        to: r.email,
        replyTo: REPLY_TO,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsub}>, <mailto:${REPLY_TO}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    let ids = []
    let chunkError = null
    try {
      const { data, error } = await resend.batch.send(payloads)
      if (error) chunkError = error.message || String(error)
      else ids = (data?.data || []).map((d) => d?.id || null)
    } catch (err) {
      chunkError = err.message
    }

    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j]
      if (chunkError) {
        failed++
        await sb.from('operator_outreach').update({
          send_error: chunkError.slice(0, 300),
          ...(isFollowup ? {} : { send_status: 'failed', campaign_id: cid }),
          updated_at: now(),
        }).eq('id', r.outreachId)
      } else {
        sent++
        const upd = isFollowup
          ? {
              followup_sent_at: now(),
              followup_resend_message_id: ids[j] || null,
              followup_campaign_id: cid,
              last_contacted_at: now(),
              send_error: null,
              updated_at: now(),
            }
          : {
              send_status: 'sent',
              resend_message_id: ids[j] || null,
              sent_at: now(),
              status: 'contacted',
              last_contacted_at: now(),
              campaign_id: cid,
              send_error: null,
              updated_at: now(),
            }
        if (r.noteEdited) upd.personal_note = r.personalNote || null
        await sb.from('operator_outreach').update(upd).eq('id', r.outreachId)
      }
    }
    if (chunkError) errors.push(chunkError)

    if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS)
  }

  await sb.from('outreach_campaigns').insert({
    id: cid,
    name: campaignName,
    subject,
    body,
    segment,
    total: recipients.length,
    sent,
    failed,
    skipped: 0,
    test_mode: false,
    status: 'sent',
    kind,
    created_by: kind === 'manual' ? 'admin' : 'autopilot',
    created_at: now(),
    sent_at: now(),
  })

  return { campaignId: cid, sent, failed, errors }
}
