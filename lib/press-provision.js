// lib/press-provision.js
// Shared press provisioning — the single path from "a journalist filled the
// signup form" to "a real, sign-in-able Newsroom account". The press analogue
// of lib/council-provision.js.
//
// Used by:
//   • /api/press/enquire   (self-serve: a journalist creates their own account)
//   • (available to the press admin surface for a future one-click "provision")
//
// It is deliberately idempotent: re-running against the same email reuses the
// existing account (re-approving / reactivating it) rather than erroring, so a
// second signup — or an admin re-provisioning a lead — is safe.
//
// Security model: unlike council (which auto-approves only .gov.au mailboxes),
// press has no clean domain gate, so any working-press signup is approved on
// creation. The account is inert until the person proves control of the inbox:
// sign-in is a one-time code sent to contact_email (see /api/press/auth). The
// press desk is still notified of every signup and can suspend an account in
// one click from /admin/press, so oversight is post-hoc rather than a blocker.

import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const SITE_URL = 'https://www.australianatlas.com.au'
const OUTLET_TYPES = ['national', 'metro', 'regional', 'local', 'newsletter', 'magazine', 'broadcast', 'podcast', 'online', 'freelance', 'other']

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'outlet'
}

async function uniqueSlug(sb, base) {
  const root = base || 'outlet'
  const { data } = await sb.from('press_accounts').select('slug').like('slug', `${root}%`)
  const taken = new Set((data || []).map((r) => r.slug))
  if (!taken.has(root)) return root
  for (let n = 2; n < 1000; n++) {
    if (!taken.has(`${root}-${n}`)) return `${root}-${n}`
  }
  return `${root}-${crypto.randomBytes(3).toString('hex')}`
}

/**
 * Provision (or re-provision) an approved Newsroom account.
 *
 * @param {object} opts
 * @param {string}  opts.contactEmail  required — the sign-in address
 * @param {string} [opts.name]         the journalist's name
 * @param {string} [opts.outlet]       masthead / outlet name
 * @param {string} [opts.outletType]   one of OUTLET_TYPES (defaults to 'other')
 * @param {string} [opts.roleTitle]    e.g. "Travel editor"
 * @param {string} [opts.website]      outlet or portfolio URL
 * @param {boolean}[opts.sendEmail]    defaults true — send the welcome + sign-in email
 * @returns {Promise<{pressId, slug, name, outlet, reused, emailSent}>}
 */
export async function provisionPress({
  contactEmail,
  name,
  outlet,
  outletType,
  roleTitle,
  website,
  sendEmail = true,
}) {
  const sb = getSupabaseAdmin()
  const email = String(contactEmail || '').trim().toLowerCase()
  if (!email) throw new Error('contactEmail is required')

  const outletName = String(outlet || name || 'your newsroom').trim()
  const personName = String(name || '').trim()

  // ── 1. Find-or-create the account (idempotent on email) ──────────────────
  const { data: existing } = await sb
    .from('press_accounts')
    .select('id, slug, name, outlet, status, approved')
    .eq('contact_email', email)
    .maybeSingle()

  let account = existing
  let reused = false

  if (account) {
    reused = true
    // Re-approve / reactivate a previously pending, suspended or cancelled account.
    const nextStatus = ['cancelled', 'suspended'].includes(account.status) ? 'active' : (account.status || 'active')
    await sb
      .from('press_accounts')
      .update({
        approved: true,
        status: nextStatus,
        name: personName || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
  } else {
    const slug = await uniqueSlug(sb, slugify(outletName))
    const { data, error } = await sb
      .from('press_accounts')
      .insert({
        name: personName ? personName.slice(0, 200) : outletName.slice(0, 200),
        outlet: outletName.slice(0, 200),
        slug,
        contact_email: email,
        outlet_type: OUTLET_TYPES.includes(outletType) ? outletType : 'other',
        role_title: roleTitle ? String(roleTitle).trim().slice(0, 200) : null,
        website: website ? String(website).trim().slice(0, 300) : null,
        status: 'active', // free founding beta → active immediately (no card)
        approved: true,
      })
      .select('id, slug, name, outlet')
      .single()
    if (error) throw error
    account = data
  }

  // ── 2. Best-effort activity log (never .catch() a postgrest builder) ─────
  try {
    await sb.from('press_activity').insert({ press_id: account.id, action: 'provisioned' })
  } catch (err) {
    console.error('[press-provision] activity log error:', err?.message || err)
  }

  // ── 3. Welcome + sign-in email ───────────────────────────────────────────
  let emailSent = false
  if (sendEmail) {
    emailSent = await sendPressWelcomeEmail({
      email,
      name: personName || account.name,
      outlet: account.outlet || outletName,
    })
  }

  return { pressId: account.id, slug: account.slug, name: account.name, outlet: account.outlet, reused, emailSent }
}

/**
 * Branded welcome email. The primary CTA is the Newsroom sign-in, where a
 * one-time code is sent to this same address — that code is the identity check,
 * so the email deliberately does not carry a login secret. Returns true only if
 * Resend accepted the send (its SDK resolves {error} rather than throwing).
 */
export async function sendPressWelcomeEmail({ email, name, outlet }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[press-provision] RESEND_API_KEY not set — cannot send welcome email')
    return false
  }
  const loginUrl = `${SITE_URL}/newsroom/login`
  const greeting = name ? `Welcome to the press desk, ${escapeHtml(name)}` : 'Welcome to the press desk'
  const outletLine = outlet && outlet !== 'your newsroom'
    ? `Your Newsroom account for <strong>${escapeHtml(outlet)}</strong> is live.`
    : `Your Newsroom account is live.`

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Australian Atlas <noreply@australianatlas.com.au>',
      replyTo: 'editor@australianatlas.com.au',
      to: email,
      subject: `Your Australian Atlas Newsroom account is live${outlet && outlet !== 'your newsroom' ? ` — ${outlet}` : ''}`,
      html: `
        <div style="font-family:'DM Sans',-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 16px;color:#1C1A17;">
          <p style="font-family:'Playfair Display',Georgia,serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#6B6760;margin:0 0 20px;">Australian Atlas · Newsroom</p>
          <h2 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:21px;margin:0 0 12px;">${greeting}</h2>
          <p style="font-size:14px;color:#3D3A34;line-height:1.65;margin:0 0 4px;">${outletLine}</p>
          <p style="font-size:14px;color:#3D3A34;line-height:1.65;margin:8px 0 0;">
            Sign in with this email address — no password, we send you a one-time code:
          </p>
          <p style="margin:18px 0;">
            <a href="${loginUrl}" style="display:inline-block;background:#1C1A17;color:#faf8f5;padding:11px 26px;border-radius:99px;text-decoration:none;font-weight:600;font-size:14px;">Sign in to the Newsroom</a>
          </p>
          <p style="font-size:14px;color:#3D3A34;line-height:1.65;">
            First thing to do: <strong>follow the regions you cover</strong>. From then on you'll hear the moment
            a listed independent puts on an event there — plus story leads, new places, citable regional data,
            CSV downloads and a calendar feed. Everything is free for working press, and our data is free to
            cite with attribution.
          </p>
          <p style="font-size:13px;color:#6B6760;line-height:1.6;">
            Need anything for a story — an introduction, a data pull, a comment? Reply to this email;
            we answer the same business day.
          </p>
        </div>
      `,
    })
    if (error) {
      console.error('[press-provision] welcome email rejected by Resend:', JSON.stringify(error))
      return false
    }
    return true
  } catch (err) {
    console.error('[press-provision] welcome email exception:', err?.message || err)
    return false
  }
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
