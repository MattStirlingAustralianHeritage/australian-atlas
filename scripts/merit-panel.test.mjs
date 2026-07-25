#!/usr/bin/env node
/**
 * Regression test for the editorial-merit panel.
 *
 * The bug this guards: merit was a single model verdict, and it was a coin
 * flip. Haberfield Hotel (a new 67-room hotel on Parramatta Road) and Dandenong
 * Club (a large suburban club with a betting sub-club) were each rejected in one
 * batch and passed in the next; Haberfield went live before being withdrawn.
 *
 * So this test does the one thing that actually demonstrates a fix: it runs the
 * SAME venue through the panel REPEATEDLY and requires the verdict to be stable
 * across runs, not merely correct once. --rounds controls how many times.
 *
 * It also pins both directions. Two venues must stay OUT (the flip-floppers) and
 * two must stay IN (Luke's Banh Mi, A1 Bakery Fairfield) — humble suburban
 * places that a gate tightened against chains could easily over-reject. A change
 * that fixes the false accepts by rejecting everything fails this test.
 *
 *   node --env-file=.env.local scripts/merit-panel.test.mjs
 *   node --env-file=.env.local scripts/merit-panel.test.mjs --rounds=3
 */
import Anthropic from '@anthropic-ai/sdk'
import { fetchSiteText } from '../lib/scrape/fetchSiteText.js'
import { runMeritPanel } from './merit-panel.mjs'

const rounds = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '2', 10)
const claude = new Anthropic()

// Fixed URLs rather than DB lookups: the test must keep working after the rows
// are converted, deleted or re-slugged.
const CASES = [
  {
    name: 'Haberfield Hotel',
    url: 'https://www.haberfieldhotel.com.au/',
    facts: 'Name: Haberfield Hotel\nAtlas vertical: Rest Atlas\nSuburb / area: Haberfield\nState: NSW',
    expect: false,
    why: 'new-build roadside hotel; a supply of rooms on Parramatta Road',
  },
  {
    name: 'Dandenong Club',
    url: 'https://www.dandenongclub.com.au/',
    facts: 'Name: Dandenong Club\nAtlas vertical: Table Atlas\nSuburb / area: Dandenong\nState: VIC',
    expect: false,
    why: 'large generic suburban club, gaming/betting-led',
  },
  {
    name: "Luke's Banh Mi",
    url: 'https://www.lukesbanhmi.com.au/',
    facts: "Name: Luke's Banh Mi\nAtlas vertical: Table Atlas\nSuburb / area: Preston\nState: VIC",
    expect: true,
    why: 'humble independent bánh mì shop — must not be over-rejected',
  },
  {
    name: 'A1 Bakery Fairfield',
    url: 'https://a1bakeryfairfield.com.au/',
    facts: 'Name: A1 Bakery Fairfield\nAtlas vertical: Table Atlas\nSuburb / area: Fairfield\nState: VIC',
    expect: true,
    why: 'owner-run Middle-Eastern bakery — must not be over-rejected',
  },
]

function textOf(msg) {
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}
async function callClaude({ system, user, maxTokens = 1200, effort = 'medium' }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await claude.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system,
        messages: [{ role: 'user', content: user }],
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

let failures = 0
console.log(`Merit panel regression — ${CASES.length} venues × ${rounds} rounds\n`)

for (const c of CASES) {
  const site = await fetchSiteText(c.url, { maxChars: 8000 })
  if (!site.text) {
    console.log(`SKIP  ${c.name} — site unreadable (http ${site.status}); cannot judge`)
    continue
  }
  const verdicts = []
  for (let r = 0; r < rounds; r++) {
    const panel = await runMeritPanel({
      callClaude, parseJsonLoose,
      factsText: c.facts, siteText: site.text, websiteUrl: c.url,
    })
    verdicts.push({ passed: panel.passed, split: `${panel.forCount}/3`, votes: panel.votes })
  }
  const allAsExpected = verdicts.every(v => v.passed === c.expect)
  const stable = new Set(verdicts.map(v => v.passed)).size === 1
  const ok = allAsExpected && stable
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  console.log(`      expected merit=${c.expect} (${c.why})`)
  for (const [i, v] of verdicts.entries()) {
    console.log(`      round ${i + 1}: merit=${v.passed} (${v.split} for) — ${v.votes.map(x => `${x.key}:${x.merit}`).join(' ')}`)
  }
  if (!stable) console.log('      ** UNSTABLE across rounds — the flakiness is not fixed **')
  console.log()
}

console.log(failures === 0
  ? `All ${CASES.length} venues held their expected verdict across ${rounds} rounds.`
  : `${failures} venue(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
