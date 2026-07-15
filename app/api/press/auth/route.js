import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createPressSessionValue, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'
import crypto from 'crypto'

// Passwordless OTP login for the Newsroom — the council auth flow verbatim,
// against press_accounts. Admin approval is the security gate; a 6-digit
// code may be guessed at most MAX_OTP_ATTEMPTS times before it burns.
const MAX_OTP_ATTEMPTS = 5

async function logAuthAttempt(sb, { email, success, failureReason, ip }) {
  try {
    await sb.from('press_auth_log').insert({
      email: email?.toLowerCase()?.trim() || '',
      success,
      failure_reason: failureReason || null,
      ip_address: ip || null,
    })
  } catch (err) {
    console.error('Failed to log press auth attempt:', err)
  }
}

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
}

// ── Rate limiter for login codes (3 requests per 15 minutes per IP) ─────────
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

      const genericResponse = NextResponse.json({
        ok: true,
        message: 'If you have an account, you\'ll receive a login code shortly',
      })

      const { data: account } = await sb
        .from('press_accounts')
        .select('id, name, outlet, contact_email, status, approved')
        .eq('contact_email', normalised)
        .single()

      if (!account) {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: 'account_not_found', ip })
        return genericResponse
      }

      if (!account.approved) {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: 'not_approved', ip })
        return NextResponse.json({
          ok: true,
          message: `Your account is pending approval. Contact ${PRESS_CONTACT_EMAIL} if you've recently requested access.`,
          pending: true,
        })
      }

      if (account.status === 'cancelled' || account.status === 'suspended') {
        await logAuthAttempt(sb, { email: normalised, success: false, failureReason: `status_${account.status}`, ip })
        return genericResponse
      }

      const magicToken = crypto.randomInt(100000, 999999).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

      await sb
        .from('press_accounts')
        .update({
          magic_link_token: magicToken,
          magic_link_expires_at: expiresAt.toISOString(),
          magic_link_attempts: 0,
        })
        .eq('id', account.id)

      // Resend resolves { data, error } rather than throwing — check error
      // explicitly or a rejected send is silently swallowed.
      try {
        const { Resend } = require('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { error: sendError } = await resend.emails.send({
          from: 'Australian Atlas <verify@australianatlas.com.au>',
          to: account.contact_email,
          subject: 'Your Australian Atlas Newsroom login code',
          html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
              <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; color: #1C1A17;">Australian Atlas Newsroom</h2>
              <p style="color: #6B6760;">Hi ${account.name},</p>
              <p style="color: #6B6760;">Your login code is:</p>
              <div style="background: #F8F6F1; border-radius: 8px; padding: 1.5rem; text-align: center; margin: 1.5rem 0;">
                <span style="font-size: 2rem; font-weight: 600; letter-spacing: 0.2em; color: #1C1A17;">${magicToken}</span>
              </div>
              <p style="color: #6B6760; font-size: 0.875rem;">This code expires in 15 minutes.</p>
              <p style="color: #6B6760; font-size: 0.875rem;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        })
        if (sendError) {
          console.error('OTP email rejected by Resend (press login):', JSON.stringify(sendError))
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] Newsroom login code for ${email}: ${magicToken}`)
          }
        }
      } catch (emailErr) {
        console.error('Failed to send press login email:', emailErr)
        // Only ever log the live OTP in non-production (never to prod logs).
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] Newsroom login code for ${email}: ${magicToken}`)
        }
      }

      await logAuthAttempt(sb, { email: normalised, success: true, failureReason: null, ip })

      return genericResponse
    }

    if (action === 'verify-token') {
      if (!email || !token) {
        return NextResponse.json({ error: 'Email and token required' }, { status: 400 })
      }

      const { data: account } = await sb
        .from('press_accounts')
        .select('id, name, outlet, slug, status, approved, magic_link_token, magic_link_expires_at, magic_link_attempts')
        .eq('contact_email', email.toLowerCase().trim())
        .single()

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }

      // Constant-time compare of the 6-digit OTP.
      const expectedToken = String(account.magic_link_token ?? '')
      const providedToken = String(token ?? '')
      const tokenMatches = expectedToken.length > 0
        && expectedToken.length === providedToken.length
        && crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(providedToken))
      if (!tokenMatches) {
        if (expectedToken.length > 0) {
          const attempts = (account.magic_link_attempts || 0) + 1
          const burn = attempts >= MAX_OTP_ATTEMPTS
          await sb
            .from('press_accounts')
            .update(burn
              ? { magic_link_token: null, magic_link_expires_at: null, magic_link_attempts: 0 }
              : { magic_link_attempts: attempts })
            .eq('id', account.id)
        }
        await logAuthAttempt(sb, { email: email.toLowerCase().trim(), success: false, failureReason: 'invalid_token', ip })
        return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
      }

      if (new Date(account.magic_link_expires_at) < new Date()) {
        return NextResponse.json({ error: 'Code has expired. Request a new one.' }, { status: 401 })
      }

      await sb
        .from('press_accounts')
        .update({
          magic_link_token: null,
          magic_link_expires_at: null,
          last_login_at: new Date().toISOString(),
        })
        .eq('id', account.id)

      await sb.from('press_activity').insert({
        press_id: account.id,
        action: 'login',
      })

      const sessionValue = createPressSessionValue(account.id, account.slug)

      const response = NextResponse.json({
        ok: true,
        press: { id: account.id, name: account.name, outlet: account.outlet, slug: account.slug },
      })

      response.cookies.set(PRESS_SESSION_COOKIE, sessionValue, {
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
    console.error('Press auth error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Logout
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(PRESS_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  return response
}
