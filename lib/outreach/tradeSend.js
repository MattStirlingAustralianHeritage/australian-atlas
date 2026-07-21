// ============================================================
// Trade outreach send engine
// ------------------------------------------------------------
// The one place trade outreach email actually goes out. Used by the admin send
// route (manual batches) and the autopilot cron (scheduled batches +
// follow-ups) so eligibility rules, compliance headers, delivery bookkeeping
// and campaign records can never drift between the two — the same
// consolidation press (pressSend.js) and operators (sendEngine.js) already do.
//
// Reuses the operator send engine's proven primitives (isSendableEmail,
// unsubscribeUrl, newCampaignId, UNSENDABLE_STATUSES) — the batch-poison guard
// and unsubscribe token are identical across audiences. Trade-specific extras:
// companies that already hold a trade account are partners, not prospects, and
// onboarded rows are skipped; every render carries the network-wide listing
// count so {{network_count}} / unlinked {{listing_count}} resolve.
//
// Writes to trade_outreach and stamps outreach_campaigns.audience = 'trade'.
// ============================================================

import { renderTradeEmail, REPLY_TO } from '@/lib/outreach/tradeTemplate'
import { isSendableEmail, newCampaignId, unsubscribeUrl, UNSENDABLE_STATUSES } from '@/lib/outreach/sendEngine'
import { assertWithinSendWindow } from '@/lib/outreach/sendWindow'

export { isSendableEmail, newCampaignId }

// A real person reaches out; replies go to matt@ (the trade desk).
export const FROM = 'Matt at Australian Atlas <matt@australianatlas.com.au>'
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

const BATCH_SIZE = 100
const BATCH_DELAY_MS = 600
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Network-wide active listing count, so {{network_count}} (and an unlinked
 * row's {{listing_count}}) render a real number. Best-effort — the template
 * renderer falls back to a safe phrase when null.
 */
export async function fetchNetworkCount(sb) {
  try {
    const { count } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
    return count ?? null
  } catch {
    return null
  }
}

/**
 * Filter trade_outreach rows down to the recipients this run may actually
 * email, tracking why each exclusion happened. Trade-specific skips: a company
 * that already holds a trade_accounts row is a partner (not a prospect), and an
 * 'onboarded' funnel status is never re-emailed.
 *
 * @param {object} p
 * @param {object} p.sb            service-role Supabase client
 * @param {Array}  p.rows          trade_outreach rows (with regions join + personal_note)
 * @param {object} [p.notesOverride]  { [tradeId]: editedPersonalNote }
 * @returns {{ recipients: Array, skips: object }}
 */
export async function filterSendableTrade({ sb, rows, notesOverride = {} }) {
  const skips = { no_row: 0, onboarded: 0, already_partner: 0, no_email: 0, invalid_email: 0, suppressed: 0, already_sent: 0, duplicate_email: 0 }

  const allEmails = [...new Set(
    rows.map((r) => r?.contact_email).filter(Boolean).map((e) => e.toLowerCase())
  )]

  const suppressed = new Set()
  if (allEmails.length) {
    const { data: srows } = await sb.from('outreach_suppressions').select('email').in('email', allEmails)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  // Companies that already hold a trade account are partners, not prospects —
  // the analogue of an operator's claimed listing / a council's account.
  const partnerEmails = new Set()
  try {
    const { data: accounts } = await sb.from('trade_accounts').select('contact_email')
    for (const a of accounts || []) if (a.contact_email) partnerEmails.add(a.contact_email.toLowerCase())
  } catch { /* table always exists in prod; guard is belt-and-braces */ }

  const recipients = []
  const seen = new Set()
  for (const p of rows) {
    if (!p) { skips.no_row++; continue }
    if (p.status === 'onboarded') { skips.onboarded++; continue }
    const email = p.contact_email
    if (!email) { skips.no_email++; continue }
    if (!isSendableEmail(email)) { skips.invalid_email++; continue }
    const lower = email.toLowerCase()
    if (partnerEmails.has(lower)) { skips.already_partner++; continue }
    if (suppressed.has(lower)) { skips.suppressed++; continue }
    if (UNSENDABLE_STATUSES.has(p.send_status)) { skips.already_sent++; continue }
    if (seen.has(lower)) { skips.duplicate_email++; continue }
    seen.add(lower)
    const overridden = Object.prototype.hasOwnProperty.call(notesOverride, p.id)
    const personalNote = overridden ? String(notesOverride[p.id] || '') : (p.personal_note || '')
    recipients.push({ company: p, region: p.regions || null, email, personalNote, noteEdited: overridden })
  }
  return { recipients, skips }
}

/**
 * Send one trade campaign (first touch or follow-up) to pre-filtered
 * recipients. Persists per-recipient delivery state and the campaign summary.
 *
 * @param {object} p
 * @param {object}  p.sb           service-role Supabase client
 * @param {Array}   p.recipients   from filterSendableTrade()
 * @param {string}  p.subject      raw subject with {{merge tokens}}
 * @param {string}  p.body         raw body with {{merge tokens}}
 * @param {string}  [p.campaignId]
 * @param {string}  [p.campaignName]
 * @param {string}  [p.kind]       'manual' | 'autopilot' | 'followup'
 * @param {object}  [p.segment]    filter snapshot stored on the campaign row
 * @param {boolean} [p.isFollowup] stamps followup_* columns instead of send_*
 * @param {number|null} [p.networkCount]  pre-fetched network count (else fetched)
 * @param {function}[p.resolveTemplate]  optional (recipient) => ({subject, body})
 * @returns {{ campaignId, sent, failed, errors }}
 */
export async function sendTradeCampaign({
  sb, recipients, subject, body,
  campaignId = null, campaignName = null, kind = 'manual', segment = null,
  isFollowup = false, networkCount = undefined, resolveTemplate = null,
}) {
  assertWithinSendWindow('Trade outreach')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const netCount = networkCount === undefined ? await fetchNetworkCount(sb) : networkCount
  const cid = campaignId || newCampaignId(isFollowup ? 'tfup' : 'trade')
  const now = () => new Date().toISOString()

  let sent = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE)
    const payloads = chunk.map((r) => {
      const unsub = unsubscribeUrl(r.email, ORIGIN)
      const t = resolveTemplate ? resolveTemplate(r) : null
      const rendered = renderTradeEmail({
        subject: t?.subject || subject, body: t?.body || body,
        company: r.company, region: r.region, origin: ORIGIN,
        unsubscribeUrl: unsub, personalNote: r.personalNote, networkCount: netCount,
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
        await sb.from('trade_outreach').update({
          send_error: chunkError.slice(0, 300),
          ...(isFollowup ? {} : { send_status: 'failed', campaign_id: cid }),
          updated_at: now(),
        }).eq('id', r.company.id)
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
        await sb.from('trade_outreach').update(upd).eq('id', r.company.id)
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
    audience: 'trade',
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
