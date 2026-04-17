import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { isApprovedDomain } from '@/lib/council-config'
import { createSessionValue } from '@/lib/council-session'
import crypto from 'crypto'

// Log auth attempt (silently fails if table doesn't exist)
async function logAuthAttempt(sb, { email, success, failureReason, ip }) {
  try {
    await sb.from('council_auth_log').insert({
      email: email?.toLowerCase()?.trim() || '',
      success,
      failure_reason: failureReason || null,
      ip_address: ip || null,
    })
  } catch (err) {
    console.error('Failed to log auth attempt:', err)
  }
}

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
}

// ── Rate limiter for magic links (3 requests per 15 minutes per IP) ──────────
const _rateMagic = new Map()
function _checkMagicRate(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const windowMs = 900_000 // 15 minutes
  let entry = _rateMagic.get(ip)
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 }
    _rateMagic.set(ip, entry)
  }
  entry.count++
  if (entry.count > 3) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    )
  }
  return null
}

// POST: Send magic link or verify token
export async function POST(req) {
  const rateLimited = _checkMagicRate(req)
  if (rateLimited) return rateLimited

  try {
    const { action, email, token } = await req.json()
    const sb = getSupabaseAdmin()
    const ip = getClientIp(req)

    if (action === 'send-magic-link') {
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

      const normalised = email.toLowerCase().trim()

      // Generic success message — used whether account exists or not
      const genericResponse = NextResponse.json({
        ok: true,
        message: 'If you have an account, you\'ll receive a login code shortly',
      })

      // Find council account by email
      const { data: council } = await sb
        .from('council_accounts')
        .select('id, name, contact_email, status, approved')
        .eq('contact_email', normalised)
        .single()

      // Account not found — return generic message, log failure
      if (!council) {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: 'account_not_found', ip })
        return genericResponse
      }

      // Account not approved — return distinct pending message
      if (!council.approved) {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: 'not_approved', ip })
        return NextResponse.json({
          ok: true,
          message: 'Your account is pending approval. We\'ll email you when it\'s ready.',
          pending: true,
        })
      }

      // Domain not whitelisted — return generic message, log failure
      if (!isApprovedDomain(normalised)) {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: 'domain_not_whitelisted', ip })
        return genericResponse
      }

      // Account suspended or cancelled — return generic message, log failure
      if (council.status === 'cancelled' || council.status === 'suspended') {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: `status_${council.status}`, ip })
        return genericResponse
      }

      // All checks passed — generate OTP and send
      const magicToken = crypto.randomInt(100000, 999999).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

      await sb
        .from('council_accounts')
        .update({
          magic_link_token: magicToken,
          magic_link_expires_at: expiresAt.toISOString(),
        })
        .eq('id', council.id)

      // Send email via Resend
      try {
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Australian Atlas <verify@australianatlas.com.au>',
          to: council.contact_email,
          subject: 'Your Australian Atlas login code',
          html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
              <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; color: #1C1A17;">Australian Atlas</h2>
              <p style="color: #6B6760;">Hi ${council.name},</p>
              <p style="color: #6B6760;">Your login code is:</p>
              <div style="background: #F8F6F1; border-radius: 8px; padding: 1.5rem; text-align: center; margin: 1.5rem 0;">
                <span style="font-size: 2rem; font-weight: 600; letter-spacing: 0.2em; color: #1C1A17;">${magicToken}</span>
              </div>
              <p style="color: #6B6760; font-size: 0.875rem;">This code expires in 15 minutes.</p>
              <p style="color: #6B6760; font-size: 0.875rem;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        })
      } catch (emailErr) {
        console.error('Failed to send magic link email:', emailErr)
        // In development, log the code to console
        console.log(`[DEV] Magic link code for ${email}: ${magicToken}`)
      }

      await logAuthAttempt(sb, { email: normalised, success: true, failureReason: null, ip })

      return genericResponse
    }

    if (action === 'verify-token') {
      if (!email || !token) {
        return NextResponse.json({ error: 'Email and token required' }, { status: 400 })
      }

      const { data: council } = await sb
        .from('council_accounts')
        .select('id, name, slug, tier, status, approved, magic_link_token, magic_link_expires_at')
        .eq('contact_email', email.toLowerCase().trim())
        .single()

      if (!council) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }

      if (council.magic_link_token !== token) {
        return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
      }

      if (new Date(council.magic_link_expires_at) < new Date()) {
        return NextResponse.json({ error: 'Code has expired. Request a new one.' }, { status: 401 })
      }

      // Clear token and update login time
      await sb
        .from('council_accounts')
        .update({
          magic_link_token: null,
          magic_link_expires_at: null,
          last_login_at: new Date().toISOString(),
        })
        .eq('id', council.id)

      // Log activity
      await sb.from('council_activity').insert({
        council_id: council.id,
        action: 'login',
      })

      // Create session cookie value (council_id:slug signed with HMAC)
      const sessionValue = createSessionValue(council.id, council.slug)

      const response = NextResponse.json({
        ok: true,
        council: { id: council.id, name: council.name, slug: council.slug, tier: council.tier },
      })

      response.cookies.set('council_session', sessionValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })

      return response
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Council auth error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Logout
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('council_session', '', { maxAge: 0, path: '/' })
  return response
}
