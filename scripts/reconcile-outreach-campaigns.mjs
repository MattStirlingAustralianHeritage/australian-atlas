#!/usr/bin/env node
/**
 * Reconcile outreach_campaigns.sent totals against surviving funnel rows.
 *
 * Why: operator_outreach.listing_id was ON DELETE CASCADE until migration 258,
 * so deleting a listing silently destroyed its send records (Gallery Cosmosis,
 * 2026-07-24: campaign auto_2026-07-23_42a57f says sent=100, 99 rows remain).
 * This script finds every campaign whose sent counter exceeds its surviving
 * rows, then attempts forensic recovery of the missing sends from
 * outreach_events (the append-only Resend webhook log, which has no FK and
 * therefore survived): any message id in the event log that matches no funnel
 * row across all five outreach tables is an orphaned send.
 *
 * Usage:
 *   node scripts/reconcile-outreach-campaigns.mjs             # report only
 *   node scripts/reconcile-outreach-campaigns.mjs --repair    # also reinsert
 *       recovered orphans into operator_outreach (listing_id NULL) so the
 *       email_already_contacted guard sees them again
 *   --name "email@x.com=Venue Name"   # stamp listing_name on a recovered row
 *
 * Repair requires migration 258 (nullable listing_id).
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

const ref = 'nyhkcmvhwbydsqsyvizs'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) { console.error('Set SUPABASE_DB_PASSWORD in .env.local'); process.exit(1) }

const REPAIR = process.argv.includes('--repair')
const nameMap = new Map()
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--name' && process.argv[i + 1]) {
    const [email, ...rest] = process.argv[i + 1].split('=')
    if (email && rest.length) nameMap.set(email.toLowerCase(), rest.join('='))
  }
}

const pool = new pg.Pool({
  // Session pooler (5432) on aws-1 — see scripts/run-migration.mjs for why.
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

// Which funnel table serves each campaign audience, and whether it has
// follow-up columns (council does not).
const AUDIENCE_TABLES = {
  operator: 'operator_outreach',
  press: 'press_outreach',
  trade: 'trade_outreach',
  industry: 'industry_outreach',
  council: 'council_outreach',
}

async function tableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return new Set(rows.map((r) => r.column_name))
}

async function main() {
  const client = await pool.connect()
  try {
    const cols = {}
    for (const t of Object.values(AUDIENCE_TABLES)) cols[t] = await tableColumns(client, t)

    // ── 1. Per-campaign reconciliation ────────────────────────
    const { rows: campaigns } = await client.query(`
      SELECT id, kind, audience, sent, failed, total, test_mode, sent_at, created_at
      FROM outreach_campaigns
      WHERE sent > 0 AND test_mode = false
      ORDER BY created_at
    `)

    const discrepancies = []
    for (const c of campaigns) {
      const table = AUDIENCE_TABLES[c.audience]
      if (!table || !cols[table]?.size) {
        discrepancies.push({ ...c, surviving: null, note: `unknown audience table (${c.audience})` })
        continue
      }
      let surviving
      if (c.kind === 'followup') {
        if (!cols[table].has('followup_campaign_id')) { discrepancies.push({ ...c, surviving: null, note: 'no followup columns' }); continue }
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE followup_campaign_id = $1`, [c.id])
        surviving = rows[0].n
      } else {
        // A first-touch send stamps send_status 'sent'; later webhooks may
        // overwrite it to bounced/complained/unsubscribed — all still sends.
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM ${table}
           WHERE campaign_id = $1 AND send_status IN ('sent','bounced','complained','unsubscribed')`, [c.id])
        surviving = rows[0].n
      }
      if (surviving !== c.sent) discrepancies.push({ ...c, surviving })
    }

    console.log(`Campaigns checked: ${campaigns.length}`)
    if (!discrepancies.length) {
      console.log('All campaign sent totals match surviving rows. ✔')
    } else {
      console.log(`\nDiscrepancies (${discrepancies.length}):`)
      for (const d of discrepancies) {
        console.log(`  ${d.id}  [${d.audience}/${d.kind}]  sent=${d.sent}  surviving=${d.surviving ?? '?'}  Δ=${d.surviving == null ? '?' : d.sent - d.surviving}${d.note ? `  (${d.note})` : ''}  sent_at=${d.sent_at?.toISOString?.() || d.sent_at}`)
      }
    }

    // ── 2. Forensic recovery from outreach_events ─────────────
    // Message ids in the webhook log that match no surviving funnel row.
    const notExists = []
    for (const [aud, table] of Object.entries(AUDIENCE_TABLES)) {
      if (!cols[table]?.size) continue
      const clauses = [`t.resend_message_id = e.message_id`]
      if (cols[table].has('followup_resend_message_id')) clauses.push(`t.followup_resend_message_id = e.message_id`)
      notExists.push(`NOT EXISTS (SELECT 1 FROM ${table} t WHERE ${clauses.join(' OR ')})`)
    }
    const { rows: orphans } = await client.query(`
      SELECT e.message_id, e.email,
        min(e.created_at) FILTER (WHERE e.event LIKE '%delivered%') AS delivered_at,
        min(e.created_at) FILTER (WHERE e.event LIKE '%opened%')    AS opened_at,
        count(*) FILTER (WHERE e.event LIKE '%opened%')::int        AS open_count,
        min(e.created_at) FILTER (WHERE e.event LIKE '%clicked%')   AS clicked_at,
        count(*) FILTER (WHERE e.event LIKE '%clicked%')::int       AS click_count,
        bool_or(e.event LIKE '%bounced%')                           AS bounced,
        bool_or(e.event LIKE '%complained%')                        AS complained,
        min(e.created_at)                                           AS first_event_at
      FROM outreach_events e
      WHERE e.message_id IS NOT NULL
      GROUP BY e.message_id, e.email
      HAVING ${notExists.join(' AND ')}
      ORDER BY min(e.created_at)
    `)

    console.log(`\nOrphaned sends recoverable from outreach_events: ${orphans.length}`)

    // Attribute each orphan to the operator campaign whose send moment
    // immediately precedes its first webhook event (events fire within
    // seconds/minutes of the send).
    const opCampaigns = campaigns.filter((c) => c.audience === 'operator' && c.kind !== 'followup' && c.sent_at)
    const attributed = []
    for (const o of orphans) {
      const before = opCampaigns.filter((c) => new Date(c.sent_at) <= new Date(o.first_event_at))
      const candidate = before.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0] || null
      const gapH = candidate ? (new Date(o.first_event_at) - new Date(candidate.sent_at)) / 36e5 : null
      const campaign = candidate && gapH <= 24 ? candidate : null

      // Context: is this email on the suppression list?
      const { rows: sup } = await client.query(
        `SELECT reason, detail, created_at FROM outreach_suppressions WHERE email = $1`, [o.email?.toLowerCase()])

      attributed.push({ ...o, campaign, suppression: sup[0] || null })
      console.log(`  ${o.email}  msg=${o.message_id}`)
      console.log(`    first event ${o.first_event_at.toISOString()}  delivered=${!!o.delivered_at} opened=${o.open_count} clicked=${o.click_count} bounced=${o.bounced} complained=${o.complained}`)
      console.log(`    campaign: ${campaign ? `${campaign.id} (gap ${gapH.toFixed(2)}h)` : `UNATTRIBUTED${candidate ? ` (nearest ${candidate.id}, gap ${gapH.toFixed(1)}h)` : ''}`}`)
      if (sup[0]) console.log(`    suppressed: ${sup[0].reason} — ${sup[0].detail || '(no detail)'} @ ${sup[0].created_at.toISOString()}`)
    }

    if (!REPAIR) {
      if (attributed.length) console.log('\nRun with --repair to reinsert recovered rows into operator_outreach.')
      return
    }

    // ── 3. Repair: reinsert recovered sends ───────────────────
    // Surgical: outreach_events logs EVERY Resend webhook on this account —
    // admin notifications, e2e probes, transactional email — so "no funnel
    // row" alone doesn't mean orphaned outreach. Only reinsert up to each
    // short campaign's deficit, closest-to-send-burst first, and never for
    // internal or test addresses.
    console.log('\nRepairing…')
    const deficit = new Map()
    for (const d of discrepancies) {
      if (d.audience === 'operator' && d.kind !== 'followup' && d.surviving != null && d.sent > d.surviving) {
        deficit.set(d.id, d.sent - d.surviving)
      }
    }
    attributed.sort((a, b) => {
      const ga = a.campaign ? new Date(a.first_event_at) - new Date(a.campaign.sent_at) : Infinity
      const gb = b.campaign ? new Date(b.first_event_at) - new Date(b.campaign.sent_at) : Infinity
      return ga - gb
    })
    for (const o of attributed) {
      if (!o.campaign) continue
      if (!deficit.get(o.campaign.id)) continue
      const domain = (o.email || '').toLowerCase().split('@')[1] || ''
      if (domain === 'australianatlas.com.au' || domain.endsWith('.invalid')) {
        console.log(`  skip ${o.email} — internal/test address`); continue
      }
      // Never duplicate: another surviving contacted row for this email is
      // already enough for the guard.
      const { rows: dupe } = await client.query(
        `SELECT id FROM operator_outreach
         WHERE lower(contact_email) = $1 AND resend_message_id = $2`,
        [o.email.toLowerCase(), o.message_id])
      if (dupe.length) { console.log(`  skip ${o.email} — row already exists (${dupe[0].id})`); continue }

      const sendStatus = o.complained ? 'complained' : o.bounced ? 'bounced' : 'sent'
      const listingName = nameMap.get(o.email.toLowerCase()) || null
      const notes = [
        `Reconstructed ${new Date().toISOString().slice(0, 10)} from outreach_events: the original row was destroyed by the pre-migration-258 ON DELETE CASCADE when its listing was deleted.`,
        o.suppression ? `Email is on the suppression list (${o.suppression.reason}${o.suppression.detail ? `: ${o.suppression.detail}` : ''}).` : null,
      ].filter(Boolean).join(' ')

      const { rows: ins } = await client.query(
        `INSERT INTO operator_outreach
           (listing_id, listing_name, listing_deleted_at, contact_email, status, notes,
            send_status, resend_message_id, campaign_id, sent_at, last_contacted_at,
            delivered_at, opened_at, open_count, clicked_at, click_count, email_source,
            created_at, updated_at)
         VALUES (NULL, $1, now(), $2, 'contacted', $3,
                 $4, $5, $6, $7, $7,
                 $8, $9, $10, $11, $12, 'manual', now(), now())
         RETURNING id`,
        [listingName, o.email, notes, sendStatus, o.message_id, o.campaign.id, o.campaign.sent_at,
         o.delivered_at, o.opened_at, o.open_count, o.clicked_at, o.click_count])
      deficit.set(o.campaign.id, deficit.get(o.campaign.id) - 1)
      console.log(`  reinserted ${o.email} → operator_outreach ${ins[0].id} (campaign ${o.campaign.id}, ${sendStatus}${listingName ? `, listing_name "${listingName}"` : ''})`)
    }

    // Re-check the previously short campaigns.
    console.log('\nPost-repair check:')
    for (const d of discrepancies.filter((x) => x.audience === 'operator' && x.kind !== 'followup')) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM operator_outreach
         WHERE campaign_id = $1 AND send_status IN ('sent','bounced','complained','unsubscribed')`, [d.id])
      console.log(`  ${d.id}  sent=${d.sent}  surviving=${rows[0].n}  ${rows[0].n === d.sent ? '✔' : 'STILL SHORT'}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1) })
