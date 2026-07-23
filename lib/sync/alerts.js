import { Resend } from 'resend'

const ALERT_EMAIL = 'hello@australianatlas.com.au'
const FROM_EMAIL = 'noreply@australianatlas.com.au'

/**
 * Send sync failure alert via Resend.
 * Triggers when a vertical returns zero results or throws an error.
 */
export async function sendSyncAlert(results) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[alert] RESEND_API_KEY not set — skipping alert email')
    return
  }

  const failures = results.filter(r => r.error || r.synced === 0)
  if (failures.length === 0) return

  const resend = new Resend(process.env.RESEND_API_KEY)

  const failureLines = failures.map(f =>
    `- **${f.vertical}**: ${f.error || 'zero rows returned'} (synced: ${f.synced}, deactivated: ${f.deactivated || 0})`
  ).join('\n')

  const successLines = results
    .filter(r => !r.error && r.synced > 0)
    .map(r => `- ${r.vertical}: ${r.synced} synced, ${r.deactivated || 0} deactivated`)
    .join('\n')

  await resend.emails.send({
    from: FROM_EMAIL,
    to: ALERT_EMAIL,
    subject: `[Australian Atlas] Sync alert: ${failures.length} vertical(s) failed`,
    html: `
      <h2>Sync Alert</h2>
      <p>The following verticals had issues during the latest sync run:</p>
      <pre>${failureLines}</pre>
      ${successLines ? `<h3>Successful syncs:</h3><pre>${successLines}</pre>` : ''}
      <p>Time: ${new Date().toISOString()}</p>
    `,
  })

  console.log(`[alert] Sent sync alert for ${failures.length} failure(s)`)
}

/**
 * Alert on cross-entity name renames blocked by the sync name guard
 * (lib/sync/nameGuard.js). A blocked rename means an upstream writer tried
 * to change an existing listing's name to a name belonging to a DIFFERENT
 * listing in the network — either an entity conflation upstream (the
 * Watts River / "Sweetwater Brewing" incident class) or, rarely, a genuine
 * rebrand an admin should apply manually. Never silent either way.
 *
 * @param {Array} blocked - blockedRenames entries from syncVertical results.
 */
export async function sendNameGuardAlert(blocked) {
  if (!blocked || blocked.length === 0) return
  if (!process.env.RESEND_API_KEY) {
    console.warn('[alert] RESEND_API_KEY not set — skipping name-guard alert email')
    return
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const lines = blocked.map((b) =>
    `- ${b.vertical}:${b.source_id} kept "${b.kept_name}" — source tried to rename it to "${b.attempted_name}", ` +
    `which matches: ${b.conflicts.map((c) => `${c.vertical}:${c.source_id} "${c.name}" (${c.suburb || c.state || '?'})`).join('; ')}`
  ).join('\n')

  await resend.emails.send({
    from: FROM_EMAIL,
    to: ALERT_EMAIL,
    subject: `[Australian Atlas] Name guard blocked ${blocked.length} cross-entity rename(s)`,
    html: `
      <h2>Sync Name Guard</h2>
      <p>The inbound sync refused to apply the following listing renames because the
      incoming name belongs to a different listing in the network. The listings kept
      their current names; every other field synced normally. Review each one — a
      genuine rebrand can be applied manually from the admin listing editor.</p>
      <pre>${lines}</pre>
      <p>Time: ${new Date().toISOString()}</p>
    `,
  })

  console.log(`[alert] Sent name-guard alert for ${blocked.length} blocked rename(s)`)
}
