import { getSupabaseAdmin } from '../supabase/clients.js'
import { startRun, completeRun } from './logRun.js'
import { Resend } from 'resend'

/**
 * Operator Amplification Agent
 *
 * Generates and sends a personalised share kit to operators after they
 * claim their listing. Called from the claim approval flow.
 *
 * Guard: checks share_kit_sent_at to prevent duplicate sends.
 *
 * @param {string} listingId - UUID of the newly claimed listing
 * @param {string} operatorEmail - The claimant's email address
 * @param {string} operatorName - The claimant's name
 */
export async function sendShareKit(listingId, operatorEmail, operatorName) {
  if (!listingId || !operatorEmail) {
    console.log('[operator-amplification] Missing listingId or operatorEmail — skipping')
    return
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('operator-amplification')

  try {
    // ── 1. Fetch listing details ────────────────────────────
    const { data: listing, error: listingError } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, suburb, state, description, hero_image_url, share_kit_sent_at')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      console.log('[operator-amplification] Listing not found:', listingId)
      await completeRun(runId, { status: 'error', error: 'Listing not found' })
      return
    }

    // Guard: prevent duplicate sends
    if (listing.share_kit_sent_at) {
      console.log(`[operator-amplification] Share kit already sent for "${listing.name}" — skipping`)
      await completeRun(runId, { status: 'success', summary: { skipped: true, reason: 'already_sent' } })
      return
    }

    // ── 2. Build listing URL ────────────────────────────────
    const listingUrl = `https://www.australianatlas.com.au/place/${listing.slug}`

    const VERT_NAMES = {
      sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
      fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
      corner: 'Corner', found: 'Found', table: 'Table',
    }
    const verticalName = VERT_NAMES[listing.vertical] || listing.vertical

    // ── 3. Call Claude API for personalised share kit ────────
    const listingData = JSON.stringify({
      name: listing.name,
      vertical: verticalName,
      region: listing.region,
      suburb: listing.suburb,
      state: listing.state,
      description: listing.description?.substring(0, 300),
      url: listingUrl,
    })

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are writing on behalf of Australian Atlas, a curated guide to independent Australian places. An operator has just claimed their listing. Write them a friendly, warm, non-corporate email that: (a) congratulates them briefly — one sentence, not gushing, (b) gives them three social media caption variations they can use to tell their audience about being listed, each taking a different angle — one about the place, one about independence, one personal/story-driven, all under 200 characters, no hashtags, no exclamation marks, (c) gives them a short paragraph they can drop into their email newsletter, (d) reminds them their listing URL is ${listingUrl}. Voice: like a colleague who respects their time. Listing details: ${listingData}. Return as JSON: { "greeting": string, "social_captions": [{ "angle": string, "text": string }], "newsletter_paragraph": string }. Return JSON only.`,
        }],
      }),
    })

    let shareKit = null

    if (claudeRes.ok) {
      const claudeData = await claudeRes.json()
      const rawText = claudeData.content?.[0]?.text || ''
      try {
        let cleaned = rawText.trim()
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fenceMatch) cleaned = fenceMatch[1].trim()
        shareKit = JSON.parse(cleaned)
      } catch {
        console.warn('[operator-amplification] Could not parse Claude response — using fallback')
      }
    }

    // ── 4. Build and send email ──────────────────────────────
    const greeting = shareKit?.greeting || `Congratulations on claiming ${listing.name} on Australian Atlas.`
    const captions = shareKit?.social_captions || [
      { angle: 'The place', text: `We're now listed on @AustralianAtlas — find us at ${listingUrl}` },
      { angle: 'Independence', text: `Proud to be part of Australian Atlas's guide to independent places` },
      { angle: 'Personal', text: `Our story is now part of the Australian Atlas — have a look` },
    ]
    const newsletterParagraph = shareKit?.newsletter_paragraph ||
      `We're now listed on Australian Atlas, a curated guide to independent Australian places. You can find our page at ${listingUrl}.`

    const captionRows = captions.map((c, i) => `
      <div style="padding:12px 16px;border-radius:6px;background:#f8f6f0;border:1px solid #e8e4da;margin-bottom:8px">
        <p style="font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#C49A3C;margin:0 0 4px;font-weight:600">
          ${esc(c.angle || `Caption ${i + 1}`)}
        </p>
        <p style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#2d2a24;margin:0">
          ${esc(c.text)}
        </p>
      </div>
    `).join('')

    const emailHtml = `
      <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
        <div style="padding:24px 0">
          <p style="font-size:15px;line-height:1.6;color:#2d2a24;margin:0 0 20px">
            Hi ${esc(operatorName || 'there')},
          </p>
          <p style="font-size:15px;line-height:1.6;color:#2d2a24;margin:0 0 20px">
            ${esc(greeting)}
          </p>

          <p style="font-size:15px;line-height:1.6;color:#2d2a24;margin:0 0 8px;font-weight:600">
            Your listing
          </p>
          <div style="padding:16px 20px;border-radius:8px;background:#2d2a24;margin-bottom:24px">
            <p style="font-family:Georgia,serif;font-size:18px;color:#d4a843;margin:0 0 4px">${esc(listing.name)}</p>
            <p style="font-size:12px;color:#8a7a5a;margin:0 0 8px">${esc(verticalName)} Atlas · ${esc(listing.region || listing.state || '')}</p>
            <a href="${listingUrl}" style="font-size:14px;color:#d4a843;text-decoration:none">${listingUrl}</a>
          </div>

          <p style="font-size:15px;line-height:1.6;color:#2d2a24;margin:0 0 8px;font-weight:600">
            Share it — here are three captions ready to go
          </p>
          ${captionRows}

          <p style="font-size:15px;line-height:1.6;color:#2d2a24;margin:20px 0 8px;font-weight:600">
            For your newsletter
          </p>
          <div style="padding:12px 16px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;margin-bottom:24px">
            <p style="font-size:14px;line-height:1.6;color:#2d2a24;margin:0">
              ${esc(newsletterParagraph)}
            </p>
          </div>

          <div style="text-align:center;margin:24px 0">
            <a href="https://www.australianatlas.com.au/dashboard" style="display:inline-block;padding:10px 24px;background:#2d2a24;color:#d4a843;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px">
              Your operator dashboard
            </a>
          </div>

          <p style="font-size:13px;color:#8a7a5a;margin:24px 0 0;line-height:1.6">
            Cheers,<br/>Australian Atlas
          </p>
        </div>
      </div>
    `

    if (!process.env.RESEND_API_KEY) {
      console.warn('[operator-amplification] RESEND_API_KEY not set — skipping email')
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: operatorEmail,
        subject: `Your ${verticalName} Atlas listing is live — here's how to share it`,
        html: emailHtml,
      })
      console.log(`[operator-amplification] Share kit sent to ${operatorEmail} for "${listing.name}"`)
    }

    // ── 5. Mark as sent ──────────────────────────────────────
    await sb.from('listings').update({
      share_kit_sent_at: new Date().toISOString(),
    }).eq('id', listingId)

    await completeRun(runId, {
      status: 'success',
      summary: { listing_name: listing.name, operator_email: operatorEmail },
    })
  } catch (err) {
    console.error(`[operator-amplification] Error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message })
  }
}


function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
