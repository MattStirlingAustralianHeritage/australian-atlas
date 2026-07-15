import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifyPressUnsubscribeToken } from '@/lib/press/tokens'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// One-click unsubscribe for newsroom notifications. GET renders a plain
// confirmation page (a human clicked the footer link); POST is the RFC 8058
// one-click endpoint mail clients call. Both flip the account's cadence to
// 'off' — the account and its follows survive, so a member can re-enable
// from /newsroom/settings whenever they like. Full deletion lives in
// settings (DELETE /api/press/settings).

async function unsubscribe(token) {
  const verified = verifyPressUnsubscribeToken(token)
  if (!verified) return { ok: false }

  const sb = getSupabaseAdmin()
  const { data: account } = await sb
    .from('press_accounts')
    .select('id, contact_email, outlet')
    .eq('id', verified.pressId)
    .single()
  // Token email must still match the account email — a stale token for a
  // reassigned address must not switch someone else's notifications off.
  if (!account || account.contact_email.toLowerCase() !== verified.email) {
    return { ok: false }
  }

  await sb
    .from('press_accounts')
    .update({ cadence: 'off', updated_at: new Date().toISOString() })
    .eq('id', account.id)

  await sb.from('press_activity').insert({
    press_id: account.id,
    action: 'unsubscribed',
    metadata: { via: 'email_link' },
  })

  return { ok: true }
}

function page(title, body) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family: -apple-system, 'Segoe UI', sans-serif; background: #EFE7D8; margin: 0; padding: 3rem 1.5rem;">
  <div style="max-width: 460px; margin: 0 auto; background: #faf8f5; border: 1px solid #E7DCC6; border-radius: 12px; padding: 2rem;">
    <p style="font-family: Georgia, serif; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6760; margin: 0 0 14px;">Australian Atlas · Newsroom</p>
    <h1 style="font-family: Georgia, serif; font-weight: 400; font-size: 22px; color: #1C1A17; margin: 0 0 10px;">${title}</h1>
    <p style="font-size: 14px; color: #3D3A34; line-height: 1.6; margin: 0;">${body}</p>
  </div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const result = await unsubscribe(searchParams.get('token'))
  if (!result.ok) {
    return page('That link didn\'t work', `The unsubscribe link is invalid or out of date. Email ${PRESS_CONTACT_EMAIL} and we'll sort it by hand.`)
  }
  return page(
    'You\'re unsubscribed',
    'No more notification emails from the Newsroom. Your account and region follows are untouched — you can switch notifications back on any time from your <a href="/newsroom/settings" style="color:#4a7166;">newsroom settings</a>.'
  )
}

// RFC 8058 one-click (List-Unsubscribe-Post) — mail clients POST here.
export async function POST(req) {
  const { searchParams } = new URL(req.url)
  const result = await unsubscribe(searchParams.get('token'))
  return NextResponse.json({ ok: result.ok })
}
