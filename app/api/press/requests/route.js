import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// Story requests from the newsroom: interviews, data pulls, comment, images.
// The request lands with the press desk (email + row); status is tracked in
// press_requests and shown back to the member.

const REQUEST_TYPES = ['interview', 'data', 'comment', 'images', 'other']

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
    const { requestType, subject, message, deadline, listingId, regionId } = await req.json()
    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data: account } = await sb
      .from('press_accounts')
      .select('id, name, outlet, contact_email')
      .eq('id', session.pressId)
      .single()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const type = REQUEST_TYPES.includes(requestType) ? requestType : 'other'

    const { data: row, error } = await sb.from('press_requests').insert({
      press_id: account.id,
      press_name: account.name,
      outlet: account.outlet,
      contact_email: account.contact_email,
      request_type: type,
      listing_id: listingId || null,
      region_id: regionId || null,
      subject: String(subject).trim().slice(0, 200),
      message: String(message).trim().slice(0, 4000),
      deadline: deadline || null,
    }).select('id, request_type, subject, status, created_at, deadline').single()
    if (error) throw error

    await sb.from('press_activity').insert({
      press_id: account.id,
      action: 'request_created',
      metadata: { request_id: row.id, type },
    })

    // Notify the press desk (best-effort).
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: PRESS_CONTACT_EMAIL,
          replyTo: account.contact_email,
          subject: `Press request (${type}) — ${account.outlet}: ${escapeHtml(subject).slice(0, 80)}`,
          html: `
            <h2>New press request</h2>
            <p><strong>From:</strong> ${escapeHtml(account.name)} — ${escapeHtml(account.outlet)} (${escapeHtml(account.contact_email)})</p>
            <p><strong>Type:</strong> ${type}</p>
            ${deadline ? `<p><strong>Deadline:</strong> ${escapeHtml(deadline)}</p>` : ''}
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'}/admin/press">Open the press admin</a></p>
          `,
        })
      }
    } catch (err) {
      console.error('Press request email error:', err)
    }

    return NextResponse.json({ ok: true, request: row })
  } catch (err) {
    console.error('Press request error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
