// lib/press/notify.js
// Newsroom email composition + transport. Hand-written templates filled with
// real DB values — no model writes outbound copy (house discipline, and
// journalists smell generated pitches a mile off). Every email carries the
// compliant footer (who we are, why you got this, one-click unsubscribe,
// manage-preferences link) and RFC 8058 List-Unsubscribe headers.

import { Resend } from 'resend'
import { PRESS_FROM, PRESS_REPLY_TO, PRESS_CONTACT_EMAIL } from './config'
import { signPressUnsubscribeToken } from './tokens'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

function fmtDate(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

function fmtDateRange(start, end) {
  if (!end || end === start) return fmtDate(start)
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

export function pressUnsubscribeUrl(account) {
  const token = signPressUnsubscribeToken({ pressId: account.id, email: account.contact_email })
  return `${SITE}/api/press/unsubscribe?token=${encodeURIComponent(token)}`
}

// ── Shared chrome ──────────────────────────────────────────────────────────
// Playfair Display masthead — emails hardcode it (the authEmails convention);
// the site display token differs and can't be relied on in mail clients.

function shell({ inner, account }) {
  const unsubscribe = pressUnsubscribeUrl(account)
  return `
  <div style="font-family: 'DM Sans', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px 16px; color: #1C1A17;">
    <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6760; margin: 0 0 20px;">Australian Atlas · Newsroom</p>
    ${inner}
    <hr style="border: none; border-top: 1px solid #E7DCC6; margin: 28px 0 14px;" />
    <p style="color: #6B6760; font-size: 12px; line-height: 1.6; margin: 0;">
      You're receiving this because ${esc(account.name)} (${esc(account.outlet)}) follows regions in the
      <a href="${SITE}/newsroom" style="color: #4a7166;">Australian Atlas Newsroom</a> — our free press desk for independent Australia.
      Questions or story help: <a href="mailto:${PRESS_CONTACT_EMAIL}" style="color: #4a7166;">${PRESS_CONTACT_EMAIL}</a> (we reply the same business day).<br />
      <a href="${SITE}/newsroom/settings" style="color: #4a7166;">Notification preferences</a> ·
      <a href="${unsubscribe}" style="color: #4a7166;">Unsubscribe with one click</a>
    </p>
  </div>`
}

function eventCard(e) {
  const when = fmtDateRange(e.start_date, e.end_date)
  const where = [e.location_name, e.suburb].filter(Boolean).join(', ')
  const host = e.listing?.name && e.listing.name !== e.location_name ? ` · hosted by ${esc(e.listing.name)}` : ''
  const link = `${SITE}/events/${e.slug}`
  return `
    <div style="border: 1px solid #E7DCC6; border-radius: 10px; padding: 14px 16px; margin: 0 0 10px;">
      <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600;">
        <a href="${link}" style="color: #1C1A17; text-decoration: none;">${esc(e.name)}</a>
      </p>
      <p style="margin: 0 0 6px; font-size: 13px; color: #6B6760;">${esc(when)} — ${esc(where)}${host}${e.is_free ? ' · free' : ''}</p>
      ${e.description ? `<p style="margin: 0; font-size: 13px; color: #3D3A34; line-height: 1.55;">${esc(String(e.description).slice(0, 220))}${e.description.length > 220 ? '…' : ''}</p>` : ''}
    </div>`
}

// ── Instant alert ──────────────────────────────────────────────────────────
// One email per run per member, however many events (and fresh story leads)
// broke — never a stream of single-event pings.

function leadBlock(lead) {
  return `
    <div style="border-left: 3px solid #4a7166; padding: 2px 0 2px 14px; margin: 0 0 12px;">
      <p style="margin: 0 0 3px; font-size: 15px; font-weight: 600;">${esc(lead.title)}</p>
      <p style="margin: 0; font-size: 13px; color: #3D3A34; line-height: 1.55;">${esc(lead.summary)}</p>
      <p style="margin: 4px 0 0; font-size: 12px;"><a href="${SITE}/newsroom/leads" style="color: #4a7166;">Read in the newsroom →</a></p>
    </div>`
}

export function buildEventAlertEmail({ account, eventsByRegion, leads = [] }) {
  const regionNames = [...eventsByRegion.keys()]
  const total = [...eventsByRegion.values()].reduce((n, arr) => n + arr.length, 0)
  let subject
  if (total === 1) {
    subject = `New event in ${regionNames[0]}: ${[...eventsByRegion.values()][0][0].name}`
  } else if (total > 1) {
    subject = `${total} new events in ${regionNames.length === 1 ? regionNames[0] : `${regionNames.length} of your regions`}`
  } else {
    subject = `From the story desk: ${leads[0].title}`
  }

  let inner = ''
  if (total) {
    inner += `<h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 21px; margin: 0 0 18px;">Fresh on the events desk</h2>`
    for (const [regionName, events] of eventsByRegion) {
      inner += `<p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #C4973B; margin: 16px 0 8px;">${esc(regionName)}</p>`
      inner += events.map(eventCard).join('')
    }
    inner += `<p style="font-size: 13px; color: #6B6760; margin: 16px 0 0;">Details and ticket links are live on each event page. Need the organiser? Reply to this email and we'll connect you.</p>`
  }
  if (leads.length) {
    inner += `<h3 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 17px; margin: ${total ? 20 : 0}px 0 10px;">From the story desk</h3>`
    inner += leads.map(leadBlock).join('')
  }

  return { subject, html: shell({ inner, account }) }
}

// ── Daily / weekly digest ──────────────────────────────────────────────────

export function buildDigestEmail({ account, cadence, eventsByRegion, newListings, leads }) {
  const totalEvents = [...eventsByRegion.values()].reduce((n, arr) => n + arr.length, 0)
  const bits = []
  if (totalEvents) bits.push(`${totalEvents} new event${totalEvents === 1 ? '' : 's'}`)
  if (newListings.length) bits.push(`${newListings.length} new place${newListings.length === 1 ? '' : 's'}`)
  if (leads.length) bits.push(`${leads.length} story lead${leads.length === 1 ? '' : 's'}`)
  const subject = `Your ${cadence === 'weekly' ? 'week' : 'day'} in the regions you follow — ${bits.join(', ')}`

  let inner = `<h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 21px; margin: 0 0 6px;">${cadence === 'weekly' ? 'Your weekly region briefing' : 'Your daily region briefing'}</h2>
  <p style="font-size: 13px; color: #6B6760; margin: 0 0 18px;">What changed in the regions you follow.</p>`

  if (totalEvents) {
    inner += `<h3 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 17px; margin: 18px 0 10px;">New events</h3>`
    for (const [regionName, events] of eventsByRegion) {
      inner += `<p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #C4973B; margin: 12px 0 8px;">${esc(regionName)}</p>`
      inner += events.map(eventCard).join('')
    }
  }

  if (leads.length) {
    inner += `<h3 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 17px; margin: 20px 0 10px;">From the story desk</h3>`
    inner += leads.map(leadBlock).join('')
  }

  if (newListings.length) {
    inner += `<h3 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 17px; margin: 20px 0 10px;">New places listed</h3><ul style="margin: 0; padding: 0 0 0 18px; font-size: 13px; color: #3D3A34; line-height: 1.8;">`
    for (const l of newListings.slice(0, 12)) {
      inner += `<li><a href="${SITE}/place/${esc(l.slug)}" style="color: #1C1A17;">${esc(l.name)}</a>${l.suburb ? ` — ${esc(l.suburb)}` : ''}</li>`
    }
    if (newListings.length > 12) inner += `<li>…and ${newListings.length - 12} more in the newsroom</li>`
    inner += `</ul>`
  }

  return { subject, html: shell({ inner, account }) }
}

// ── Transport ──────────────────────────────────────────────────────────────
// Graceful no-op (returns false) when RESEND_API_KEY is missing; throws on a
// real send failure so callers can record it. List-Unsubscribe headers on
// every send.

export async function sendPressEmail({ account, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[press-notify] RESEND_API_KEY not set — skipping email to ${account.contact_email}`)
    return false
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const unsubscribe = pressUnsubscribeUrl(account)
  const { error } = await resend.emails.send({
    from: PRESS_FROM,
    replyTo: PRESS_REPLY_TO,
    to: account.contact_email,
    subject,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) throw new Error(error.message || 'Resend send failed')
  return true
}
