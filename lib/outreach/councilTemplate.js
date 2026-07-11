// ============================================================
// Council outreach email rendering
// ------------------------------------------------------------
// Council counterpart of lib/outreach/template.js: merges {{tokens}} for a
// council_outreach row (+ its joined region), and produces the final
// subject / HTML / text with the compliant footer (who we are, why they got
// this, one-click unsubscribe). Shares the escape/HTML machinery with the
// operator renderer so the two emails stay visually identical.
// ============================================================

import { applyMerge, escapeHtml, bodyToHtml } from '@/lib/outreach/template'

const SITE = 'https://australianatlas.com.au'
const REPLY_TO = 'matt@australianatlas.com.au'

export const COUNCIL_MERGE_TOKENS = [
  { token: '{{council_name}}', label: 'Council name' },
  { token: '{{region}}', label: 'Atlas region' },
  { token: '{{state}}', label: 'State' },
  { token: '{{listing_count}}', label: 'Places mapped in region' },
  { token: '{{personal_note}}', label: 'AI personal opener' },
  { token: '{{for_councils_url}}', label: '/for-councils URL' },
  { token: '{{enquire_url}}', label: 'Enquiry form URL' },
  { token: '{{example_report_url}}', label: 'Example report URL' },
  { token: '{{region_url}}', label: 'Public region page URL' },
]

/**
 * Build the merge context for one council.
 * @param {object} council   council_outreach row
 * @param {object|null} region  joined regions row ({ name, slug, state, listing_count }) or null
 */
export function buildCouncilMergeContext(council, region, origin = SITE, personalNote = '') {
  const base = (origin || SITE).replace(/\/$/, '')
  const regionName = region?.name || council.region_name || 'your region'
  const count = region?.listing_count
  return {
    council_name: council.council_name || 'your council',
    region: regionName,
    state: council.state || region?.state || '',
    // "over 210" reads better than a precise number that will be stale next
    // week; small counts stay exact. Falls back to a safe phrase when unlinked.
    listing_count: count == null
      ? 'dozens of'
      : (count >= 50 ? `over ${Math.floor(count / 10) * 10}` : String(count)),
    personal_note: (personalNote || council.personal_note || '').trim(),
    for_councils_url: `${base}/for-councils`,
    enquire_url: `${base}/council/enquire`,
    example_report_url: `${base}/council/example`,
    region_url: region?.slug ? `${base}/regions/${region.slug}` : `${base}/regions`,
  }
}

/**
 * Render the final email for one council.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderCouncilEmail({ subject, body, council, region, origin = SITE, unsubscribeUrl, personalNote = '' }) {
  const ctx = buildCouncilMergeContext(council, region, origin, personalNote)
  const mergedSubject = applyMerge(subject, ctx).trim()
  // Collapse the blank gap an empty {{personal_note}} leaves behind.
  const mergedBody = applyMerge(body, ctx).replace(/\n{3,}/g, '\n\n').trim()

  const whyLine = `You received this because ${ctx.council_name} is the local government body for the ${ctx.region} area, which we cover on our public guide.`

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
      You received this because <strong>${escapeHtml(ctx.council_name)}</strong> is the local government body for the ${escapeHtml(ctx.region)} area, which we cover on our public guide.
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
