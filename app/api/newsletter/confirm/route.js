import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifyNewsletterToken } from '@/lib/newsletter/confirmToken'

// Newsletter double opt-in confirmation. The link in the confirmation email
// lands here; we verify the signed token, then (and only then) write the
// subscriber as 'active'. Renders a small branded landing page either way.
function page(title, message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${title} · Australian Atlas</title></head>
<body style="margin:0; background:#faf8f5; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; -webkit-font-smoothing:antialiased;">
  <div style="max-width:520px; margin:13vh auto; padding:44px 40px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px; text-align:center;">
    <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-size:22px; color:#1C1A17; letter-spacing:0.01em;">Australian Atlas</div>
    <div style="width:34px; height:1px; background:#d8d4cd; margin:18px auto 0;"></div>
    <h1 style="font-family:'Playfair Display',Georgia,'Times New Roman',serif; font-weight:400; font-size:26px; color:#1C1A17; line-height:1.2; margin:28px 0 0;">${title}</h1>
    <p style="font-size:15px; font-weight:300; line-height:1.7; color:#6B6760; margin:16px 0 28px;">${message}</p>
    <a href="https://www.australianatlas.com.au" style="display:inline-block; padding:14px 32px; background:#1C1A17; color:#ffffff; text-decoration:none; border-radius:999px; font-size:14px; font-weight:500;">Explore the Atlas</a>
  </div>
</body></html>`
}
const htmlResponse = (title, message, status = 200) =>
  new NextResponse(page(title, message), { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token')
  const email = verifyNewsletterToken(token)
  if (!email) {
    return htmlResponse('Link expired', 'This confirmation link is invalid or has expired. Please subscribe again to get a fresh one.', 400)
  }

  try {
    const sb = getSupabaseAdmin()
    const { data: existing } = await sb
      .from('newsletter_subscribers')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      if (existing.status !== 'active') {
        await sb
          .from('newsletter_subscribers')
          .update({ status: 'active', resubscribed_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } else {
      await sb.from('newsletter_subscribers').insert({ email, source: 'website', status: 'active' })
    }

    return htmlResponse('You&rsquo;re on the list', 'Your subscription is confirmed. Welcome to the Atlas &mdash; one independent place, every week.')
  } catch (err) {
    console.error('[newsletter/confirm] error:', err.message)
    return htmlResponse('Something went wrong', 'We could not confirm your subscription just now. Please try again shortly.', 500)
  }
}
