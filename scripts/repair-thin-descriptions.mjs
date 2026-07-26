#!/usr/bin/env node
/**
 * Re-write published descriptions that were produced from a truncated scrape.
 *
 * WHY: the describe step read only the first 8,000 characters of a venue's
 * website. On a venue that lives inside a big organisation's site — a council, a
 * shire, a university — that is entirely navigation, and the venue's own content
 * sits well past the cut. IndigiScapes went live with "The source material is
 * thin on detail beyond its place on Redlands Coast", a description of our own
 * inputs rather than the place; its real text (14.5 hectares of bushland, the
 * native nursery, the nature tracks, the cafe) begins around offset 12,000.
 *
 * The cap is now 20,000, but that only helps future candidates. This finds the
 * already-published ones and rewrites them in place through the same gates, so a
 * fix to the pipeline reaches the corpus it already produced.
 *
 * SELECTION — a description is suspect when it is very short, or when it talks
 * about the source material instead of the venue. Both are cheap to detect and
 * neither needs a model call to screen.
 *
 * Rewrites go through PATCH /api/admin/listings/[id], so the vertical row and
 * the region/embedding chain stay consistent. A listing whose fresh draft still
 * fails the gates is REPORTED, not left with the bad text and not silently
 * blanked — with --withdraw it is hidden instead, because a contentless
 * description should not be public.
 *
 *   node --env-file=.env.local scripts/repair-thin-descriptions.mjs
 *   node --env-file=.env.local scripts/repair-thin-descriptions.mjs --apply
 *   node --env-file=.env.local scripts/repair-thin-descriptions.mjs --apply --withdraw
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSiteText } from '../lib/scrape/fetchSiteText.js'
import { bannedPhraseCheck } from '../lib/operator-intake/voice.mjs'
import { validateSourceBinding } from '../lib/operator-intake/source-binding.mjs'
import { VERTICAL_NAMES } from '../lib/prospector/replenish.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const withdraw = args.includes('--withdraw')
const since = args.find(a => a.startsWith('--since='))?.split('=')[1] || '2026-07-25T00:00:00Z'
const base = (args.find(a => a.startsWith('--base='))?.split('=')[1] || 'https://www.australianatlas.com.au').replace(/\/$/, '')
const MODEL = 'claude-opus-4-8'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (url, o = {}) => fetch(url, { ...o, cache: 'no-store' }) },
})
const claude = new Anthropic()

// Same detector the describe step now gates on, plus a length floor. Kept in
// sync deliberately: if one grows a case, so should the other.
const META_RE = /\b(source material|the source|source text|little (?:detail|information)|scarce|not stated on|website does not|site does not|no further detail|beyond (?:this|that), |information (?:is )?(?:limited|unavailable|not available)|thin on detail)\b/i
// 80, not 180. The writer is told "two accurate sentences are correct; five
// padded ones are not", so a concise description is the goal, not a defect — a
// 180-char floor flagged Braci (163) and Everydays Smokin BBQ (101), both of
// which read perfectly well. Only something under about 80 characters is short
// enough to be genuinely contentless.
const MIN_CHARS = 80

const WRITE_SYSTEM = `You write venue descriptions for Australian Atlas, a curated guide to independent Australian places.

You will be given facts about a venue and the text of its own website. Write its description.

Absolute rules:
- Use ONLY what is present in the supplied website text and facts. Every specific claim must be traceable to that source.
- The source is a scrape and carries navigation and page furniture, sometimes thousands of characters of it. Ignore all of that. Describe the venue, never the website: no news sections, newsletters, social feeds, online shops, booking systems, or what the site "features".
- NEVER write about the source, or about how much information you had. "The source material is thin", "little detail is available", "the website does not say" are meta-commentary and must never appear.
- Do not state the venue's own name — it is the page heading.
- No superlatives, no review-speak, no promotional language. Not "hidden gem", "iconic", "must-visit", "world-class", "boasts", "nestled" — even if the venue's own site uses them.
- Do not inventory facilities or amenities, and do not list opening days or trading hours.
- Write what the place IS and what it is like to be there.
- Australian English. Concrete nouns over adjectives. No emoji.
- Length 45–130 words, one or two short paragraphs.
- If the source genuinely does not support two substantive sentences about the place, output exactly NO_BASIS and nothing else.

Output the description text and nothing else.`

function textOf(msg) { return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() }
async function callClaude({ system, user, maxTokens = 1500 }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await claude.messages.create({
        model: MODEL, max_tokens: maxTokens,
        thinking: { type: 'adaptive' }, output_config: { effort: 'high' },
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

// The binding checker greedily joins capitalised words across lowercase
// connectors, and de-groups digits in the draft but not the source. Both produce
// false failures on properly grounded prose ("Italian and Australian", "On Main
// Road", a source's "6,000"). The describe step already softens these; repeating
// the logic here rather than diverging, because a repair pass that is stricter
// than the writer would withdraw listings the writer would happily have passed.
const BINDING_CONNECTORS = new Set(['of', 'the', 'and', 'on', 'at', 'by', 'upon', 'de', 'la', 'le', 'van', 'von', '&', 'a', 'an', 'in'])
function bindingPasses(draft, sources) {
  const raw = validateSourceBinding(draft, {}, sources)
  if (raw.passed) return { passed: true, hard: [] }
  const normalised = sources.map(x => String(x).replace(/\s+/g, ' ').trim().toLowerCase())
  const deGrouped = normalised.map(x => x.replace(/(\d),(\d)/g, '$1$2'))
  const inSource = (tok) => normalised.some(x => x.includes(tok.toLowerCase()))
  const hard = []
  for (const claim of raw.failed_claims) {
    if (claim.type === 'number') {
      if (!deGrouped.some(x => x.includes(String(claim.value)))) hard.push(claim)
      continue
    }
    if (claim.type !== 'proper_noun') { hard.push(claim); continue }
    const tokens = String(claim.value).split(/\s+/).filter(t => t && !BINDING_CONNECTORS.has(t.toLowerCase()))
    if (!(tokens.length >= 1 && tokens.every(t => inSource(t.replace(/['’]s$/, ''))))) hard.push(claim)
  }
  return { passed: hard.length === 0, hard }
}

const { data: listings, error } = await sb
  .from('listings')
  .select('id, name, slug, vertical, region, state, address, website, description')
  .eq('status', 'active')
  .gte('created_at', since)
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const suspect = listings.filter(l => {
  const d = (l.description || '').trim()
  return d.length < MIN_CHARS || META_RE.test(d)
})
console.log(`${listings.length} active listings since ${since.slice(0, 10)}`)
console.log(`${suspect.length} suspect (under ${MIN_CHARS} chars, or referring to the source)\n`)
if (!suspect.length) process.exit(0)

let cookie = null
if (apply) {
  const auth = await fetch(`${base}/api/admin-auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  })
  if (!auth.ok) { console.error('admin-auth failed:', auth.status); process.exit(1) }
  cookie = (auth.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
}

const results = []
for (const [i, l] of suspect.entries()) {
  const label = `[${i + 1}/${suspect.length}] ${l.name} [${l.vertical}]`
  const why = (l.description || '').length < MIN_CHARS ? `only ${(l.description || '').length} chars` : 'refers to the source'
  console.log(`\n${label} — ${why}`)
  console.log(`  old: ${(l.description || '').slice(0, 110)}…`)

  if (!l.website) { console.log('  ? no website on record'); results.push({ ...l, outcome: 'no_website' }); continue }
  const site = await fetchSiteText(l.website, { maxChars: 20000 })
  if (!site.text) { console.log(`  ? site unreadable (http ${site.status})`); results.push({ ...l, outcome: 'no_site_text' }); continue }

  const facts = [
    `Name: ${l.name}`,
    `Atlas vertical: ${VERTICAL_NAMES[l.vertical] || l.vertical}`,
    l.address ? `Address: ${l.address}` : null,
    l.region ? `Suburb / area: ${l.region}` : null,
    l.state ? `State: ${l.state}` : null,
  ].filter(Boolean).join('\n')

  const gen = await callClaude({
    system: WRITE_SYSTEM,
    user: ['FACTS WE HOLD:', facts, '', `WEBSITE TEXT (${l.website}):`, site.text, '', 'Write the description.'].join('\n'),
  })
  const draft = (gen.text || '').replace(/^["'\s]+|["'\s]+$/g, '')

  if (/^NO_BASIS\b/i.test(draft) || !draft) {
    console.log('  ✗ writer declined (NO_BASIS) — source supports nothing substantive')
    results.push({ ...l, outcome: 'no_basis' })
    continue
  }
  const banned = bannedPhraseCheck(draft)
  if (!banned.passed) { console.log(`  ✗ banned phrase: ${banned.violations.join(', ')}`); results.push({ ...l, outcome: 'banned' }); continue }
  if (META_RE.test(draft)) { console.log('  ✗ still refers to the source'); results.push({ ...l, outcome: 'meta' }); continue }
  const binding = bindingPasses(draft, [site.text, l.name, l.region, l.state, l.address].filter(Boolean))
  if (!binding.passed) {
    console.log(`  ✗ ungrounded: ${binding.hard.map(f => f.value).join(', ')}`)
    results.push({ ...l, outcome: 'ungrounded' })
    continue
  }

  console.log(`  new: ${draft.slice(0, 160)}…`)
  if (!apply) { results.push({ ...l, outcome: 'would_rewrite', draft }); continue }

  const res = await fetch(`${base}/api/admin/listings/${l.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ description: draft }),
  })
  console.log(`  ${res.ok ? '✓ rewritten' : `✗ PATCH ${res.status}`}`)
  results.push({ ...l, outcome: res.ok ? 'rewritten' : `patch_${res.status}`, draft })
  await new Promise(r => setTimeout(r, 800))
}

// Anything still without a usable description should not stay public.
const unfixable = results.filter(r => ['no_basis', 'no_site_text', 'no_website', 'meta', 'ungrounded', 'banned'].includes(r.outcome))
console.log('\n=== SUMMARY ===')
const by = {}
for (const r of results) by[r.outcome] = (by[r.outcome] || 0) + 1
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`)

if (unfixable.length && apply && withdraw) {
  console.log('\nWithdrawing the ones still without a usable description…')
  for (const r of unfixable) {
    const res = await fetch(`${base}/api/admin/listings/${r.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status: 'hidden' }),
    })
    console.log(`  ${res.ok ? '✓' : '✗'} ${r.name} — HTTP ${res.status}`)
    await new Promise(r2 => setTimeout(r2, 800))
  }
} else if (unfixable.length) {
  console.log(`\n${unfixable.length} still unusable — re-run with --apply --withdraw to hide them.`)
}

writeFileSync(new URL('../reports/thin-description-repair.json', import.meta.url), JSON.stringify({ since, suspect: suspect.length, results }, null, 2))
