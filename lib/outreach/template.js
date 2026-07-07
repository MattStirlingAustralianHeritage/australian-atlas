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

const SITE = 'https://australianatlas.com.au'
const REPLY_TO = 'matt@australianatlas.com.au'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture Atlas', craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds', rest: 'Boutique Stays', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas', way: 'Way Atlas',
}

export const MERGE_TOKENS = [
  { token: '{{name}}', label: 'Venue name' },
  { token: '{{region}}', label: 'Region' },
  { token: '{{state}}', label: 'State' },
  { token: '{{vertical}}', label: 'Atlas / vertical' },
  { token: '{{place_url}}', label: 'Live listing URL' },
  { token: '{{claim_url}}', label: 'Claim URL' },
]

export function buildMergeContext(listing, origin = SITE) {
  const base = (origin || SITE).replace(/\/$/, '')
  const region = getListingRegion(listing)?.name || listing.region || 'Australia'
  return {
    name: listing.name || 'your venue',
    region,
    state: listing.state || '',
    vertical: VERTICAL_NAMES[listing.vertical] || listing.vertical || 'Australian Atlas',
    place_url: listing.slug ? `${base}/place/${listing.slug}` : base,
    claim_url: listing.slug ? `${base}/claim/${listing.slug}` : `${base}/claim`,
  }
}

export function applyMerge(str, ctx) {
  if (!str) return ''
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ''))
}

function escapeHtml(s) {
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

function bodyToHtml(text) {
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
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderEmail({ subject, body, listing, origin = SITE, unsubscribeUrl }) {
  const ctx = buildMergeContext(listing, origin)
  const mergedSubject = applyMerge(subject, ctx).trim()
  const mergedBody = applyMerge(body, ctx).trim()

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

// A sensible default template so the compose box is never empty.
export const DEFAULT_TEMPLATE = {
  subject: '{{name}} is on Australian Atlas',
  body: `Hi,

We've been building Australian Atlas — a curated guide to independent Australian places. We've listed {{name}} as part of our guide to independent {{region}}, and it's already live and being discovered:

{{place_url}}

We'd love for you to claim the listing so you can tell your own story, add photos, and keep the details right. It's quick and free to claim:

{{claim_url}}

If it's not the right fit, no worries at all — you can ignore this note.

Warm regards,
Matt
Australian Atlas`,
}
