// lib/council-provision.js
// Shared council provisioning — the single path from "enquiry" to "a real,
// logged-in council account scoped to its region".
//
// Used by:
//   • /api/council/enquire       (auto-provision when the email is a .gov.au mailbox)
//   • /api/admin/council-applications (admin one-click "Approve & provision")
//
// It is deliberately idempotent: re-running against the same email reuses the
// existing account (re-approving/reactivating it) rather than erroring, so an
// admin can safely click "provision" on a lead that already has an account.

import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const SITE_URL = 'https://www.australianatlas.com.au'
const LOGIN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days for the first sign-in

/**
 * An email is a genuine Australian government mailbox iff its domain ends in
 * `.gov.au` (every council/state/federal domain does — e.g. yarraranges.vic.gov.au,
 * cityofsydney.nsw.gov.au). We only AUTO-approve these: the login link is sent to
 * that address, so an account is inert without control of a real gov inbox.
 * Everything else (com.au tourism bodies, gmail, etc.) is held for admin review.
 */
export function isGovEmail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase()
  return !!domain && domain.endsWith('.gov.au')
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(sb, base) {
  const root = base || 'council'
  let slug = root
  for (let i = 0; i < 20; i++) {
    const { data } = await sb
      .from('council_accounts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    slug = `${root}-${i + 2}`
  }
  // Extremely unlikely fall-through — append a short random suffix.
  return `${root}-${crypto.randomBytes(3).toString('hex')}`
}

/**
 * Provision (or re-provision) a council account and link it to a region.
 *
 * @param {object} opts
 * @param {string} opts.contactEmail   required — the login address
 * @param {string} [opts.name]         council/organisation name
 * @param {string} [opts.contactName]  the person's name
 * @param {string} [opts.regionId]     regions.id to grant the council
 * @param {string} [opts.regionName]   denormalised region label (for the email)
 * @param {string} [opts.enquiryId]    council_enquiries.id to mark provisioned
 * @param {string} [opts.tier]         defaults to 'partner' (free founding beta)
 * @param {boolean}[opts.sendEmail]    defaults true — send welcome + login link
 * @returns {Promise<{councilId, slug, loginToken, reused, emailSent}>}
 */
export async function provisionCouncil({
  contactEmail,
  name,
  contactName,
  regionId,
  regionName,
  enquiryId,
  tier = 'partner',
  sendEmail = true,
}) {
  const sb = getSupabaseAdmin()
  const email = String(contactEmail || '').trim().toLowerCase()
  if (!email) throw new Error('contactEmail is required')

  // ── 1. Find-or-create the account (idempotent on email) ──────────────────
  const { data: existing } = await sb
    .from('council_accounts')
    .select('id, slug, name, status, approved')
    .eq('contact_email', email)
    .maybeSingle()

  let council = existing
  let reused = false

  if (council) {
    reused = true
    // Re-approve / reactivate a previously pending or suspended account.
    const nextStatus = ['cancelled', 'suspended'].includes(council.status) ? 'active' : (council.status || 'active')
    await sb
      .from('council_accounts')
      .update({
        approved: true,
        status: nextStatus,
        contact_name: contactName?.trim() || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', council.id)
  } else {
    const slug = await uniqueSlug(sb, slugify(name || regionName || email.split('@')[0]))
    const { data, error } = await sb
      .from('council_accounts')
      .insert({
        name: name?.trim() || regionName || 'Council',
        slug,
        contact_name: contactName?.trim() || null,
        contact_email: email,
        tier: ['explorer', 'partner', 'enterprise'].includes(tier) ? tier : 'partner',
        status: 'active', // free founding beta → active immediately (no card)
        approved: true,
      })
      .select('id, slug, name')
      .single()
    if (error) throw error
    council = data
  }

  // ── 2. Link the region (dedupe on the unique (council_id, region_id)) ─────
  if (regionId) {
    try {
      const { error } = await sb
        .from('council_regions')
        .insert({ council_id: council.id, region_id: regionId, role: 'manager' })
      if (error && error.code !== '23505') {
        console.error('[council-provision] link region error:', error.message)
      }
    } catch (err) {
      console.error('[council-provision] link region exception:', err?.message || err)
    }
  }

  // ── 3. Mint a single-use, URL-embedded login token ───────────────────────
  const loginToken = crypto.randomBytes(32).toString('hex')
  await sb
    .from('council_accounts')
    .update({
      login_link_token: loginToken,
      login_link_expires_at: new Date(Date.now() + LOGIN_LINK_TTL_MS).toISOString(),
    })
    .eq('id', council.id)

  // ── 4. Best-effort activity log (never .catch() a postgrest builder) ──────
  try {
    await sb.from('council_activity').insert({ council_id: council.id, action: 'provisioned' })
  } catch (err) {
    console.error('[council-provision] activity log error:', err?.message || err)
  }

  // ── 5. Mark the enquiry converted ────────────────────────────────────────
  if (enquiryId) {
    try {
      const nowIso = new Date().toISOString()
      await sb
        .from('council_enquiries')
        .update({
          status: 'provisioned',
          council_account_id: council.id,
          provisioned_at: nowIso,
          reviewed_at: nowIso,
        })
        .eq('id', enquiryId)
    } catch (err) {
      console.error('[council-provision] mark enquiry error:', err?.message || err)
    }
  }

  // ── 6. Welcome + one-click login email ───────────────────────────────────
  let emailSent = false
  if (sendEmail) {
    emailSent = await sendWelcomeEmail({
      email,
      accountName: council.name,
      contactName,
      regionName,
      loginToken,
    })
  }

  return { councilId: council.id, slug: council.slug, loginToken, reused, emailSent }
}

/**
 * Branded welcome email whose primary CTA is a one-click login link. Returns
 * true only if Resend accepted the send (its SDK resolves {error} rather than
 * throwing, so the error field must be checked explicitly).
 */
export async function sendWelcomeEmail({ email, accountName, contactName, regionName, loginToken }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[council-provision] RESEND_API_KEY not set — cannot send welcome email')
    return false
  }
  const loginUrl = `${SITE_URL}/council/auth/${loginToken}`
  const greeting = contactName?.trim() ? `Hi ${escapeHtml(contactName.trim())},` : 'Hi there,'
  const regionLine = regionName
    ? `Your account is set up for <strong>${escapeHtml(regionName)}</strong>. Everything Atlas holds for the region — every listed operator, live demand signals, and your analytics — is waiting inside.`
    : `Your council account is ready. Sign in to see your region's operators, demand signals, and analytics.`

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Australian Atlas <noreply@australianatlas.com.au>',
      to: email,
      subject: `You're in — ${accountName || 'your council'} on Australian Atlas`,
      html: `
        <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:2rem;color:#2D2A26;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:1.6rem;margin:0 0 0.25rem;">Australian Atlas</h1>
          <p style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#9a938a;margin:0 0 1.5rem;">Council &amp; Tourism Portal</p>
          <p style="color:#4a463f;line-height:1.55;">${greeting}</p>
          <p style="color:#4a463f;line-height:1.55;">${regionLine}</p>
          <div style="text-align:center;margin:2rem 0;">
            <a href="${loginUrl}" style="display:inline-block;padding:0.9rem 2rem;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:0.95rem;">Open your dashboard</a>
          </div>
          <p style="color:#6B6760;font-size:0.85rem;line-height:1.5;">This one-click sign-in link is unique to you and works once, within 7 days. After that, sign in any time with a code at <a href="${SITE_URL}/council/login" style="color:#5F8A7E;">${SITE_URL.replace('https://', '')}/council/login</a> using this email address.</p>
          <p style="color:#9a938a;font-size:0.8rem;line-height:1.5;margin-top:1.75rem;">Free while we're in founding beta — no card, no commitment. Questions? Just reply to this email or reach us at councils@australianatlas.com.au.</p>
        </div>
      `,
    })
    if (error) {
      console.error('[council-provision] welcome email rejected by Resend:', JSON.stringify(error))
      return false
    }
    return true
  } catch (err) {
    console.error('[council-provision] welcome email exception:', err?.message || err)
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
