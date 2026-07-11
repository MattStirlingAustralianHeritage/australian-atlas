import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

// Resend delivery webhook. Feeds hard bounces + spam complaints into the
// suppression list (protects sender reputation and honours recipients who mark
// us as spam) and records delivery outcomes on operator_outreach.
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
  const messageId = data.email_id || data.id || null
  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()

  try {
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
          .eq('resend_message_id', messageId)
        await sb
          .from('council_outreach')
          .update({ send_status: reason, updated_at: now })
          .eq('resend_message_id', messageId)
        await sb
          .from('trade_outreach')
          .update({ send_status: reason, updated_at: now })
          .eq('resend_message_id', messageId)
      }
    } else if (type === 'email.delivered') {
      // Leave send_status as 'sent'; delivery is the happy path. No-op keeps the
      // funnel clean, but we could record delivered_at here later if useful.
    }
  } catch (err) {
    console.error('[resend-webhook] processing error:', err.message)
    // Return 200 anyway so Resend doesn't hammer retries for a transient DB blip.
  }

  return NextResponse.json({ ok: true })
}
