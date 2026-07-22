// ============================================================
// Industry outreach email rendering
// ------------------------------------------------------------
// Industry counterpart of lib/outreach/pressTemplate.js: merges {{tokens}} for
// an industry_outreach row (+ its joined region), and produces the final
// subject / HTML / text with the compliant footer (who we are, why they got
// this, one-click unsubscribe). Shares the escape/HTML machinery with the
// operator renderer so every Atlas outreach email stays visually identical.
// ============================================================

import { applyMerge, escapeHtml, bodyToHtml } from '@/lib/outreach/template'

const SITE = 'https://australianatlas.com.au'
// Partnership conversations are Matt's directly — replies land in his inbox,
// not a desk alias.
const REPLY_TO = 'matt@australianatlas.com.au'

export const INDUSTRY_MERGE_TOKENS = [
  { token: '{{greeting_name}}', label: 'First name / "there"' },
  { token: '{{org_name}}', label: 'Organisation name' },
  { token: '{{contact_name}}', label: 'Contact name' },
  { token: '{{focus}}', label: 'Focus phrase (e.g. wine and tourism)' },
  { token: '{{region}}', label: 'Region / "Australia"' },
  { token: '{{state}}', label: 'State' },
  { token: '{{personal_note}}', label: 'AI personal opener' },
  { token: '{{site_url}}', label: 'Homepage URL' },
  { token: '{{about_url}}', label: '/about URL' },
  { token: '{{venues_url}}', label: '/for-venues URL (member claims)' },
  { token: '{{regions_url}}', label: '/regions URL' },
]

// Turn a focus array into a readable phrase: ['wine','tourism'] → "wine and
// tourism"; ['wine','tourism','craft'] → "wine, tourism and craft".
export function focusPhrase(focus) {
  const list = (Array.isArray(focus) ? focus : (focus ? String(focus).split(',') : []))
    .map((f) => String(f).trim()).filter(Boolean)
  if (list.length === 0) return 'independent Australian businesses'
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

function firstName(name) {
  const n = (name || '').trim()
  if (!n) return ''
  return n.split(/\s+/)[0]
}

/**
 * Build the merge context for one industry contact.
 * @param {object} org     industry_outreach row
 * @param {object|null} region  joined regions row ({ name, slug, state }) or null
 */
export function buildIndustryMergeContext(org, region, origin = SITE, personalNote = '') {
  const base = (origin || SITE).replace(/\/$/, '')
  const regionName = region?.name || org.region_name || (org.state ? org.state : 'Australia')
  return {
    greeting_name: firstName(org.contact_name) || 'there',
    org_name: org.org_name || 'your organisation',
    contact_name: org.contact_name || '',
    focus: focusPhrase(org.focus),
    region: regionName,
    state: org.state || region?.state || '',
    personal_note: (personalNote || org.personal_note || '').trim(),
    site_url: base,
    about_url: `${base}/about`,
    venues_url: `${base}/for-venues`,
    regions_url: `${base}/regions`,
  }
}

/**
 * Render the final email for one industry contact.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderIndustryEmail({ subject, body, org, region, origin = SITE, unsubscribeUrl, personalNote = '' }) {
  const ctx = buildIndustryMergeContext(org, region, origin, personalNote)
  const mergedSubject = applyMerge(subject, ctx).trim()
  // Collapse the blank gap an empty {{personal_note}} leaves behind.
  const mergedBody = applyMerge(body, ctx).replace(/\n{3,}/g, '\n\n').trim()

  const whyLine = `You received this because your organisation works with ${ctx.focus} — we reach out to Australian industry bodies and organisations the Atlas may be useful to, and you can opt out in one click.`

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
      You received this because your organisation works with ${escapeHtml(ctx.focus)} — we reach out to Australian industry bodies and organisations the Atlas may be useful to, and you can opt out in one click.
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
