import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// ── Rate limiter (3 registrations per hour per IP) ──────────────────────────
const rateLimitMap = new Map()
function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now()
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs }
  entry.count++
  rateLimitMap.set(key, entry)
  return entry.count > maxRequests
}

function slugify(text) {
  return text.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (rateLimit(ip, 3, 3_600_000)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      )
    }

    const { business_name, contact_name, email, password, operator_type, website } = await request.json()

    // Validate required fields
    if (!business_name || !contact_name || !email || !password) {
      return NextResponse.json(
        { error: 'Business name, contact name, email, and password are required' },
        { status: 400 }
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }
    if (String(password).length < 6 || String(password).length > 72) {
      return NextResponse.json({ error: 'Password must be between 6 and 72 characters' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const normalizedEmail = String(email).trim().toLowerCase()

    // Provision via generateLink, NOT admin.createUser. createUser 500s on this
    // project (the signup trigger — see app/api/cron/auth-canary), which made
    // every registration here a dead end; generateLink auto-creates the user and
    // is the path the rest of the platform provisions through. The link itself
    // is discarded: the password below is what this account signs in with.
    const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'}/auth/callback?next=/operators/dashboard` },
    })

    if (linkError || !linkData?.user) {
      if (linkError?.message?.includes('already been registered') || linkError?.status === 422) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      console.error('[operators/register] Provision error:', linkError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    const authData = linkData

    // Set the password they just chose and confirm the address, so the client
    // can sign them straight in with it.
    const { error: pwError } = await sb.auth.admin.updateUserById(authData.user.id, {
      password,
      email_confirm: true,
    })
    if (pwError) {
      console.error('[operators/register] Password set error:', pwError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    // Generate unique slug from business_name
    let slug = slugify(business_name)
    const { data: existing } = await sb
      .from('operator_accounts')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      const suffix = Math.random().toString(36).substring(2, 6)
      slug = `${slug}-${suffix}`
    }

    // Insert operator account
    const { data: operator, error: insertError } = await sb
      .from('operator_accounts')
      .insert({
        user_id: authData.user.id,
        business_name,
        slug,
        contact_name,
        contact_email: email,
        operator_type: operator_type || null,
        website: website || null,
        status: 'trial',
        approved: false,
      })
      .select()
      .single()

    if (insertError) {
      // Unique violation on email in operator_accounts
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      console.error('[operators/register] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create operator account' }, { status: 500 })
    }

    // Send welcome email via Resend
    try {
      const { Resend } = require('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: email,
        subject: 'Welcome to Australian Atlas Operators',
        html: `
          <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
            <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; color: #1C1A17;">Welcome to Australian Atlas</h2>
            <p style="color: #6B6760;">Hi ${contact_name},</p>
            <p style="color: #6B6760;">Thanks for registering <strong>${business_name}</strong> as an operator on Australian Atlas.</p>
            <p style="color: #6B6760;">Your account is being reviewed and you'll be notified once it's approved. In the meantime, you can log in and start exploring the dashboard.</p>
            <div style="margin: 1.5rem 0;">
              <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'}/operators/login" style="background: #1C1A17; color: #fff; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; display: inline-block;">Log in to your dashboard</a>
            </div>
            <p style="color: #6B6760; font-size: 0.875rem;">If you didn't create this account, you can safely ignore this email.</p>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('[operators/register] Email send error:', emailErr)
    }

    return NextResponse.json({ success: true, slug })
  } catch (err) {
    console.error('[operators/register] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
