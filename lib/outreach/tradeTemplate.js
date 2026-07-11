// ============================================================
// Trade outreach email rendering
// ------------------------------------------------------------
// Travel-trade counterpart of lib/outreach/template.js (operators) and
// lib/outreach/councilTemplate.js: merges {{tokens}} for a trade_outreach row
// (+ its joined focus region), and produces the final subject / HTML / text
// with the compliant footer (who we are, why they got this, one-click
// unsubscribe). Shares the escape/HTML machinery with the operator renderer
// so the three outreach emails stay visually identical.
// ============================================================

import { applyMerge, escapeHtml, bodyToHtml } from '@/lib/outreach/template'

const SITE = 'https://australianatlas.com.au'
const REPLY_TO = 'matt@australianatlas.com.au'

export const TRADE_MERGE_TOKENS = [
  { token: '{{company_name}}', label: 'Company name' },
  { token: '{{region}}', label: 'Focus region (or Australia)' },
  { token: '{{state}}', label: 'State' },
  { token: '{{listing_count}}', label: 'Places mapped in focus region' },
  { token: '{{network_count}}', label: 'Places mapped network-wide' },
  { token: '{{personal_note}}', label: 'AI personal opener' },
  { token: '{{for_trade_url}}', label: '/for-trade URL' },
  { token: '{{apply_url}}', label: 'Trade signup URL' },
  { token: '{{region_url}}', label: 'Public region page URL' },
]

// "over 6,900" for the network, "over 210" for a big region, exact for small
// counts — a rounded floor reads better than a precise number that will be
// stale next week. Falls back to a safe phrase when unknown.
export function tradeCountPhrase(count, fallback = 'thousands of') {
  if (count == null) return fallback
  if (count >= 1000) return `over ${(Math.floor(count / 100) * 100).toLocaleString()}`
  if (count >= 50) return `over ${Math.floor(count / 10) * 10}`
  return String(count)
}

/**
 * Build the merge context for one trade company.
 * @param {object} company      trade_outreach row
 * @param {object|null} region  joined regions row ({ name, slug, state, listing_count }) or null
 * @param {number|null} networkCount  network-wide active listing count
 */
export function buildTradeMergeContext(company, region, origin = SITE, personalNote = '', networkCount = null) {
  const base = (origin || SITE).replace(/\/$/, '')
  const regionName = region?.name || company.region_name || 'Australia'
  const regionCount = region?.listing_count
  return {
    company_name: company.company_name || 'your team',
    region: regionName,
    state: company.state || region?.state || '',
    // Region-scoped when the row is linked to a region, network-wide otherwise.
    listing_count: regionCount != null ? tradeCountPhrase(regionCount) : tradeCountPhrase(networkCount),
    network_count: tradeCountPhrase(networkCount),
    personal_note: (personalNote || company.personal_note || '').trim(),
    for_trade_url: `${base}/for-trade`,
    apply_url: `${base}/for-trade/apply`,
    region_url: region?.slug ? `${base}/regions/${region.slug}` : `${base}/regions`,
  }
}

/**
 * Render the final email for one trade company.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderTradeEmail({ subject, body, company, region, origin = SITE, unsubscribeUrl, personalNote = '', networkCount = null }) {
  const ctx = buildTradeMergeContext(company, region, origin, personalNote, networkCount)
  const mergedSubject = applyMerge(subject, ctx).trim()
  // Collapse the blank gap an empty {{personal_note}} leaves behind.
  const mergedBody = applyMerge(body, ctx).replace(/\n{3,}/g, '\n\n').trim()

  const whyLine = `You received this because ${ctx.company_name} packages or sells Australian travel, and Australian Atlas maintains a verified public guide to the independent operators the trade builds with.`

  // ---- Plain text ----
  const text = [
    mergedBody,
    '',
    '—',
    'Australian Atlas — a curated guide to independent Australian places.',
    whyLine,
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
      You received this because <strong>${escapeHtml(ctx.company_name)}</strong> packages or sells Australian travel, and Australian Atlas maintains a verified public guide to the independent operators the trade builds with.
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
