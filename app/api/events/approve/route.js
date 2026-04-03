import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

function verifyToken(eventId, token) {
  const secret = process.env.EVENTS_APPROVE_SECRET
  const expected = createHmac('sha256', secret).update(eventId).digest('hex')
  return token === expected
}

async function sendEmail(to, subject, html) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: [to],
        subject,
        html,
      }),
    })
  } catch (err) {
    console.error('[events] Approval email error:', err.message)
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const token = searchParams.get('token')

  if (!id || !token) {
    return new NextResponse('<html><body><h1>Invalid link</h1></body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!verifyToken(id, token)) {
    return new NextResponse('<html><body><h1>Invalid or expired token</h1></body></html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const supabase = getSupabaseAdmin()

  // Get event details
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('id, name, submitter_email, submitter_name, slug, status')
    .eq('id', id)
    .single()

  if (fetchError || !event) {
    return new NextResponse('<html><body><h1>Event not found</h1></body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (event.status === 'approved') {
    return new NextResponse(
      `<html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #faf8f5;">
          <div style="text-align: center; max-width: 400px;">
            <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
            <h1 style="font-size: 22px; color: #1a1614; margin-bottom: 8px;">Already approved</h1>
            <p style="color: #6b6560;">This event has already been approved and is live.</p>
          </div>
        </body>
      </html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Approve the event
  const { error: updateError } = await supabase
    .from('events')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    console.error('[events] Approve update error:', updateError)
    return new NextResponse('<html><body><h1>Failed to approve event</h1></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Send approval email to submitter
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au'
  await sendEmail(
    event.submitter_email,
    `Your event is live: ${event.name}`,
    `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
        <h2 style="font-size: 22px; color: #1a1614; margin-bottom: 16px;">Your event is now live</h2>
        <p style="color: #6b6560; line-height: 1.6;">
          Great news, ${event.submitter_name}! <strong>${event.name}</strong> has been approved and is now live on Australian Atlas.
        </p>
        <a href="${baseUrl}/events/${event.slug}" style="display: inline-block; background: #5f8a7e; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 16px;">View your event</a>
        <hr style="border: none; border-top: 1px solid #e8e4df; margin: 24px 0;" />
        <p style="color: #999; font-size: 13px;">Australian Atlas</p>
      </div>
    `
  )

  return new NextResponse(
    `<html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #faf8f5;">
        <div style="text-align: center; max-width: 400px;">
          <div style="font-size: 48px; margin-bottom: 16px; color: #5f8a7e;">&#10003;</div>
          <h1 style="font-size: 22px; color: #1a1614; margin-bottom: 8px;">Event approved and now live</h1>
          <p style="color: #6b6560; margin-bottom: 24px;"><strong>${event.name}</strong> is now visible on the site.</p>
          <a href="${baseUrl}/events/${event.slug}" style="color: #5f8a7e; text-decoration: underline;">View event listing</a>
        </div>
      </body>
    </html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
