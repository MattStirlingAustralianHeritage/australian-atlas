import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

// Resend delivery webhook — the feedback half of the outreach engine.
//
//   email.bounced / email.complained → suppression list (protects sender
//     reputation, honours spam reports) + send_status on the funnel tables
//   email.delivered / email.opened / email.clicked → engagement stamps on
//     operator_outreach, so campaigns report a real funnel and the autopilot
//     knows who to follow up
//
// Every event is also appended raw to outreach_events for debugging/audit.
//
// Configure at resend.com/webhooks pointing to /api/webhooks/resend. If
// RESEND_WEBHOOK_SECRET (whsec_…) is set we verify the Svix signature; if not,
// we still process (so it works before the secret is wired) but log a warning.

function verifySvix(secret, headers, payload) {
  try {
    const id = headers.get('svix-id')
    const timestamp = headers.get('svix-timestamp')
    const sigHeader = headers.get('svix-signature')
    if (!id || !timestamp || !sigHeader) return false
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const signedContent = `${id}.${timestamp}.${payload}`
    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')
    // Header is a space-delimited list of "v1,<sig>" pairs.
    return sigHeader.split(' ').some((part) => {
      const sig = part.split(',')[1]
      if (!sig) return false
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    })
  } catch {
    return false
  }
}

// Locate the operator_outreach row a message id belongs to — first touch
// (resend_message_id) or follow-up (followup_resend_message_id).
async function findOperatorRow(sb, messageId) {
  const { data: first } = await sb
    .from('operator_outreach')
    .select('id, opened_at, open_count, clicked_at, click_count, delivered_at')
    .eq('resend_message_id', messageId)
    .limit(1)
  if (first && first.length) return first[0]
  const { data: fup } = await sb
    .from('operator_outreach')
    .select('id, opened_at, open_count, clicked_at, click_count, delivered_at')
    .eq('followup_resend_message_id', messageId)
    .limit(1)
  return (fup && fup[0]) || null
}

// Locate the press_outreach row a message id belongs to (first touch or
// follow-up). Press open-rate is the key outreach KPI, so we track it — but
// only look here when the operator lookup misses, keeping the hot path cheap.
async function findPressRow(sb, messageId) {
  const { data: first } = await sb
    .from('press_outreach')
    .select('id, opened_at, open_count, delivered_at')
    .eq('resend_message_id', messageId)
    .limit(1)
  if (first && first.length) return first[0]
  const { data: fup } = await sb
    .from('press_outreach')
    .select('id, opened_at, open_count, delivered_at')
    .eq('followup_resend_message_id', messageId)
    .limit(1)
  return (fup && fup[0]) || null
}

// Locate the trade_outreach row a message id belongs to (first touch or
// follow-up). Trade open-rate feeds the same funnel as operators/press — looked
// up only when the operator and press lookups miss, keeping the hot path cheap.
async function findTradeRow(sb, messageId) {
  const { data: first } = await sb
    .from('trade_outreach')
    .select('id, opened_at, open_count, delivered_at')
    .eq('resend_message_id', messageId)
    .limit(1)
  if (first && first.length) return first[0]
  const { data: fup } = await sb
    .from('trade_outreach')
    .select('id, opened_at, open_count, delivered_at')
    .eq('followup_resend_message_id', messageId)
    .limit(1)
  return (fup && fup[0]) || null
}

export async function POST(request) {
  const raw = await request.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (secret) {
    if (!verifySvix(secret, request.headers, raw)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not set — processing unverified')
  }

  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const type = event?.type
  const data = event?.data || {}
  const to = Array.isArray(data.to) ? data.to[0] : data.to
  const email = to ? String(to).toLowerCase().trim() : null
  // Resend ids are uuid-shaped; reject anything else so the id can be safely
  // interpolated into a PostgREST .or() filter.
  const rawId = data.email_id || data.id || null
  const messageId = rawId && /^[A-Za-z0-9_-]{8,64}$/.test(String(rawId)) ? String(rawId) : null
  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()

  try {
    // Raw audit trail (trimmed payload — subject + the interesting bits).
    if (type && type.startsWith('email.')) {
      await sb.from('outreach_events').insert({
        message_id: messageId,
        email,
        event: type.replace(/^email\./, ''),
        payload: {
          subject: data.subject || null,
          link: data.click?.link || null,
          bounce: data.bounce?.message || null,
          created_at: event.created_at || null,
        },
      }).then(({ error }) => {
        // Pre-migration (table missing) must never break suppression handling.
        if (error) console.warn('[resend-webhook] event log skipped:', error.message)
      })
    }

    if (type === 'email.bounced' || type === 'email.complained') {
      const reason = type === 'email.complained' ? 'complained' : 'bounced'
      if (email) {
        await sb.from('outreach_suppressions').upsert(
          { email, reason, detail: data.bounce?.message || data.reason || null },
          { onConflict: 'email' }
        )
      }
      if (messageId) {
        // The message id lives on exactly one of the funnel tables; the
        // updates are cheap no-ops on the others.
        await sb
          .from('operator_outreach')
          .update({ send_status: reason, updated_at: now })
          .or(`resend_message_id.eq.${messageId},followup_resend_message_id.eq.${messageId}`)
        await sb
          .from('council_outreach')
          .update({ send_status: reason, updated_at: now })
          .eq('resend_message_id', messageId)
        await sb
          .from('trade_outreach')
          .update({ send_status: reason, updated_at: now })
          .or(`resend_message_id.eq.${messageId},followup_resend_message_id.eq.${messageId}`)
        await sb
          .from('press_outreach')
          .update({ send_status: reason, updated_at: now })
          .or(`resend_message_id.eq.${messageId},followup_resend_message_id.eq.${messageId}`)
      }
    } else if (type === 'email.delivered' && messageId) {
      const row = await findOperatorRow(sb, messageId)
      if (row && !row.delivered_at) {
        await sb.from('operator_outreach').update({ delivered_at: now, updated_at: now }).eq('id', row.id)
      } else if (!row) {
        const pr = await findPressRow(sb, messageId)
        if (pr && !pr.delivered_at) {
          await sb.from('press_outreach').update({ delivered_at: now, updated_at: now }).eq('id', pr.id)
        } else if (!pr) {
          const tr = await findTradeRow(sb, messageId)
          if (tr && !tr.delivered_at) {
            await sb.from('trade_outreach').update({ delivered_at: now, updated_at: now }).eq('id', tr.id)
          }
        }
      }
    } else if (type === 'email.opened' && messageId) {
      const row = await findOperatorRow(sb, messageId)
      if (row) {
        await sb.from('operator_outreach').update({
          opened_at: row.opened_at || now,
          open_count: (row.open_count || 0) + 1,
          updated_at: now,
        }).eq('id', row.id)
      } else {
        const pr = await findPressRow(sb, messageId)
        if (pr) {
          await sb.from('press_outreach').update({
            opened_at: pr.opened_at || now,
            open_count: (pr.open_count || 0) + 1,
            updated_at: now,
          }).eq('id', pr.id)
        } else {
          const tr = await findTradeRow(sb, messageId)
          if (tr) {
            await sb.from('trade_outreach').update({
              opened_at: tr.opened_at || now,
              open_count: (tr.open_count || 0) + 1,
              updated_at: now,
            }).eq('id', tr.id)
          }
        }
      }
    } else if (type === 'email.clicked' && messageId) {
      const row = await findOperatorRow(sb, messageId)
      if (row) {
        await sb.from('operator_outreach').update({
          clicked_at: row.clicked_at || now,
          click_count: (row.click_count || 0) + 1,
          // A click implies the open even if the tracking pixel was blocked.
          opened_at: row.opened_at || now,
          open_count: row.opened_at ? (row.open_count || 0) : (row.open_count || 0) + 1,
          updated_at: now,
        }).eq('id', row.id)
      }
    }
  } catch (err) {
    console.error('[resend-webhook] processing error:', err.message)
    // Return 200 anyway so Resend doesn't hammer retries for a transient DB blip.
  }

  return NextResponse.json({ ok: true })
}
