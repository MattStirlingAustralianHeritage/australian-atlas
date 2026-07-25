#!/usr/bin/env node
/**
 * Publish described suburb candidates through the real approval route.
 *
 * WHY THE ROUTE AND NOT A SCRIPT: approving a candidate is not one write. It
 * enriches from the website, anchor-geocodes, resolves state and region through
 * the override/computed FK chain, pushes to the vertical's own Supabase project
 * FIRST, then inserts into master `listings`, tags cross-vertical `verticals`,
 * regenerates the Voyage embedding, and finally marks the candidate converted.
 * Re-implementing that here would fork the logic and rot. So we drive
 * POST /api/admin/candidates/[id] exactly as the admin UI does.
 *
 * Point --base at a dev server running THIS worktree (same code as origin/main,
 * same production databases) rather than at production, so a bad batch is
 * interrupted locally instead of mid-flight in a serverless function.
 *
 * Candidates are only published when describe-suburb-candidates.mjs recorded
 * status 'ok' for them — that is, their description passed the banned-phrase,
 * source-binding, identity and adversarial-grounding gates. Anything else is
 * skipped and reported.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/publish-suburb-candidates.mjs \
 *     --results=reports/suburb-descriptions-2026-07-25.json --base=http://localhost:3000
 *   … --limit=1        # publish a single one first and check it renders
 *   … --dry-run        # resolve auth + list what would publish, write nothing
 */
import { readFileSync, writeFileSync } from 'fs'

const args = process.argv.slice(2)
const arg = (n) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1]
const has = (n) => args.includes(`--${n}`)
const resultsPath = arg('results')
const base = (arg('base') || 'http://localhost:3000').replace(/\/$/, '')
const limit = parseInt(arg('limit') || '0', 10) || null
const dryRun = has('dry-run')
if (!resultsPath) { console.error('Pass --results=reports/suburb-descriptions-<date>.json'); process.exit(1) }

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) { console.error('ADMIN_PASSWORD not in env'); process.exit(1) }

const results = JSON.parse(readFileSync(new URL('../' + resultsPath.replace(/^\.\//, ''), import.meta.url), 'utf8'))
let ready = results.results.filter(r => r.status === 'ok')
if (limit) ready = ready.slice(0, limit)
console.log(`${results.results.length} described, ${results.results.filter(r => r.status === 'ok').length} passed all gates, publishing ${ready.length}${dryRun ? ' (DRY RUN)' : ''}\n`)
if (!ready.length) { console.log('Nothing to publish.'); process.exit(0) }

// ── Admin session ────────────────────────────────────────────────────
// POST /api/admin-auth returns the signed atlas_admin JWT as a Set-Cookie.
async function mintAdminCookie() {
  const res = await fetch(`${base}/api/admin-auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`admin-auth ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const setCookie = res.headers.getSetCookie?.() || [res.headers.get('set-cookie')].filter(Boolean)
  const jar = setCookie.map(c => c.split(';')[0]).join('; ')
  if (!/atlas_admin=/.test(jar)) throw new Error('no atlas_admin cookie returned')
  return jar
}

console.log(`Authenticating against ${base} …`)
const cookie = await mintAdminCookie()
console.log('Admin session established.\n')

// ── Publish ──────────────────────────────────────────────────────────
const published = []
const failed = []

for (let i = 0; i < ready.length; i++) {
  const r = ready[i]
  const label = `[${i + 1}/${ready.length}] ${r.name} [${r.vertical}] ${r.region || ''} ${r.state || ''}`.trim()
  if (dryRun) { console.log(`· would publish ${label}`); continue }

  const started = Date.now()
  try {
    const res = await fetch(`${base}/api/admin/candidates/${r.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ action: 'approve' }),
    })
    const body = await res.json().catch(() => ({}))
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (!res.ok) {
      failed.push({ ...r, http: res.status, error: body?.error || JSON.stringify(body).slice(0, 300) })
      console.log(`✗ ${label} — HTTP ${res.status}: ${String(body?.error || '').slice(0, 160)}`)
    } else {
      published.push({ ...r, listingId: body?.listing?.id || body?.listingId || null, slug: body?.listing?.slug || body?.slug || null, secs })
      console.log(`✓ ${label} — ${secs}s  slug=${body?.listing?.slug || body?.slug || '?'}`)
    }
  } catch (err) {
    failed.push({ ...r, error: err.message })
    console.log(`! ${label} — ${err.message}`)
  }
  // The route does a vertical push + master write + embedding per call; give the
  // downstream Supabase projects and the Anthropic/Voyage budgets some air.
  await new Promise(r => setTimeout(r, 1200))
}

console.log('\n=== SUMMARY ===')
console.log(`Published: ${published.length}`)
console.log(`Failed:    ${failed.length}`)
if (failed.length) {
  console.log('\nFailures:')
  for (const f of failed) console.log(`  ${f.name} [${f.vertical}] — ${String(f.error).slice(0, 200)}`)
}

if (!dryRun) {
  const outPath = new URL(`../reports/suburb-published-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url)
  writeFileSync(outPath, JSON.stringify({ base, published, failed }, null, 2))
  console.log(`\nDetail: reports/suburb-published-${new Date().toISOString().slice(0, 10)}.json`)
}
