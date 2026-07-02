/**
 * Atlas Trade — trade→operator enquiries.
 *
 * The connection layer: a trade buyer sends a structured enquiry (rates /
 * availability / famil / general) to a trade-ready venue. Atlas sends one
 * branded intro email to the venue's trade contact (dedicated trade contact
 * first, active-claim email as fallback), logs the enquiry against the trade
 * account, and gets out of the way — the reply goes DIRECTLY to the buyer
 * (reply-to), and any deal happens between the parties. Atlas never handles
 * rates or money.
 *
 * The enquiry email sets the industry expectation gently: trade buyers work
 * to ~24-hour response norms.
 */
import { Resend } from 'resend'
import { getTradeProfile } from './profile'

const FROM = 'Australian Atlas Trade <trade@australianatlas.com.au>'
const BCC = 'matt@australianatlas.com.au' // network operator visibility during beta

export const ENQUIRY_TYPES = [
  { value: 'rates', label: 'Trade rates' },
  { value: 'availability', label: 'Availability' },
  { value: 'famil', label: 'Famil visit' },
  { value: 'general', label: 'General' },
]

const TYPE_SUBJECT = {
  rates: 'Trade rate enquiry',
  availability: 'Availability enquiry',
  famil: 'Famil enquiry',
  general: 'Trade enquiry',
}

/**
 * Resolve the venue-side recipient for an enquiry: the dedicated trade
 * contact when set, otherwise the active claim's email. Returns
 * { email, name } or null when no channel exists.
 */
export async function resolveEnquiryRecipient(sb, listingId) {
  const profile = await getTradeProfile(sb, listingId)
  if (profile?.contact_email) {
    return { email: profile.contact_email, name: profile.contact_name || null }
  }
  const { data: claim } = await sb
    .from('listing_claims')
    .select('claimant_email')
    .eq('listing_id', listingId)
    .eq('status', 'active')
    .maybeSingle()
  if (claim?.claimant_email) return { email: claim.claimant_email, name: null }
  return null
}

/**
 * Create + send an enquiry. `input` is already validated by the route:
 *   { listing, account, enquiryType, message, groupSize, travelWindow }
 * where `listing` is { id, name, region, state } and `account` is the caller's
 * trade_accounts row. Returns { ok, enquiry } or { ok:false, error, status }.
 */
export async function createEnquiry(sb, { listing, account, enquiryType, message, groupSize, travelWindow }) {
  const recipient = await resolveEnquiryRecipient(sb, listing.id)
  if (!recipient) {
    return { ok: false, status: 409, error: 'This venue has no trade contact channel yet.' }
  }

  const { data: enquiry, error } = await sb
    .from('trade_enquiries')
    .insert({
      trade_account_id: account.id,
      listing_id: listing.id,
      enquiry_type: enquiryType,
      message,
      group_size: groupSize,
      travel_window: travelWindow,
      status: 'sent',
      venue_name: listing.name,
      sent_to: recipient.email,
    })
    .select('*')
    .single()
  if (error) {
    console.error('[trade/enquiry] insert failed:', error.message)
    return { ok: false, status: 500, error: 'Could not save the enquiry.' }
  }

  // Send the intro. A mail failure must not orphan the log silently — surface
  // it so the buyer knows to follow up another way.
  const replyTo = account.contact_email || null
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: recipient.email,
      bcc: BCC,
      ...(replyTo ? { replyTo } : {}),
      subject: `${TYPE_SUBJECT[enquiryType] || 'Trade enquiry'} — ${listing.name} · via Australian Atlas`,
      html: enquiryEmailHtml({ listing, account, enquiryType, message, groupSize, travelWindow, recipient }),
    })
  } catch (err) {
    console.error('[trade/enquiry] send failed:', err.message)
    await sb.from('trade_enquiries').update({ status: 'closed' }).eq('id', enquiry.id)
    return { ok: false, status: 502, error: 'The enquiry could not be delivered. Try again shortly.' }
  }

  return { ok: true, enquiry }
}

/** Branded, deliberately plain enquiry email (mirrors the Atlas auth-email look). */
function enquiryEmailHtml({ listing, account, enquiryType, message, groupSize, travelWindow, recipient }) {
  const esc = (s) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const typeLabel = (ENQUIRY_TYPES.find((t) => t.value === enquiryType) || {}).label || 'General'
  const detailRows = [
    ['Enquiry type', typeLabel],
    ['From', `${esc(account.org_name)}${account.account_type ? ` (${esc(account.account_type).replace(/_/g, ' ')})` : ''}`],
    account.contact_name ? ['Contact', esc(account.contact_name)] : null,
    account.contact_email ? ['Reply to', esc(account.contact_email)] : null,
    account.org_website ? ['Website', esc(account.org_website)] : null,
    groupSize ? ['Group size', esc(groupSize)] : null,
    travelWindow ? ['Travel window', esc(travelWindow)] : null,
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0; padding:0; background:#faf8f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:540px; max-width:540px; background:#ffffff; border:1px solid #e7e3db; border-radius:14px;">
        <tr><td style="padding:40px 44px;">
          <div style="font-family:Georgia,'Times New Roman',serif; font-size:21px; color:#1C1A17;">Australian Atlas <span style="color:#c49b3b;">· Trade</span></div>
          <div style="width:34px; height:1px; background:#d8d4cd; margin:16px 0;"></div>
          <p style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a362f; margin:0;">
            ${recipient.name ? `Hello ${esc(recipient.name)},` : 'Hello,'}
          </p>
          <p style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a362f; margin:14px 0 0;">
            A travel-trade buyer found <strong>${esc(listing.name)}</strong>${listing.region ? ` (${esc(listing.region)}${listing.state ? ', ' + esc(listing.state) : ''})` : ''} on Australian Atlas and would like to hear from you.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0; width:100%; background:#faf8f5; border:1px solid #eee9df; border-radius:10px;">
            ${detailRows
              .map(
                ([k, v]) => `<tr>
              <td style="padding:8px 14px 8px 16px; font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:12px; color:#8a8478; white-space:nowrap;">${k}</td>
              <td style="padding:8px 16px 8px 0; font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:13px; color:#1C1A17;">${v}</td>
            </tr>`
              )
              .join('')}
          </table>
          <p style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a362f; margin:20px 0 0; white-space:pre-wrap;">${esc(message)}</p>
          <div style="width:100%; height:1px; background:#eee9df; margin:24px 0;"></div>
          <p style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:12.5px; line-height:1.7; color:#8a8478; margin:0;">
            Reply to this email to answer directly — your reply goes to the buyer, not to Atlas.
            Trade buyers typically work to a 24-hour response window; even a quick acknowledgement keeps the door open.
            Any rates or terms you agree are strictly between you and the buyer — Atlas is not a party to the transaction and never handles rates.
          </p>
        </td></tr>
      </table>
      <p style="font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; color:#a39c8e; margin:18px 0 0;">Curated via Atlas · australianatlas.com.au</p>
    </td></tr>
  </table>
</body>
</html>`
}
