import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifyRemovalToken } from '@/lib/outreach/unsubscribeToken'
import { deleteListingEverywhere } from '@/lib/listings/deleteListing'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'

export const dynamic = 'force-dynamic'

// Public (no auth): operators click "Remove the listing" from an outreach
// email. The token is an HMAC over their email + the listing id, so only the
// person we emailed can remove only the listing we emailed them about.
//
// GET is side-effect free (mail scanners prefetch every link in an email) —
// it renders a confirmation page whose button POSTs back here. The POST:
//   1. writes an outreach_suppressions row FIRST — operator_outreach cascades
//      away with the listing, so the suppression is the only durable
//      do-not-contact record (learned the hard way: Gallery Cosmosis, 2026-07)
//   2. deletes the listing from its vertical source DB and the master DB
//      (master alone would be re-inserted by the nightly sync)
// Listings with a live claim are never deleted here — owners manage their
// listing from the dashboard, and migration 256's trigger blocks it anyway.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title)} — Australian Atlas</title></head>
<body style="margin:0;background:#faf8f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2d2a26;">
  <div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center;">
    <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8378;margin:0 0 16px;">Australian Atlas</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 12px;">${esc(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0 0;"><a href="https://australianatlas.com.au" style="font-size:14px;color:#8a6520;text-decoration:none;">Return to australianatlas.com.au &rarr;</a></p>
  </div>
</body></html>`
}

const html = (markup, status = 200) =>
  new NextResponse(markup, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

const P = (text) => `<p style="font-size:15px;line-height:1.6;color:#6b6459;margin:0 0 16px;">${text}</p>`

const invalidPage = () => html(
  page('Link not recognised', P('This removal link is invalid. If you\'d like your listing taken down, reply to any email from us and we\'ll remove it.')),
  400
)

const alreadyGonePage = () => html(
  page('Already removed', P('This listing is no longer on Australian Atlas. You won\'t hear from us again.'))
)

const claimedPage = () => html(
  page('This listing has an owner account', P('This listing has been claimed and is managed from its owner dashboard, so it can\'t be removed from this link. If that\'s you, sign in at australianatlas.com.au — or reply to any email from us and we\'ll help.'))
)

async function loadListing(sb, listingId) {
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, source_id')
    .eq('id', listingId)
    .maybeSingle()
  return data || null
}

async function hasLiveClaim(sb, listingId) {
  const { count } = await sb
    .from('listing_claims')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .in('status', LIVE_CLAIM_STATUSES)
  return (count || 0) > 0
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token')
  const data = verifyRemovalToken(token)
  if (!data) return invalidPage()

  const sb = getSupabaseAdmin()
  const listing = await loadListing(sb, data.listingId)
  if (!listing) return alreadyGonePage()
  if (await hasLiveClaim(sb, listing.id)) return claimedPage()

  return html(page(
    `Remove ${listing.name}?`,
    P(`This permanently takes <strong>${esc(listing.name)}</strong> off Australian Atlas and stops any further email from us. If you\'d rather we fixed something instead, just reply to the email — no need to remove the listing.`) +
    `<form method="POST" action="/api/outreach/remove" style="margin:0;">
      <input type="hidden" name="token" value="${esc(token)}" />
      <button type="submit" style="background:#2d2a26;color:#faf8f5;border:none;border-radius:4px;padding:12px 28px;font-size:15px;cursor:pointer;">Yes, remove this listing</button>
    </form>`
  ))
}

export async function POST(request) {
  let token = null
  try {
    const form = await request.formData()
    token = form.get('token')
  } catch {
    token = new URL(request.url).searchParams.get('token')
  }
  const data = verifyRemovalToken(token)
  if (!data) return invalidPage()

  const sb = getSupabaseAdmin()
  const email = data.email

  // The do-not-contact record comes first, whatever else happens below —
  // it must survive the listing delete (operator_outreach rows cascade away).
  const suppress = (detail) => sb.from('outreach_suppressions').upsert(
    { email, reason: 'listing_removed', listing_id: data.listingId, detail },
    { onConflict: 'email' }
  )

  const listing = await loadListing(sb, data.listingId)
  if (!listing) {
    try { await suppress('Removal link clicked after listing was already gone') } catch {}
    return alreadyGonePage()
  }
  if (await hasLiveClaim(sb, listing.id)) return claimedPage()

  try {
    await suppress(`Operator removed "${listing.name}" (${listing.vertical}) via outreach email link`)
    // Mirror the unsubscribe route: reflect the no-contact state on any other
    // funnel rows for this address so the admin UIs show it.
    await sb.from('operator_outreach')
      .update({ send_status: 'unsubscribed', updated_at: new Date().toISOString() })
      .ilike('contact_email', email)

    const { verticalDeleteError } = await deleteListingEverywhere(listing, sb)
    if (verticalDeleteError) {
      console.warn('[outreach/remove] Vertical delete warning:', verticalDeleteError)
    }
  } catch (err) {
    console.error('[outreach/remove] error:', err.message)
    return html(page(
      'Something went wrong',
      P(`We couldn\'t remove <strong>${esc(listing.name)}</strong> automatically. Reply to any email from us and we\'ll take it down by hand — you won\'t receive further outreach either way.`)
    ), 500)
  }

  if (listing.slug) {
    try { revalidatePath(`/place/${listing.slug}`) } catch {}
  }

  return html(page(
    'Listing removed',
    P(`<strong>${esc(listing.name)}</strong> has been taken off Australian Atlas, and <strong>${esc(email)}</strong> won\'t hear from us again. If you change your mind, you\'re always welcome back — just reply to any of our emails.`)
  ))
}
