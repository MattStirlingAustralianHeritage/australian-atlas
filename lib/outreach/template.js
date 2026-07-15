// ============================================================
// Outreach email template rendering
// ------------------------------------------------------------
// Admins compose a plain-text subject + body with {{merge tokens}}. This module
// personalises them per listing and produces the final subject / HTML / text,
// always appending the compliant footer (who we are, why they got this, and a
// working one-click unsubscribe). Merge values are HTML-escaped so a venue name
// with an ampersand can't break the markup.
// ============================================================

import { getListingRegion } from '@/lib/regions'
import { GENERIC_TEMPLATE } from '@/lib/outreach/templates'

const SITE = 'https://australianatlas.com.au'
const REPLY_TO = 'matt@australianatlas.com.au'

// Trim an editorial description into a clean quotable snippet (whole sentences
// where possible, hard-capped so it can't dominate the email).
function cleanSnippet(text, max = 260) {
  if (!text) return ''
  let s = String(text).replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  s = s.slice(0, max)
  const lastStop = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '))
  if (lastStop > max * 0.5) return s.slice(0, lastStop + 1).trim()
  const lastSpace = s.lastIndexOf(' ')
  return (lastSpace > 0 ? s.slice(0, lastSpace) : s).trim() + '…'
}

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture Atlas', craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds', rest: 'Boutique Stays', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas', way: 'Way Atlas',
}

export const MERGE_TOKENS = [
  { token: '{{name}}', label: 'Venue name' },
  { token: '{{region}}', label: 'Region' },
  { token: '{{suburb}}', label: 'Suburb / town' },
  { token: '{{state}}', label: 'State' },
  { token: '{{vertical}}', label: 'Atlas / vertical' },
  { token: '{{personal_note}}', label: 'AI personal opener' },
  { token: '{{description}}', label: 'Our editorial line' },
  { token: '{{place_url}}', label: 'Live listing URL' },
  { token: '{{claim_url}}', label: 'Claim URL' },
]

export function buildMergeContext(listing, origin = SITE, personalNote = '', campaignId = '') {
  const base = (origin || SITE).replace(/\/$/, '')
  const region = getListingRegion(listing)?.name || listing.region || 'Australia'
  // Campaign attribution without click-tracking redirects (which would rewrite
  // every link through Resend and can't be enabled domain-wide anyway — auth
  // magic links share the sending domain). Analytics reads utm_campaign.
  const utm = campaignId
    ? `?utm_source=outreach&utm_medium=email&utm_campaign=${encodeURIComponent(campaignId)}`
    : ''
  return {
    name: listing.name || 'your venue',
    region,
    suburb: listing.suburb || '',
    state: listing.state || '',
    vertical: VERTICAL_NAMES[listing.vertical] || listing.vertical || 'Australian Atlas',
    personal_note: (personalNote || listing.personal_note || '').trim(),
    description: cleanSnippet(listing.description),
    place_url: (listing.slug ? `${base}/place/${listing.slug}` : base) + utm,
    claim_url: (listing.slug ? `${base}/claim/${listing.slug}` : `${base}/claim`) + utm,
  }
}

export function applyMerge(str, ctx) {
  if (!str) return ''
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ''))
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// escaped text -> linkified (URLs become anchors), preserving paragraphs.
function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (url) => {
    return `<a href="${url}" style="color:#8a6520;text-decoration:underline;">${url}</a>`
  })
}

export function bodyToHtml(text) {
  const paras = text.split(/\n{2,}/).map((block) => {
    const inner = linkify(escapeHtml(block)).replace(/\n/g, '<br />')
    return `<p style="margin:0 0 16px;line-height:1.6;">${inner}</p>`
  })
  return paras.join('\n')
}

/**
 * Render the final email for one listing.
 * @param {object} p
 * @param {string} p.subject      Raw subject (may contain merge tokens)
 * @param {string} p.body         Raw plain-text body (may contain merge tokens)
 * @param {object} p.listing      Listing row (name, slug, vertical, region, state…)
 * @param {string} p.origin       Public site origin
 * @param {string} p.unsubscribeUrl  Fully-qualified unsubscribe link for this recipient
 * @param {string} p.personalNote    Optional AI/edited personal opener ({{personal_note}})
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderEmail({ subject, body, listing, origin = SITE, unsubscribeUrl, personalNote = '', campaignId = '' }) {
  const ctx = buildMergeContext(listing, origin, personalNote, campaignId)
  const mergedSubject = applyMerge(subject, ctx).trim()
  // Collapse the blank gap an empty {{personal_note}} / {{description}} leaves behind.
  const mergedBody = applyMerge(body, ctx).replace(/\n{3,}/g, '\n\n').trim()

  // ---- Plain text ----
  const text = [
    mergedBody,
    '',
    '—',
    'Australian Atlas — a curated guide to independent Australian places.',
    `You received this because ${ctx.name} is listed on our public guide.`,
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : '',
    SITE,
  ].filter(Boolean).join('\n')

  // ---- HTML ----
  const footer = `
    <hr style="border:none;border-top:1px solid #e8e2d8;margin:28px 0 16px;" />
    <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#8a8378;">
      <strong style="color:#6b6459;">Australian Atlas</strong> — a curated guide to independent Australian places.
    </p>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#8a8378;">
      You received this because <strong>${escapeHtml(ctx.name)}</strong> is listed on our public guide to independent ${escapeHtml(ctx.region)}.
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8378;">
      ${unsubscribeUrl
        ? `<a href="${unsubscribeUrl}" style="color:#8a8378;text-decoration:underline;">Unsubscribe</a> &middot; `
        : ''}<a href="${SITE}" style="color:#8a8378;text-decoration:underline;">australianatlas.com.au</a>
    </p>`

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf8f5;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2d2a26;font-size:15px;">
    ${bodyToHtml(mergedBody)}
    ${footer}
  </div>
</body></html>`

  return { subject: mergedSubject, html, text }
}

export { REPLY_TO }

// Re-exported so existing importers keep working; the canonical templates now
// live in lib/outreach/templates.js.
export const DEFAULT_TEMPLATE = GENERIC_TEMPLATE
