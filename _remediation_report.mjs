/**
 * Remediation report generator — GENERATES ONLY. Sends nothing, writes nothing
 * to the database, mints no links.
 *
 * Produces:
 *   _remediation/remediation-table.md   the cohort, per claim-remediation-spec.md
 *   _remediation/email-previews.html    rendered previews of the outreach copy
 *
 * Deliberately does NOT mint real magic links for the previews. A live sign-in
 * link is a bearer credential; putting 30 of them in a review document that is
 * going to be read, forwarded and left on disk would be its own incident. The
 * previews carry a placeholder, and links get minted at send time.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('/Users/matt/Desktop/Australian Atlas Websites/australian-atlas/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const STRIPE = env.STRIPE_SECRET_KEY

fs.mkdirSync('_remediation', { recursive: true })

// ── Gather ────────────────────────────────────────────────
const { data: claims } = await sb.from('listing_claims')
  .select('id, listing_id, claimed_by, claimant_email, tier, status, claimed_at, activation_nudge_sent_at, stripe_subscription_id, source_review_id, listings(name, vertical, status, slug)')
  .in('status', ['active', 'past_due']).limit(500)

const { data: ulist } = await sb.auth.admin.listUsers({ perPage: 2000 })
const byId = new Map((ulist?.users || []).map(u => [u.id, u]))

const reviewIds = claims.map(c => c.source_review_id).filter(Boolean)
const { data: reviews } = await sb.from('claims_review')
  .select('id, claimant_name, created_at').in('id', reviewIds)
const rById = new Map((reviews || []).map(r => [r.id, r]))

async function stripeStatusFor(email) {
  if (!STRIPE) return 'unknown'
  const q = encodeURIComponent(`email:'${email}'`)
  const res = await fetch(`https://api.stripe.com/v1/customers/search?query=${q}&limit=5`, {
    headers: { Authorization: `Bearer ${STRIPE}` },
  })
  if (!res.ok) return 'unknown'
  const found = await res.json()
  for (const c of found.data || []) {
    const sres = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${c.id}&status=all&limit=10`, {
      headers: { Authorization: `Bearer ${STRIPE}` },
    })
    if (!sres.ok) continue
    const subs = await sres.json()
    const live = (subs.data || []).filter(s => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status))
    if (live.length) return live[0].status
  }
  return 'none'
}

const rows = []
for (const c of claims) {
  const u = byId.get(c.claimed_by)
  if (u?.email_confirmed_at) continue          // verified — not in the cohort
  const r = c.source_review_id ? rById.get(c.source_review_id) : null
  rows.push({
    listing: c.listings?.name || '(unknown)',
    slug: c.listings?.slug,
    vertical: c.listings?.vertical || '—',
    email: c.claimant_email,
    name: r?.claimant_name || null,
    claim_created: (r?.created_at || c.claimed_at || '').slice(0, 10),
    invite_sent: (c.claimed_at || '').slice(0, 16).replace('T', ' '),
    nudge_sent: c.activation_nudge_sent_at ? c.activation_nudge_sent_at.slice(0, 16).replace('T', ' ') : '—',
    tier: c.tier,
    stripe: await stripeStatusFor(c.claimant_email),
    listing_status: c.listings?.status === 'active' ? 'published' : (c.listings?.status || '—'),
  })
}

// Sort: anything commercially entitled first, then oldest claim first.
const isCommercial = r => r.stripe !== 'none' && r.stripe !== 'unknown' ? true : r.tier === 'standard'
rows.sort((a, b) => {
  const ca = isCommercial(a) ? 0 : 1
  const cb = isCommercial(b) ? 0 : 1
  if (ca !== cb) return ca - cb
  return a.claim_created.localeCompare(b.claim_created)
})

const manual = rows.filter(isCommercial)
const bulk = rows.filter(r => !isCommercial(r))

// ── Table ─────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/\|/g, '\\|')
const table = list => [
  '| # | Listing | Vertical | Claimant email | Claim created | Invite sent | Nudge sent (today) | Tier | Stripe | Listing |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...list.map((r, i) => `| ${i + 1} | ${esc(r.listing)} | ${r.vertical} | ${esc(r.email)} | ${r.claim_created} | ${r.invite_sent} | ${r.nudge_sent} | ${r.tier} | ${r.stripe} | ${r.listing_status} |`),
].join('\n')

const md = `# Claim remediation cohort — unverified owners

Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. **Nothing has been sent.**

${rows.length} live claims are held by an address that has never been verified.

## ⚠︎ Read before sending

**These people were already emailed today.** The activation nudge ran at
06:40 UTC and sent a fresh sign-in link to 24 of them (see the "Nudge sent"
column). Three have verified since. A second email today, telling them their
account "was never fully activated", would contradict the one already in their
inbox — which said their dashboard was ready and gave them a working link.

**Nobody in this cohort is paying.** Stripe has zero active subscriptions
across the whole account. The ${manual.length} row(s) in the manual list below carry
\`tier = standard\` in our database with no Stripe subscription and no comp
record — a separate anomaly worth its own look, not a billing exposure.

## A. Manual — do not bulk-email (${manual.length})

Comped/anomalous Standard tier. Per the spec these are yours to handle individually.

${manual.length ? table(manual) : '_(none)_'}

## B. Standard copy (${bulk.length})

${table(bulk)}

## Column notes

- **Invite sent** — grantClaim mints and sends the invite inside the grant, so
  this is the claim's own timestamp. There is no separate delivery record.
- **Nudge sent** — this morning's activation nudge (\`activation_nudge_sent_at\`).
- **Stripe** — \`none\` means a customer search by email found no live
  subscription. Every row is \`none\`.
- **Listing** — \`published\` = status active.
`

fs.writeFileSync('_remediation/remediation-table.md', md)

// ── Email previews ────────────────────────────────────────
const DRAFT = ({ listing_name, greeting }) => `
<p>${greeting}</p>
<p>I'm writing because of a bug on our end, not anything you've done.</p>
<p>When you claimed <strong>${listing_name}</strong>, we approved it — but a fault in our verification step meant your account was never fully activated. In practice that likely means you've had no way to sign in and edit your listing since you claimed it, even though it shows as claimed on our side.</p>
<p>Your listing itself hasn't been affected. This is purely about getting your account working so you can actually get in and use it.</p>
<p>Click below to activate your account and you'll have full edit access straight away:</p>
<p><a href="{{MAGIC_LINK}}" style="display:inline-block;padding:14px 32px;background:#1C1A17;color:#fff;text-decoration:none;border-radius:999px;font-weight:500;">Activate my account</a></p>
<p>Sorry for the runaround — this should have worked the first time. If anything looks off once you're in, reply to this email directly and I'll sort it.</p>
<p>Matt<br>Australian Atlas Network</p>`

const sample = bulk.slice(0, 3)
const previews = sample.map(r => `
<section style="max-width:640px;margin:0 auto 40px;padding:24px;border:1px solid #e7e3db;border-radius:12px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="font-size:12px;color:#9a958c;margin-bottom:12px;">
    To: <strong>${r.email}</strong> &middot; ${r.listing} &middot; claim created ${r.claim_created}
    ${r.nudge_sent !== '—' ? `<br><span style="color:#b45309;">⚠ already emailed today at ${r.nudge_sent} UTC</span>` : ''}
  </div>
  <div style="font-size:15px;color:#1C1A17;margin-bottom:8px;"><strong>Subject:</strong> A fix to your ${r.listing} claim on Australian Atlas</div>
  <hr style="border:none;border-top:1px solid #ece8e1;margin:16px 0;">
  <div style="font-size:15px;line-height:1.7;color:#3d3a35;">
    ${DRAFT({ listing_name: r.listing, greeting: r.name ? `Hi ${r.name.split(' ')[0]},` : 'Hi,' })}
  </div>
</section>`).join('')

fs.writeFileSync('_remediation/email-previews.html', `<!doctype html>
<html><head><meta charset="utf-8"><title>Remediation email previews — NOT SENT</title></head>
<body style="background:#faf8f5;margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:640px;margin:0 auto 28px;padding:18px 20px;border-radius:10px;background:#fef3c7;border:1px solid #f0d089;">
  <strong style="display:block;margin-bottom:8px;color:#78350f;">Previews only — nothing has been sent.</strong>
  <div style="font-size:14px;line-height:1.6;color:#78350f;">
    This copy is the <strong>draft</strong> from your message, marked <em>"your review — not final"</em>.
    The spec's <code>[APPROVED COPY GOES HERE]</code> placeholder was never filled in, so there is no
    approved copy to use verbatim. Two things to settle before this goes out:
    <ol style="margin:10px 0 0 18px;padding:0;">
      <li style="margin-bottom:6px;">
        <strong>"you've had no way to sign in"</strong> isn't accurate. Every one of these operators
        was sent a working invite link when their claim was approved; most never opened it. 24 of them
        got a second working link this morning. The bug was that we marked the listing claimed without
        waiting for that click — not that we failed to give them a way in.
      </li>
      <li>
        <strong>They were emailed today.</strong> Sending this on top would contradict a message that
        is hours old and told them their dashboard was ready.
      </li>
    </ol>
  </div>
</div>
<div style="max-width:640px;margin:0 auto 24px;font-size:13px;color:#6B6760;">
  Showing ${sample.length} of ${bulk.length} in the bulk list. <code>{{MAGIC_LINK}}</code> is a placeholder —
  real links are minted per recipient at send time and deliberately kept out of this file.
</div>
${previews}
</body></html>`)

console.log(`cohort: ${rows.length} unverified`)
console.log(`  manual (commercial): ${manual.length} — ${manual.map(m => m.listing).join(', ') || 'none'}`)
console.log(`  bulk:                ${bulk.length}`)
console.log(`  already nudged today: ${rows.filter(r => r.nudge_sent !== '—').length}`)
console.log('\nwrote _remediation/remediation-table.md')
console.log('wrote _remediation/email-previews.html')
console.log('\nSENDS: 0   DB WRITES: 0   LINKS MINTED: 0')
