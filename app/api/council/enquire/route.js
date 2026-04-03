import { NextResponse } from 'next/server'

export async function POST(request) {
  const body = await request.json()
  const { name, organisation, email, region, plan, message } = body

  if (!name || !organisation || !email || !region || !plan) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  // Send email via Resend
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: 'councils@australianatlas.com.au',
        subject: `Council enquiry — ${organisation} (${plan})`,
        html: `
          <h2>New council portal enquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Organisation:</strong> ${organisation}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Region:</strong> ${region}</p>
          <p><strong>Plan:</strong> ${plan}</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
        `,
      }),
    })

    if (!res.ok) {
      console.error('Resend error:', await res.text())
      // Still return success to the user
    }
  } catch (err) {
    console.error('Email send error:', err)
  }

  return NextResponse.json({ success: true })
}
