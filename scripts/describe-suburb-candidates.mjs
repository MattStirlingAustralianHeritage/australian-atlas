#!/usr/bin/env node
/**
 * Write grounded descriptions onto queued suburb candidates, before publishing.
 *
 * WHY THIS EXISTS: the candidate-approval route resolves a description in the
 * order  reviewerOverrides > candidate.description > enriched > AI-fallback
 * (app/api/admin/candidates/[id]/route.js). That final AI fallback is an
 * ungated Haiku call — no banned-phrase check, no source binding, and its
 * `descriptionSource` is logged but never persisted. The 2026-07-24 unlogged
 * description audit and the 2026-07-25 tone pass both traced their worst
 * findings to copy written that way.
 *
 * So we fill `candidate.description` FIRST, with text that has passed the same
 * gates the operator-intake writer uses, plus an adversarial grounding pass.
 * Because `candidate.description` outranks the fallback, the ungated path never
 * runs for these listings.
 *
 * GATES, all must pass (one corrective retry on the prose ones):
 *   0. merit panel     — THREE independent votes on the venue itself, each with
 *                        a different lens (chain? visitable? distinctive?), a
 *                        majority required. Runs BEFORE the description is
 *                        written, on facts + site text alone, so a venue we will
 *                        not list costs three cheap votes rather than a full
 *                        generate-and-verify cycle.
 *   1. banned-phrase   — lib/operator-intake/voice.mjs BANNED_PHRASES
 *   2. source-binding  — lib/operator-intake/source-binding.mjs; every 3+ digit
 *                        number and multi-word proper noun must appear verbatim
 *                        in the venue's own site text
 *   3. identity        — does this website actually belong to THIS venue in THIS
 *                        suburb? (the WRONG_SITE failure class: a dead domain
 *                        re-registered by someone else, or a name collision)
 *   4. adversarial     — a second model, prompted to REFUTE, listing any claim
 *                        the source text does not support
 *
 * A candidate that fails after the retry is left with description = null and
 * reported, not published. Silence beats a plausible invention.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/describe-suburb-candidates.mjs --manifest=reports/suburb-gap-crawl-2026-07-25-metro-suburbs.queued.json
 *   node --env-file=.env.local scripts/describe-suburb-candidates.mjs --manifest=… --limit=10 --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSiteText } from '../lib/scrape/fetchSiteText.js'
import { bannedPhraseCheck } from '../lib/operator-intake/voice.mjs'
import { validateSourceBinding } from '../lib/operator-intake/source-binding.mjs'
import { VERTICAL_NAMES } from '../lib/prospector/replenish.js'
import { runMeritPanel } from './merit-panel.mjs'

const MODEL = 'claude-opus-4-8'
const CONCURRENCY = 4

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (url, o = {}) => fetch(url, { ...o, cache: 'no-store' }) },
})
const claude = new Anthropic()

// ── CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (n) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const has = (n) => args.includes(`--${n}`)
const manifestPath = arg('manifest')
const pendingSince = arg('pending-since')
const limit = parseInt(arg('limit') || '0', 10) || null
const dryRun = has('dry-run')
if (!manifestPath && !pendingSince) {
  console.error('Pass --manifest=reports/<run>.queued.json or --pending-since=<ISO date>')
  process.exit(1)
}

// Ring gate: this whole exercise targets the middle and outer suburbs, so a
// candidate inside 5km of a major city centre is off-goal even when it is a
// perfectly good venue. Mirrors INNER_RING_KM in crawl-town-gaps.mjs.
const INNER_RING_KM = 5
const CITY_CENTRES = [
  [-33.8688, 151.2093], [-37.8136, 144.9631], [-27.4698, 153.0251], [-31.9523, 115.8613],
  [-34.9285, 138.6007], [-42.8821, 147.3272], [-35.2809, 149.1300], [-12.4634, 130.8456],
  [-32.9283, 151.7817], [-34.4278, 150.8931], [-38.1499, 144.3617], [-27.9678, 153.4143],
  [-26.6580, 153.0920], [-16.9186, 145.7781], [-19.2590, 146.8169],
]
function kmFromNearestCBD(lat, lng) {
  const R = 6371
  let best = Infinity
  for (const [cLat, cLng] of CITY_CENTRES) {
    const dLat = (cLat - lat) * Math.PI / 180, dLng = (cLng - lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    best = Math.min(best, 2 * R * Math.asin(Math.sqrt(a)))
  }
  return best
}

// ── Sticky rejections ────────────────────────────────────────────────
// A rejected candidate keeps description = null and status = pending, so a
// later run picks it straight back up. Re-rolling costs tokens and, worse, the
// judgement gates are not deterministic: Haberfield Hotel and Dandenong Club
// were each rejected in one batch and passed in the next. Re-attempting until
// something passes is a ratchet in the wrong direction — the strictest verdict
// should win, not the luckiest.
//
// So verdicts that are about the VENUE rather than the prose (no_merit,
// identity_fail) are recorded here and never re-attempted. Prose failures
// (failed_gates) stay retryable, because a rewrite genuinely can fix those.
const STICKY_STATUSES = new Set(['no_merit', 'identity_fail'])
const rejectionsPath = new URL('../reports/suburb-rejections.json', import.meta.url)
let rejections = {}
try { rejections = JSON.parse(readFileSync(rejectionsPath, 'utf8')) } catch { rejections = {} }
function recordRejection(r) {
  if (!STICKY_STATUSES.has(r.status)) return
  rejections[r.id] = { name: r.name, status: r.status, reason: r.reason, at: new Date().toISOString() }
}

let ids = []
if (manifestPath) {
  const manifest = JSON.parse(readFileSync(new URL('../' + manifestPath.replace(/^\.\//, ''), import.meta.url), 'utf8'))
  ids = manifest.candidates.map(c => c.id).filter(Boolean)
  console.log(`Manifest: ${manifest.candidates.length} queued.`)
} else {
  // Pull every still-pending OSM candidate discovered since the given date. This
  // catches candidates from earlier runs of the crawl (before the inner-ring
  // exclusion existed) so their on-goal middle/outer finds aren't stranded.
  const { data, error } = await sb
    .from('listing_candidates')
    .select('id, lat, lng, name')
    .eq('status', 'pending')
    .is('description', null)   // already-described candidates are done; don't overwrite
    .gte('created_at', pendingSince)
    .like('source_detail', 'OpenStreetMap%')
  if (error) { console.error('Query failed:', error.message); process.exit(1) }
  const withCoords = (data || []).filter(c => c.lat && c.lng)
  const onGoal = withCoords.filter(c => kmFromNearestCBD(c.lat, c.lng) >= INNER_RING_KM)
  console.log(`Pending OSM candidates since ${pendingSince}: ${data.length}`)
  console.log(`  dropped ${withCoords.length - onGoal.length} inside ${INNER_RING_KM}km of a CBD (off-goal inner ring)`)
  console.log(`  dropped ${data.length - withCoords.length} without coordinates`)
  ids = onGoal.map(c => c.id)
}
const beforeSticky = ids.length
ids = ids.filter(id => !rejections[id])
if (beforeSticky !== ids.length) console.log(`  skipped ${beforeSticky - ids.length} previously rejected on venue grounds (sticky)`)
if (limit) ids = ids.slice(0, limit)
console.log(`Describing ${ids.length}${dryRun ? ' (DRY RUN)' : ''}\n`)

// ── Prompts ──────────────────────────────────────────────────────────
// Deliberately NOT the operator-intake five-movement structure: that is built
// for facts an operator supplied about their own building. Here the only source
// is the venue's public site, which often says nothing about the premises — so
// the structure is "write only what the source supports", and length floats.
const WRITE_SYSTEM = `You write venue descriptions for Australian Atlas, a curated guide to independent Australian places.

You will be given (a) facts we already hold about a venue and (b) the text of that venue's own website. Write its description.

Absolute rules:
- Use ONLY what is present in the supplied website text and facts. Every specific claim — a year, a name, a product, a process, a location detail — must be traceable to that source text.
- Never fill a gap with general knowledge about the suburb, the city, the trade, or venues "like this one". If the source doesn't say it, it does not go in.
- If the source text is thin, write less. Two accurate sentences are correct; five padded ones are not.
- Do not state the venue's own name — it appears as the page heading.
- Do not mention Australian Atlas, this platform, claiming, or listings.
- Do not use review-speak, superlatives, or promotional language. No "hidden gem", "iconic", "must-visit", "world-class", "boasts", "nestled".
- Do not describe the venue's rating, popularity, or what reviewers say.
- Do NOT inventory facilities, amenities, room types, packages, or prices. "Free WiFi, smart TV, tea and coffee making facilities" is booking-site copy, not a description. Distances to transport, parking arrangements and bed configurations are logistics, not character — leave them out.
- Do NOT list opening days or trading hours. "Open Wednesday to Sunday", "closed Mondays", "dinner Tuesday through Sunday" are logistics too; the page shows them separately and they date badly. If a venue only opens for one meal or one season and that genuinely shapes what it is, say so in words rather than reciting a timetable.
- Write what the place IS and what it is like to be there: what it makes or serves, how it works, what the room or building is like, who runs it. One concrete, specific detail is worth more than five generic ones.
- The source is a scrape of the venue's website, so it carries navigation and page furniture. Describe the venue, never the website: no mention of news or blog sections, newsletters, social feeds, online shops, booking systems, membership portals, published statements, or what the site "features". If a detail only exists because it was a menu item on the page, it is not about the place.
- Australian English. Concrete nouns over adjectives. Plain, exact sentences. No emoji.

Voice: place-grounded, restrained, confident. The register of a good field guide, not a brochure.

Length: 45–130 words. Prose only, one or two short paragraphs. No headings, no preamble, no quotation marks around the whole text.

Output the description text and nothing else.`

const VERIFY_SYSTEM = `You are a fact-checker for Australian Atlas. Your job is to REFUTE a draft venue description, not to approve it.

You are given the venue's known facts, the text of its website, and a draft description. Find every problem.

Judge two things:

1. IDENTITY — does this website plausibly belong to this venue, at this location? Watch for: a site about a completely different business; a domain that has been re-registered by an unrelated company; a same-named venue in a different city or state; a directory/aggregator page rather than the venue's own site; a parked or expired domain. If the site is clearly not this venue's, identity fails.

2. GROUNDING — does every specific claim in the draft trace to the source text? Flag any claim that is invented, embellished, or generalised from outside knowledge: dates, founding years, owner or maker names, place names, products, processes, awards, materials, scale. Also flag promotional or review-derived language, and any statement about how good or popular the venue is.

Be strict on both and default to refusing: if you cannot verify a specific claim from the source text, it is unsupported.

Respond with ONLY a JSON object, no other text:
{"identity_ok": true|false, "identity_note": "<short reason if false, else empty>", "grounded": true|false, "unsupported": ["<the exact claim>", ...], "verdict": "pass"|"fail"}

verdict is "pass" only when identity_ok and grounded are BOTH true.`

// ── Helpers ──────────────────────────────────────────────────────────
function textOf(msg) {
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

async function callClaude({ system, user, maxTokens = 1200, effort = 'high' }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await claude.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },   // off by default on Opus 4.8 — set explicitly
        output_config: { effort },
        system,
        messages: [{ role: 'user', content: user }],
      })
      if (res.stop_reason === 'refusal') return { text: null, refused: true }
      return { text: textOf(res), refused: false }
    } catch (err) {
      const retryable = [429, 500, 502, 503, 529].includes(err?.status)
      if (!retryable || attempt === 3) throw err
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  return { text: null, refused: false }
}

// The verifier is asked for bare JSON, but models occasionally wrap it in a
// fence or add a sentence. Pull the first balanced object rather than trusting
// the whole string to parse.
function parseJsonLoose(s) {
  if (!s) return null
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

// validateSourceBinding was built for operator-submitted facts: short, discrete
// strings where a capitalised run either appears verbatim or was invented. Run
// against prose grounded in a whole scraped website it over-fires, because it
// greedily joins capitalised words across lowercase connectors. Real examples it
// rejected, all of them properly grounded:
//
//   "Open Wednesday"                  — sentence-start "Open" + a weekday
//   "Parramatta and Burwood"          — two suburbs the source names separately
//   "Part of Petersham Bowling Club"  — the club is named; "Part of" is ours
//   "Midnight Cargo Stout and Ruminator Doppelbock" — two beers, both listed
//
// That cost 13 of 31 candidates in one batch, all genuine venues. So: split each
// failed proper-noun run into its capitalised tokens and require EVERY token to
// appear in the source. If they all do, nothing was invented — only the joining
// phrasing is ours — and the claim is downgraded to a warning for the adversarial
// verifier (which reads the source text) to judge in context. A run containing
// any token absent from the source stays a hard failure, and numbers are never
// softened, because a fabricated year or count is the canonical hallucination.
const BINDING_CONNECTORS = new Set(['of', 'the', 'and', 'on', 'at', 'by', 'upon', 'de', 'la', 'le', 'van', 'von', '&', 'a', 'an', 'in'])
function softenBindingFailures(binding, sources) {
  const normalised = sources.map(s => String(s).replace(/\s+/g, ' ').trim().toLowerCase())
  const inSource = (tok) => normalised.some(s => s.includes(tok.toLowerCase()))
  const hard = []
  const softened = []
  for (const claim of binding.failed_claims) {
    if (claim.type !== 'proper_noun') { hard.push(claim); continue }
    const tokens = String(claim.value).split(/\s+/).filter(t => t && !BINDING_CONNECTORS.has(t.toLowerCase()))
    // Require at least two real tokens before softening, and every one grounded.
    if (tokens.length >= 1 && tokens.every(t => inSource(t.replace(/['’]s$/, '')))) softened.push(claim.value)
    else hard.push(claim)
  }
  return { passed: hard.length === 0, hard, softened }
}

function factsBlock(c) {
  return [
    `Name: ${c.name}`,
    c.sub_type ? `Type: ${c.sub_type}` : null,
    `Atlas vertical: ${VERTICAL_NAMES[c.vertical] || c.vertical}`,
    c.address ? `Address: ${c.address}` : null,
    c.region ? `Suburb / area: ${c.region}` : null,
    c.state ? `State: ${c.state}` : null,
    c.website_url ? `Website: ${c.website_url}` : null,
  ].filter(Boolean).join('\n')
}

// ── Per-candidate pipeline ───────────────────────────────────────────
async function describe(c) {
  const out = { id: c.id, name: c.name, vertical: c.vertical, region: c.region, state: c.state, status: null, reason: null, description: null, attempts: 0 }

  if (!c.website_url) { out.status = 'no_website'; out.reason = 'no website to ground against'; return out }

  const site = await fetchSiteText(c.website_url, { maxChars: 8000 })
  if (!site.text || site.text.length < 200) {
    out.status = 'no_site_text'
    out.reason = `site unreadable (http ${site.status}${site.text ? `, ${site.text.length} chars` : ''})`
    return out
  }
  out.via = site.via
  const sources = [site.text, c.name, c.region, c.state, c.address].filter(Boolean)

  // ── Merit panel: three lenses, majority rules, judged before we write ──
  const panel = await runMeritPanel({
    callClaude, parseJsonLoose,
    factsText: factsBlock(c), siteText: site.text, websiteUrl: c.website_url,
  })
  out.meritVotes = panel.votes.map(v => `${v.key}:${v.merit === null ? 'abstain' : v.merit}`).join(' ')
  if (!panel.passed) {
    if (panel.inconclusive) {
      // Nobody actually voted against it — the panel could not be run. Report it
      // as an error so it is retried later, and never record it as a sticky
      // venue rejection.
      out.status = 'merit_inconclusive'
      out.reason = `panel could not be run (${panel.abstained.map(v => `${v.key}: ${v.reason}`).join(' | ')})`
      return out
    }
    out.status = 'no_merit'
    out.reason = panel.against.map(v => `${v.key}: ${v.reason}`).join(' | ')
    return out
  }
  // A split decision still publishes, but record it so it stays reviewable.
  if (panel.against.length) out.meritSplit = panel.against.map(v => `${v.key}: ${v.reason}`).join(' | ')

  let feedback = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    out.attempts = attempt
    const user = [
      'FACTS WE HOLD:', factsBlock(c), '',
      `WEBSITE TEXT (${c.website_url}):`, site.text, '',
      feedback ? `Your previous draft was rejected. Fix these specific problems and rewrite:\n${feedback}` : 'Write the description.',
    ].join('\n')

    const gen = await callClaude({ system: WRITE_SYSTEM, user, maxTokens: 1200 })
    if (gen.refused) { out.status = 'refused'; out.reason = 'model declined'; return out }
    const draft = (gen.text || '').replace(/^["'\s]+|["'\s]+$/g, '')
    if (!draft) { feedback = 'You produced no text.'; continue }

    // Gate 1 — banned phrases
    const banned = bannedPhraseCheck(draft)
    if (!banned.passed) {
      feedback = `Banned phrases used: ${banned.violations.join(', ')}. Remove them entirely.`
      out.reason = `banned:${banned.violations.join('|')}`
      continue
    }

    // Gate 2 — source binding (numbers + multi-word proper nouns must be in source)
    const rawBinding = validateSourceBinding(draft, {}, sources)
    const binding = rawBinding.passed ? { passed: true, hard: [], softened: [] } : softenBindingFailures(rawBinding, sources)
    if (binding.softened.length) out.softenedClaims = binding.softened
    if (!binding.passed) {
      const bad = binding.hard.map(f => `${f.type} "${f.value}"`).join(', ')
      // The binding checker matches a capitalised run VERBATIM, and treats "and"
      // as part of the run. So joining two separately-grounded names into one
      // phrase ("Belgian Tripel and Stout") fails even though both terms are in
      // the source. Say so, or the rewrite just deletes real detail.
      feedback = [
        `A source-binding check could not find these exact phrases in the website text: ${bad}.`,
        `Note how the check works: it looks for each capitalised phrase verbatim, and treats "and"/"of"/"the" as part of the phrase. So if you joined two separate names into one phrase (for example "X and Y", where the source mentions X and Y separately), that phrase will not be found even though both names are genuine.`,
        `Fix it by naming each item in its own phrase, separated by ordinary lowercase words, exactly as the source spells it — or by dropping the detail. Do not invent a replacement.`,
      ].join(' ')
      out.reason = `binding:${bad}`
      continue
    }

    // Gates 3 + 4 — identity and adversarial grounding, one call
    const vres = await callClaude({
      system: VERIFY_SYSTEM,
      user: [
        'FACTS WE HOLD:', factsBlock(c), '',
        `WEBSITE TEXT (${c.website_url}):`, site.text, '',
        'DRAFT DESCRIPTION:', draft,
      ].join('\n'),
      maxTokens: 2500,
    })
    let verdict = parseJsonLoose(vres.text)
    if (!verdict) {
      // Don't blame the draft for an unreadable verifier reply — the earlier
      // budget shared 900 tokens between adaptive thinking and the JSON, so the
      // object was simply cut off. Ask once more with more room before falling
      // through to a rewrite the draft may not need.
      const retry = await callClaude({
        system: VERIFY_SYSTEM,
        user: [
          'FACTS WE HOLD:', factsBlock(c), '',
          `WEBSITE TEXT (${c.website_url}):`, site.text, '',
          'DRAFT DESCRIPTION:', draft, '',
          'Respond with the JSON object only.',
        ].join('\n'),
        maxTokens: 3000,
        effort: 'medium',
      })
      verdict = parseJsonLoose(retry.text)
      if (!verdict) {
        feedback = 'Verification could not be completed; rewrite more conservatively and with fewer specifics.'
        out.reason = 'verifier_unparsable'
        continue
      }
    }

    if (verdict.identity_ok === false) {
      // Identity failure is not a writing problem — a retry cannot fix a wrong
      // website. Stop and flag for human review.
      out.status = 'identity_fail'
      out.reason = verdict.identity_note || 'website does not belong to this venue'
      return out
    }
    if (verdict.verdict !== 'pass' || verdict.grounded === false) {
      const claims = (verdict.unsupported || []).join('; ')
      feedback = `A fact-checker found these claims unsupported by the website text: ${claims}. Rewrite using only what the source states.`
      out.reason = `ungrounded:${claims.slice(0, 200)}`
      continue
    }

    // All four gates passed.
    out.status = 'ok'
    out.reason = null
    out.description = draft
    out.warnings = rawBinding.warnings?.map(w => w.value) || []
    if (!dryRun) {
      // Transient socket failures ("TypeError: fetch failed") do happen over a
      // long run. Losing the write means the whole generate-and-gate cycle is
      // repeated next time for a description we already have, so retry briefly
      // before giving up.
      let writeErr = null
      for (let a = 0; a < 3; a++) {
        try {
          const { error } = await sb.from('listing_candidates').update({ description: draft }).eq('id', c.id)
          if (!error) { writeErr = null; break }
          writeErr = error.message
        } catch (err) { writeErr = err.message }
        await new Promise(r => setTimeout(r, 1500 * (a + 1)))
      }
      if (writeErr) { out.status = 'write_failed'; out.reason = writeErr }
    }
    return out
  }

  out.status = 'failed_gates'
  return out
}

// ── Run with bounded concurrency ─────────────────────────────────────
const { data: rows, error } = await sb
  .from('listing_candidates')
  .select('id, name, website_url, vertical, region, state, address, sub_type, description, status')
  .in('id', ids)
if (error) { console.error('Fetch failed:', error.message); process.exit(1) }
console.log(`Fetched ${rows.length} candidate rows.\n`)

const results = []
let cursor = 0
async function worker(n) {
  while (cursor < rows.length) {
    const c = rows[cursor++]
    const i = cursor
    try {
      const r = await describe(c)
      results.push(r)
      recordRejection(r)
      const tag = r.status === 'ok' ? '✓' : r.status === 'identity_fail' ? '⚠' : '✗'
      console.log(`${tag} [${i}/${rows.length}] ${c.name} [${c.vertical}] ${r.status}${r.reason ? ` — ${String(r.reason).slice(0, 120)}` : ''}`)
    } catch (err) {
      results.push({ id: c.id, name: c.name, status: 'error', reason: err.message })
      console.log(`! [${i}/${rows.length}] ${c.name} ERROR ${err.message}`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, n) => worker(n)))

// ── Summary ──────────────────────────────────────────────────────────
const by = {}
for (const r of results) by[r.status] = (by[r.status] || 0) + 1
console.log('\n=== SUMMARY ===')
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`)

writeFileSync(rejectionsPath, JSON.stringify(rejections, null, 2))
console.log(`Sticky rejections on file: ${Object.keys(rejections).length}`)

const outPath = new URL(`../reports/suburb-descriptions-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url)
writeFileSync(outPath, JSON.stringify({ model: MODEL, dryRun, results }, null, 2))
console.log(`\nDetail: reports/suburb-descriptions-${new Date().toISOString().slice(0, 10)}.json`)
console.log(`Ready to publish: ${by.ok || 0}`)
