import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST(request) {
  try {
    const { email } = await request.json()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const normalised = email.toLowerCase().trim()

    const { data: existing } = await sb
      .from('newsletter_subscribers')
      .select('id, status')
      .eq('email', normalised)
      .single()

    if (existing) {
      if (existing.status === 'unsubscribed') {
        await sb.from('newsletter_subscribers').update({ status: 'active', resubscribed_at: new Date().toISOString() }).eq('id', existing.id)
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ error: 'already_subscribed' }, { status: 409 })
    }

    const { error } = await sb.from('newsletter_subscribers').insert({
      email: normalised,
      source: 'website',
      status: 'active',
    })

    if (error) throw error
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('Newsletter signup error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
