// ============================================================
// Press outreach email rendering
// ------------------------------------------------------------
// Press counterpart of lib/outreach/councilTemplate.js: merges {{tokens}} for a
// press_outreach row (+ its joined region), and produces the final subject /
// HTML / text with the compliant footer (who we are, why they got this,
// one-click unsubscribe). Shares the escape/HTML machinery with the operator
// renderer so every Atlas outreach email stays visually identical.
// ============================================================

import { applyMerge, escapeHtml, bodyToHtml } from '@/lib/outreach/template'

const SITE = 'https://australianatlas.com.au'
// Press queries route to editor@ (Matt's call, see project_press_newsroom); the
// outbound pitch replies there too so a journalist's response lands with the
// desk that handles press.
const REPLY_TO = 'editor@australianatlas.com.au'

export const PRESS_MERGE_TOKENS = [
  { token: '{{greeting_name}}', label: 'First name / "there"' },
  { token: '{{outlet_name}}', label: 'Outlet / masthead' },
  { token: '{{journalist_name}}', label: 'Journalist name' },
  { token: '{{beat}}', label: 'Beat phrase (e.g. travel and food)' },
  { token: '{{region}}', label: 'Region / "Australia"' },
  { token: '{{state}}', label: 'State' },
  { token: '{{personal_note}}', label: 'AI personal opener' },
  { token: '{{for_press_url}}', label: '/for-press URL' },
  { token: '{{example_url}}', label: 'Live fact-sheet URL' },
  { token: '{{signup_url}}', label: 'Self-serve account signup URL' },
]

// Turn a beat array into a readable phrase: ['travel','food'] → "travel and
// food"; ['travel','food','regional'] → "travel, food and regional stories".
export function beatPhrase(beat) {
  const list = (Array.isArray(beat) ? beat : (beat ? String(beat).split(',') : []))
    .map((b) => String(b).trim()).filter(Boolean)
  if (list.length === 0) return 'independent Australia'
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
 * Build the merge context for one press contact.
 * @param {object} press   press_outreach row
 * @param {object|null} region  joined regions row ({ name, slug, state }) or null
 */
export function buildPressMergeContext(press, region, origin = SITE, personalNote = '') {
  const base = (origin || SITE).replace(/\/$/, '')
  const regionName = region?.name || press.region_name || (press.state ? press.state : 'Australia')
  return {
    greeting_name: firstName(press.journalist_name) || 'there',
    outlet_name: press.outlet_name || 'your newsroom',
    journalist_name: press.journalist_name || '',
    beat: beatPhrase(press.beat),
    region: regionName,
    state: press.state || region?.state || '',
    personal_note: (personalNote || press.personal_note || '').trim(),
    for_press_url: `${base}/for-press`,
    example_url: `${base}/newsroom/example`,
    signup_url: `${base}/newsroom/enquire`,
  }
}

/**
 * Render the final email for one press contact.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderPressEmail({ subject, body, press, region, origin = SITE, unsubscribeUrl, personalNote = '' }) {
  const ctx = buildPressMergeContext(press, region, origin, personalNote)
  const mergedSubject = applyMerge(subject, ctx).trim()
  // Collapse the blank gap an empty {{personal_note}} leaves behind.
  const mergedBody = applyMerge(body, ctx).replace(/\n{3,}/g, '\n\n').trim()

  const whyLine = `You received this because you cover ${ctx.beat} — we reach out to independent Australian journalists and newsdesks with the Atlas as a story source, and you can opt out in one click.`

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
      You received this because you cover ${escapeHtml(ctx.beat)} — we reach out to independent Australian journalists and newsdesks with the Atlas as a story source, and you can opt out in one click.
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
