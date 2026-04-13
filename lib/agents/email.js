import { Resend } from 'resend'

const TO_EMAIL = 'matt@australianatlas.com.au'
const FROM_EMAIL = 'agents@australianatlas.com.au'

/**
 * Send an agent notification email via Resend.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */
export async function sendAgentEmail({ subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[agent-email] RESEND_API_KEY not set — skipping email')
    return
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject,
      html,
    })
    console.log(`[agent-email] Sent: ${subject}`)
  } catch (err) {
    console.error(`[agent-email] Failed to send: ${err.message}`)
  }
}
