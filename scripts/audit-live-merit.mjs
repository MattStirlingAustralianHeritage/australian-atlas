#!/usr/bin/env node
/**
 * Re-judge already-published listings against the current merit panel.
 *
 * WHY: the merit rules were tightened after publishing had already begun — most
 * consequentially, licensed community/sporting/returned-services clubs became a
 * binding exclusion. A rule change that only applies to future candidates leaves
 * the live corpus inconsistent with its own standard, and the listings that
 * slipped through are exactly the ones nobody will look at again.
 *
 * Screens the listings this exercise published, re-runs the three-lens panel on
 * the ones the current rules put at risk, and reports which no longer hold. With
 * --hide it withdraws the failures the same way Haberfield Hotel was withdrawn:
 * PATCH status=hidden through the admin route, which also drafts the vertical
 * row so the 6-hourly sync cannot revert it.
 *
 *   node --env-file=.env.local scripts/audit-live-merit.mjs
 *   node --env-file=.env.local scripts/audit-live-merit.mjs --hide
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSiteText } from '../lib/scrape/fetchSiteText.js'
import { runMeritPanel } from './merit-panel.mjs'
import { VERTICAL_NAMES } from '../lib/prospector/replenish.js'

const args = process.argv.slice(2)
const doHide = args.includes('--hide')
const since = args.find(a => a.startsWith('--since='))?.split('=')[1] || '2026-07-25T00:00:00Z'
const base = (args.find(a => a.startsWith('--base='))?.split('=')[1] || 'https://www.australianatlas.com.au').replace(/\/$/, '')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (url, o = {}) => fetch(url, { ...o, cache: 'no-store' }) },
})
const claude = new Anthropic()

// Screen rather than re-judge all: a full re-panel is 3 model calls per listing.
// These patterns are where the tightened rules actually bite — club/RSL naming,
// and accommodation, which is where the "supply of rooms" test was added. Food
// venues named after a person or a dish were never at risk from this change.
const AT_RISK_NAME = /\b(club|rsl|bowling|bowls|leagues|workers|golf|hotel|motel|inn|lodge|resort|apartments|suites|tavern)\b/i
// The name alone misses venues that sit inside an excluded institution without
// saying so — "The Bistro at The PBC" is Petersham Bowling Club. The description
// is grounded in the venue's own site, so screen that too.
const AT_RISK_TEXT = /\b(club|rsl|bowling|bowls green|leagues|gaming|pokies|poker machines|tab|keno|franchis|our locations|other stores)\b/i
const AT_RISK_VERTICALS = new Set(['rest'])

function textOf(msg) { return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() }
async function callClaude({ system, user, maxTokens = 1200, effort = 'medium' }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await claude.messages.create({
        model: 'claude-opus-4-8', max_tokens: maxTokens,
        thinking: { type: 'adaptive' }, output_config: { effort },
        system, messages: [{ role: 'user', content: user }],
      })
      if (res.stop_reason === 'refusal') return { text: null }
      return { text: textOf(res) }
    } catch (err) {
      if (![429, 500, 502, 503, 529].includes(err?.status) || attempt === 3) throw err
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  return { text: null }
}
function parseJsonLoose(s) {
  if (!s) return null
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)) } catch { return null } } }
  }
  return null
}

const { data: listings, error } = await sb
  .from('listings')
  .select('id, name, slug, vertical, region, state, address, website, status, description')
  .eq('status', 'active')
  .gte('created_at', since)
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const atRisk = listings.filter(l => AT_RISK_NAME.test(l.name) || AT_RISK_TEXT.test(l.description || '') || AT_RISK_VERTICALS.has(l.vertical))
console.log(`${listings.length} active listings published since ${since.slice(0, 10)}`)
console.log(`${atRisk.length} match the tightened rules' risk profile (club/RSL naming or description, gaming, chain signals, or accommodation)\n`)

const failures = []
for (const [i, l] of atRisk.entries()) {
  const label = `[${i + 1}/${atRisk.length}] ${l.name} [${l.vertical}]`
  if (!l.website) { console.log(`?  ${label} — no website on record, cannot re-judge`); continue }
  const site = await fetchSiteText(l.website, { maxChars: 8000 })
  if (!site.text) { console.log(`?  ${label} — site unreadable (http ${site.status})`); continue }

  const facts = [
    `Name: ${l.name}`,
    `Atlas vertical: ${VERTICAL_NAMES[l.vertical] || l.vertical}`,
    l.address ? `Address: ${l.address}` : null,
    l.region ? `Suburb / area: ${l.region}` : null,
    l.state ? `State: ${l.state}` : null,
  ].filter(Boolean).join('\n')

  const panel = await runMeritPanel({ callClaude, parseJsonLoose, factsText: facts, siteText: site.text, websiteUrl: l.website })
  const votes = panel.votes.map(v => `${v.key}:${v.merit === null ? 'abstain' : v.merit}`).join(' ')
  if (panel.passed) {
    console.log(`OK ${label} — ${panel.forCount}/3 (${votes})`)
  } else {
    const reason = panel.against.map(v => `${v.key}: ${v.reason}`).join(' | ')
    failures.push({ ...l, votes, reason })
    console.log(`✗  ${label} — ${panel.forCount}/3 (${votes})\n     ${reason.slice(0, 200)}`)
  }
}

console.log(`\n=== ${failures.length} live listing(s) no longer meet the merit bar ===`)
for (const f of failures) console.log(`  ${f.name} [${f.vertical}] /place/${f.slug}`)

writeFileSync(new URL('../reports/live-merit-audit.json', import.meta.url), JSON.stringify({ since, screened: atRisk.length, failures }, null, 2))

if (!doHide) {
  console.log(failures.length ? '\nRe-run with --hide to withdraw them.' : '')
  process.exit(0)
}
if (!failures.length) process.exit(0)

// Withdraw exactly as Haberfield Hotel was: PATCH status=hidden through the
// admin route, so updateListing also drafts the vertical row and the 6-hourly
// sync cannot bring it back.
const auth = await fetch(`${base}/api/admin-auth`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
})
if (!auth.ok) { console.error('admin-auth failed:', auth.status); process.exit(1) }
const cookie = (auth.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')

console.log('\nWithdrawing…')
for (const f of failures) {
  const res = await fetch(`${base}/api/admin/listings/${f.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ status: 'hidden' }),
  })
  console.log(`  ${res.ok ? '✓' : '✗'} ${f.name} — HTTP ${res.status}`)
  await new Promise(r => setTimeout(r, 800))
}
