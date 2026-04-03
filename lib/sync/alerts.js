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
