import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { Resend } from 'resend'
// Stripe is loaded lazily to avoid build errors when STRIPE_SECRET_KEY is not set

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('events')
      .select('id, name, slug, description, location, start_date, end_date, submitter_email, submitter_name, status, stripe_payment_intent_id, submitted_at, approved_at, created_at')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ events: data || [] })
  } catch (err) {
    console.error('[admin/events] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { eventId, action } = await request.json()

    if (!eventId || !['approve', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch the event
    const { data: event, error: fetchError } = await sb
      .from('events')
      .select('id, name, slug, submitter_email, stripe_payment_intent_id, status')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (action === 'approve') {
      // Update status
      const { error: updateError } = await sb
        .from('events')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', eventId)

      if (updateError) throw updateError

      // Send approval email
      if (event.submitter_email && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'noreply@australianatlas.com.au',
          to: event.submitter_email,
          subject: `Your event "${event.name}" has been approved`,
          html: `
            <h2>Event approved</h2>
            <p>Great news! Your event <strong>${event.name}</strong> has been approved and is now live on Australian Atlas.</p>
            <p><a href="https://australianatlas.com.au/events/${event.slug}">View your event listing</a></p>
            <p>Thanks for being part of the Australian Atlas network.</p>
          `,
        }).catch(err => console.error('[admin/events] Email error:', err.message))
      }

      return NextResponse.json({ success: true, action: 'approved' })
    }

    if (action === 'decline') {
      // Update status
      const { error: updateError } = await sb
        .from('events')
        .update({ status: 'declined' })
        .eq('id', eventId)

      if (updateError) throw updateError

      // Issue Stripe refund if payment was made
      if (event.stripe_payment_intent_id && process.env.STRIPE_SECRET_KEY) {
        try {
          const Stripe = require('stripe')
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
          await stripe.refunds.create({
            payment_intent: event.stripe_payment_intent_id,
          })
        } catch (refundErr) {
          console.error('[admin/events] Refund error:', refundErr.message)
          // Continue even if refund fails — log it for manual resolution
        }
      }

      // Send decline email
      if (event.submitter_email && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'noreply@australianatlas.com.au',
          to: event.submitter_email,
          subject: `Update on your event "${event.name}"`,
          html: `
            <h2>Event update</h2>
            <p>Unfortunately, your event <strong>${event.name}</strong> was not approved for listing on Australian Atlas at this time.</p>
            ${event.stripe_payment_intent_id ? '<p>A full refund has been issued to your original payment method. Please allow a few business days for processing.</p>' : ''}
            <p>If you have questions, please reply to this email.</p>
          `,
        }).catch(err => console.error('[admin/events] Email error:', err.message))
      }

      return NextResponse.json({ success: true, action: 'declined' })
    }
  } catch (err) {
    console.error('[admin/events] POST error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
