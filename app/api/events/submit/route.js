import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function geocode(address, suburb, state) {
  try {
    const query = `${address}, ${suburb}, ${state}, Australia`
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=au`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (info@australianatlas.com.au)' },
    })
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (err) {
    console.error('[events] Geocode error:', err.message)
  }
  return { lat: null, lng: null }
}

async function lookupRegion(supabase, lat, lng) {
  if (!lat || !lng) return null
  try {
    const { data } = await supabase.rpc('find_region_for_point', { p_lat: lat, p_lng: lng })
    return data || null
  } catch {
    return null
  }
}

function generateApproveToken(eventId) {
  const secret = process.env.EVENTS_APPROVE_SECRET
  return createHmac('sha256', secret).update(eventId).digest('hex')
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
    console.error('[events] Email send error:', err.message)
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      paymentIntentId,
      name,
      description,
      category,
      startDate,
      endDate,
      locationName,
      address,
      suburb,
      state,
      websiteUrl,
      ticketUrl,
      imageUrl,
      verticals,
      submitterName,
      submitterEmail,
      submitterOrganisation,
    } = body

    // Verify payment succeeded
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    // Generate slug
    const year = new Date(startDate).getFullYear()
    const slug = `${slugify(name)}-${year}`

    // Geocode address
    const { lat, lng } = await geocode(address, suburb, state)

    // Spatial region lookup
    const supabase = getSupabaseAdmin()
    const regionId = await lookupRegion(supabase, lat, lng)

    // Save event
    const { data: event, error: insertError } = await supabase
      .from('events')
      .insert({
        name,
        slug,
        description,
        category: category.toLowerCase(),
        start_date: startDate,
        end_date: endDate,
        location_name: locationName,
        address,
        suburb,
        state,
        lat,
        lng,
        website_url: websiteUrl || null,
        ticket_url: ticketUrl || null,
        image_url: imageUrl,
        verticals: verticals || ['australian-atlas'],
        region_id: regionId,
        submitter_name: submitterName,
        submitter_email: submitterEmail,
        submitter_organisation: submitterOrganisation || null,
        status: 'pending',
        stripe_payment_intent_id: paymentIntentId,
        payment_status: 'paid',
        amount_paid: 4900,
      })
      .select('id, slug')
      .single()

    if (insertError) {
      console.error('[events] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save event' }, { status: 500 })
    }

    // Generate approve link
    const token = generateApproveToken(event.id)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au'
    const approveUrl = `${baseUrl}/api/events/approve?id=${event.id}&token=${token}`

    // Send confirmation email to submitter
    await sendEmail(
      submitterEmail,
      `Event submitted: ${name}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <h2 style="font-size: 22px; color: #1a1614; margin-bottom: 16px;">Thanks for submitting your event</h2>
          <p style="color: #6b6560; line-height: 1.6;">
            We've received <strong>${name}</strong> and will review it within 48 hours.
            You'll receive another email once it's been approved and is live on Australian Atlas.
          </p>
          <hr style="border: none; border-top: 1px solid #e8e4df; margin: 24px 0;" />
          <p style="color: #999; font-size: 13px;">Australian Atlas</p>
        </div>
      `
    )

    // Send notification email to admin with one-click approve
    await sendEmail(
      'matt@australianatlas.com.au',
      `New event submission: ${name}`,
      `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <h2 style="font-size: 22px; color: #1a1614; margin-bottom: 16px;">New event submission</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 8px 0; color: #6b6560; width: 120px;">Event</td><td style="padding: 8px 0; color: #1a1614;"><strong>${name}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #6b6560;">Category</td><td style="padding: 8px 0; color: #1a1614;">${category}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b6560;">Dates</td><td style="padding: 8px 0; color: #1a1614;">${startDate} to ${endDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b6560;">Location</td><td style="padding: 8px 0; color: #1a1614;">${locationName}, ${suburb} ${state}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b6560;">Submitted by</td><td style="padding: 8px 0; color: #1a1614;">${submitterName} (${submitterEmail})</td></tr>
            <tr><td style="padding: 8px 0; color: #6b6560;">Payment</td><td style="padding: 8px 0; color: #1a1614;">$49 AUD — paid</td></tr>
          </table>
          <a href="${approveUrl}" style="display: inline-block; background: #5f8a7e; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500;">Approve event</a>
          <hr style="border: none; border-top: 1px solid #e8e4df; margin: 24px 0;" />
          <p style="color: #999; font-size: 13px;">Australian Atlas — Event Submissions</p>
        </div>
      `
    )

    return NextResponse.json({ success: true, slug: event.slug })
  } catch (err) {
    console.error('[events] Submit error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
