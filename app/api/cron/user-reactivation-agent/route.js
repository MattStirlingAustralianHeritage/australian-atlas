import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

export const maxDuration = 300

const AGENT_NAME = 'user-reactivation'
const MAX_USERS_PER_RUN = 50
const DELAY_MS = 1000

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Call Claude Haiku for email generation.
 */
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}


// ─── GET handler ────────────────────────────────────────────────

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun(AGENT_NAME)

  const counts = { users_found: 0, emails_sent: 0, skipped: 0, errors: 0 }

  try {
    // ── 1. Find inactive users ───────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    // Get users who haven't signed in for 30+ days
    const { data: inactiveProfiles } = await sb
      .from('profiles')
      .select('id, email, display_name, home_state, last_sign_in_at, reactivation_email_sent_at')
      .lt('last_sign_in_at', thirtyDaysAgo)
      .not('email', 'is', null)
      .limit(200)

    if (!inactiveProfiles || inactiveProfiles.length === 0) {
      console.log('[user-reactivation] No inactive users found')
      await completeRun(runId, { status: 'success', summary: { ...counts, note: 'No inactive users' } })
      return NextResponse.json({ ok: true, ...counts })
    }

    // Filter: skip if reactivation sent within last 60 days
    const eligibleUsers = inactiveProfiles.filter(u => {
      if (u.reactivation_email_sent_at && u.reactivation_email_sent_at > sixtyDaysAgo) return false
      return true
    })

    counts.users_found = eligibleUsers.length
    console.log(`[user-reactivation] Found ${eligibleUsers.length} eligible users (of ${inactiveProfiles.length} inactive)`)

    // Get count of new listings since typical last visit
    const { count: newListingsCount } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('created_at', thirtyDaysAgo)

    let processed = 0

    for (const user of eligibleUsers) {
      if (processed >= MAX_USERS_PER_RUN) break

      try {
        // Check view history for this user (minimum engagement filter)
        const { data: recentViews } = await sb
          .from('listing_analytics')
          .select('listing_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)

        // Skip ghost accounts (< 3 page views)
        if (!recentViews || recentViews.length < 3) {
          counts.skipped++
          continue
        }

        // Find listings they viewed most recently
        const viewedIds = [...new Set(recentViews.map(v => v.listing_id))].slice(0, 5)
        const { data: viewedListings } = await sb
          .from('listings')
          .select(`name, vertical, region, state, ${LISTING_REGION_SELECT}`)
          .in('id', viewedIds)
          .limit(5)

        // Find recommended new listings (added since their last visit)
        const userState = user.home_state || (viewedListings?.[0]?.state)
        let recommendedListings = []

        if (userState) {
          const { data: newInState } = await sb
            .from('listings')
            .select(`name, slug, vertical, region, state, description, ${LISTING_REGION_SELECT}`)
            .eq('status', 'active')
            .eq('state', userState)
            .gte('created_at', user.last_sign_in_at)
            .order('quality_score', { ascending: false, nullsFirst: false })
            .limit(3)

          recommendedListings = newInState || []
        }

        // Fallback: get any high-quality new listings
        if (recommendedListings.length < 3) {
          const { data: newListings } = await sb
            .from('listings')
            .select(`name, slug, vertical, region, state, description, ${LISTING_REGION_SELECT}`)
            .eq('status', 'active')
            .gte('created_at', user.last_sign_in_at)
            .order('quality_score', { ascending: false, nullsFirst: false })
            .limit(3)

          recommendedListings = newListings || []
        }

        // Calculate days since last visit
        const daysSinceVisit = Math.floor((Date.now() - new Date(user.last_sign_in_at).getTime()) / (1000 * 60 * 60 * 24))

        // Count new listings in their state
        let stateNewCount = 0
        if (userState) {
          const { count } = await sb
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .eq('state', userState)
            .gte('created_at', user.last_sign_in_at)

          stateNewCount = count || 0
        }

        // ── Generate email via Claude ────────────────────────
        const recentlyViewed = (viewedListings || []).map(l => l.name).join(', ')
        const recommended = (recommendedListings || []).map(l => `${l.name} (${getListingRegion(l)?.name || l.state}): ${l.description?.substring(0, 80) || ''}`).join('; ')

        const emailBody = await callClaude(
          `Write a short, warm, non-corporate reactivation email for an Australian Atlas user who hasn't visited in ${daysSinceVisit} days. Voice: like a friend who thinks they'd genuinely like to know this. Do not say 'we miss you'. Do not use 'exciting' or 'amazing'. Lead with something specific and true: how many new listings in their area, or a specific listing they'd probably love based on what they've been saving. Keep it under 150 words. Include one clear CTA. User context: last visited ${daysSinceVisit} days ago, home state ${userState || 'unknown'}, recently viewed: ${recentlyViewed || 'various listings'}, ${stateNewCount} new listings in their state since last visit, recommended new listings: ${recommended || 'various new additions'}.`
        )

        // Generate personalised subject line
        let subject
        if (stateNewCount > 5) {
          subject = `${stateNewCount} new places in ${userState} since you last visited`
        } else if (recommendedListings.length > 0) {
          const firstRec = recommendedListings[0]
          subject = `${firstRec.name} — and ${(newListingsCount || 0)} other new places`
        } else {
          subject = `${newListingsCount || 'New'} places added since you last visited`
        }

        // ── Build and send email ─────────────────────────────
        const listingCards = recommendedListings.slice(0, 3).map(l => `
          <div style="padding:12px 16px;border-radius:6px;border:1px solid #e8e4da;margin-bottom:8px;background:#fff">
            <a href="https://www.australianatlas.com.au/place/${l.slug}" style="text-decoration:none">
              <p style="font-family:sans-serif;font-size:14px;font-weight:600;color:#2d2a24;margin:0 0 2px">${esc(l.name)}</p>
              <p style="font-family:sans-serif;font-size:12px;color:#8a7a5a;margin:0">${esc(getListingRegion(l)?.name || l.state || '')}</p>
            </a>
          </div>
        `).join('')

        const emailHtml = `
          <div style="max-width:600px;margin:0 auto;font-family:sans-serif">
            <div style="padding:24px 0">
              <p style="font-size:15px;line-height:1.7;color:#2d2a24;margin:0 0 20px;white-space:pre-wrap">${esc(emailBody)}</p>

              ${listingCards ? `
                <div style="margin:20px 0">
                  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin:0 0 8px;font-weight:600">You might like</p>
                  ${listingCards}
                </div>
              ` : ''}

              <div style="text-align:center;margin:24px 0">
                <a href="https://www.australianatlas.com.au/explore" style="display:inline-block;padding:10px 24px;background:#2d2a24;color:#d4a843;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px">
                  See what's new
                </a>
              </div>

              <p style="font-size:12px;color:#8a7a5a;margin:24px 0 0;text-align:center">
                Australian Atlas — a curated guide to independent Australian places
              </p>
            </div>
          </div>
        `

        // Send via Resend directly to user
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)

          await resend.emails.send({
            from: 'Australian Atlas <noreply@australianatlas.com.au>',
            to: user.email,
            subject,
            html: emailHtml,
          })

          // Mark as sent
          await sb.from('profiles').update({
            reactivation_email_sent_at: new Date().toISOString(),
          }).eq('id', user.id)

          counts.emails_sent++
          console.log(`[user-reactivation] Sent to ${user.email} — "${subject}"`)
        } else {
          counts.skipped++
        }

        processed++
        await delay(DELAY_MS)
      } catch (err) {
        counts.errors++
        console.error(`[user-reactivation] Error for user ${user.id}: ${err.message}`)
      }
    }

    // ── Admin summary email ──────────────────────────────────
    await sendAgentEmail({
      subject: `User Reactivation Agent — ${counts.emails_sent} users re-engaged`,
      html: buildAdminEmailHtml(counts, newListingsCount || 0),
    })

    await completeRun(runId, {
      status: counts.errors > 0 ? 'partial' : 'success',
      summary: counts,
    })

    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    console.error(`[user-reactivation] Fatal error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


function buildAdminEmailHtml(counts, newListingsCount) {
  return `
    <div style="background:#2d2a24;padding:24px 32px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#d4a843">
        User Reactivation Agent
      </h1>
      <p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:#8a7a5a">
        Monthly report — ${new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
      </p>
    </div>

    <div style="padding:24px 32px;background:#faf8f4;border:1px solid #e8e4da;border-top:none;border-radius:0 0 8px 8px">
      <div style="display:flex;gap:12px;margin-bottom:24px">
        <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:36px;color:#4a7c59">${counts.emails_sent}</div>
          <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Emails Sent</div>
        </div>
        <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:36px;color:#C49A3C">${counts.users_found}</div>
          <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Users Found</div>
        </div>
        <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;flex:1">
          <div style="font-family:Georgia,serif;font-size:36px;color:#2d2a24">${newListingsCount}</div>
          <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">New Listings (30d)</div>
        </div>
      </div>

      <p style="font-family:sans-serif;font-size:13px;color:#2d2a24;line-height:1.6;margin:0 0 16px">
        ${counts.emails_sent} personalised emails sent to users who hadn't visited in 30+ days. Each email was tailored to their viewing history and home state.
        ${counts.skipped > 0 ? `${counts.skipped} users skipped (low engagement or recently emailed).` : ''}
        ${counts.errors > 0 ? `${counts.errors} errors encountered.` : ''}
      </p>

      <p style="font-family:sans-serif;font-size:12px;color:#8a7a5a;margin:16px 0 0;text-align:center">
        No action required. Runs monthly, completely autonomous.
      </p>
    </div>
  `
}
