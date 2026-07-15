import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// Beta feedback from newsroom members (the council feedback pattern).

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function POST(req) {
  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  const session = validatePressSession(cookie?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { category, message, page } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data: account } = await sb
      .from('press_accounts')
      .select('id, name, outlet, contact_email')
      .eq('id', session.pressId)
      .single()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    await sb.from('press_feedback').insert({
      press_id: account.id,
      press_name: `${account.name} — ${account.outlet}`,
      category: category ? String(category).slice(0, 50) : null,
      message: String(message).trim().slice(0, 4000),
      page: page ? String(page).slice(0, 200) : null,
    })

    await sb.from('press_activity').insert({
      press_id: account.id,
      action: 'feedback',
      metadata: { category: category || null },
    })

    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: PRESS_CONTACT_EMAIL,
          replyTo: account.contact_email,
          subject: `Newsroom feedback — ${account.outlet}${category ? ` (${category})` : ''}`,
          html: `
            <p><strong>${escapeHtml(account.name)}</strong> — ${escapeHtml(account.outlet)}</p>
            ${page ? `<p>Page: ${escapeHtml(page)}</p>` : ''}
            <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
          `,
        })
      }
    } catch (err) {
      console.error('Press feedback email error:', err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Press feedback error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
