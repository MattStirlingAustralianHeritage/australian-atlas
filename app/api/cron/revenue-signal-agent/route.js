import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 120

const AGENT_NAME = 'revenue-signal'

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  collection: 'Collection',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

export async function GET(request) {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()
  const errors = []

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoUnix = Math.floor(sevenDaysAgo.getTime() / 1000)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysFromNowUnix = Math.floor(thirtyDaysFromNow.getTime() / 1000)

  // ── 1. Stripe data ────────────────────────────────────────
  let stripeConfigured = true
  let newSubscriptions = []
  let allActiveSubscriptions = []
  let cancelledSubscriptions = []
  let pastDueSubscriptions = []

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      stripeConfigured = false
      console.log('[revenue-signal] STRIPE_SECRET_KEY not set — skipping Stripe queries')
    } else {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

      // New subscriptions this week
      newSubscriptions = await fetchAllSubscriptions(stripe, {
        created: { gte: sevenDaysAgoUnix },
        status: 'active',
      })

      // All active subscriptions
      allActiveSubscriptions = await fetchAllSubscriptions(stripe, {
        status: 'active',
      })

      // Cancelled this week
      cancelledSubscriptions = await fetchAllSubscriptions(stripe, {
        created: { gte: sevenDaysAgoUnix },
        status: 'canceled',
      })

      // Past due (failed renewals)
      pastDueSubscriptions = await fetchAllSubscriptions(stripe, {
        status: 'past_due',
      })
    }
  } catch (err) {
    console.error('[revenue-signal] Stripe error:', err.message)
    errors.push(`Stripe: ${err.message}`)
    stripeConfigured = false
  }

  // Calculate Stripe metrics
  const newCount = newSubscriptions.length
  const newARR = sumARR(newSubscriptions)
  const totalActive = allActiveSubscriptions.length
  const totalARR = sumARR(allActiveSubscriptions)
  const totalMRR = totalARR / 12
  const cancelledCount = cancelledSubscriptions.length
  const cancelledARR = sumARR(cancelledSubscriptions)
  const pastDueCount = pastDueSubscriptions.length

  // Expiring within 30 days (current_period_end within 30 days, no auto-renew indicator)
  const expiringCount = allActiveSubscriptions.filter(sub => {
    return sub.current_period_end <= thirtyDaysFromNowUnix
  }).length

  // ── 2. Supabase data ──────────────────────────────────────
  let newClaimsCount = 0
  let pendingClaimsCount = 0
  let unclaimedHighQualityCount = 0
  let topUnclaimed = []
  let previousSnapshot = null

  // New claims this week
  try {
    const { count, error } = await sb
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString())

    if (error) throw error
    newClaimsCount = count || 0
  } catch (err) {
    console.error('[revenue-signal] Claims count error:', err.message)
    errors.push(`New claims: ${err.message}`)
  }

  // Claims awaiting payment
  try {
    const { count, error } = await sb
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) throw error
    pendingClaimsCount = count || 0
  } catch (err) {
    console.error('[revenue-signal] Pending claims error:', err.message)
    errors.push(`Pending claims: ${err.message}`)
  }

  // Unclaimed high-quality listings
  try {
    const { count, error } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('quality_score', 75)
      .or('is_claimed.is.null,is_claimed.eq.false')

    if (error) throw error
    unclaimedHighQualityCount = count || 0

    // Top 5 by quality score
    const { data: topData, error: topError } = await sb
      .from('listings')
      .select('name, slug, vertical, region, state, quality_score')
      .eq('status', 'active')
      .gte('quality_score', 75)
      .or('is_claimed.is.null,is_claimed.eq.false')
      .order('quality_score', { ascending: false })
      .limit(5)

    if (topError) throw topError
    topUnclaimed = topData || []
  } catch (err) {
    console.error('[revenue-signal] Unclaimed listings error:', err.message)
    errors.push(`Unclaimed listings: ${err.message}`)
  }

  // Previous snapshot for comparison
  try {
    const { data, error } = await sb
      .from('revenue_snapshots')
      .select('id, snapshot_date, active_subscribers, arr, new_this_week, churned_this_week, expiring_30_days, raw_data, created_at')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    previousSnapshot = data || null
  } catch (err) {
    console.error('[revenue-signal] Previous snapshot error:', err.message)
    errors.push(`Previous snapshot: ${err.message}`)
  }

  // ── 3. Store snapshot ─────────────────────────────────────
  const signals = {
    stripe: {
      configured: stripeConfigured,
      newSubscriptions: newCount,
      newARR,
      totalActive,
      totalARR,
      totalMRR,
      cancelledThisWeek: cancelledCount,
      cancelledARR,
      pastDue: pastDueCount,
      expiring30Days: expiringCount,
    },
    claims: {
      newThisWeek: newClaimsCount,
      pendingPayment: pendingClaimsCount,
    },
    unclaimed: {
      highQualityCount: unclaimedHighQualityCount,
      top5: topUnclaimed,
    },
    previousSnapshot: previousSnapshot
      ? {
          date: previousSnapshot.snapshot_date,
          subscribers: previousSnapshot.active_subscribers,
          arr: previousSnapshot.arr,
        }
      : null,
  }

  try {
    const { error } = await sb
      .from('revenue_snapshots')
      .insert({
        snapshot_date: now.toISOString().split('T')[0],
        active_subscribers: totalActive,
        arr: totalARR,
        new_this_week: newCount,
        churned_this_week: cancelledCount,
        expiring_30_days: expiringCount,
        raw_data: signals,
      })

    if (error) throw error
  } catch (err) {
    console.error('[revenue-signal] Snapshot insert error:', err.message)
    errors.push(`Snapshot insert: ${err.message}`)
  }

  // ── 4. Claude summary ────────────────────────────────────
  let claudeSummary = ''
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      claudeSummary = 'Claude summary skipped — ANTHROPIC_API_KEY not set.'
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `You are the revenue intelligence layer for Australian Atlas. Based on the weekly revenue signals below, write a 3-sentence summary for Matt, the founder. Voice: direct, honest, no spin. Highlight the most important number, flag any concern, suggest one specific action if the data calls for it. Data: ${JSON.stringify(signals)}`,
          }],
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Claude API ${res.status}: ${body}`)
      }

      const result = await res.json()
      claudeSummary = result.content?.[0]?.text || 'No summary generated.'
    }
  } catch (err) {
    console.error('[revenue-signal] Claude summary error:', err.message)
    errors.push(`Claude summary: ${err.message}`)
    claudeSummary = 'Summary unavailable — Claude API error.'
  }

  // ── 5. Send email ─────────────────────────────────────────
  const weekEnd = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const subject = `Revenue Signal \u2014 week ending ${weekEnd} \u2014 ${totalActive} active subscribers / $${totalARR.toFixed(0)} ARR`

  const top3Names = topUnclaimed.slice(0, 3).map(l => l.name).join(', ') || 'None found'

  const html = buildEmailHtml({
    signals,
    claudeSummary,
    errors,
    weekEnd,
    stripeConfigured,
    previousSnapshot,
    top3Names,
    topUnclaimed,
  })

  await sendAgentEmail({ subject, html })

  // ── 6. Complete run ───────────────────────────────────────
  const summary = {
    activeSubscribers: totalActive,
    arr: totalARR,
    newThisWeek: newCount,
    churned: cancelledCount,
    pastDue: pastDueCount,
    newClaims: newClaimsCount,
    pendingClaims: pendingClaimsCount,
    unclaimedHighQuality: unclaimedHighQualityCount,
    stripeConfigured,
    errors: errors.length,
  }

  await completeRun(runId, {
    status: errors.length > 0 ? 'partial' : 'success',
    summary,
    error: errors.length > 0 ? errors.join('; ') : null,
  })

  return NextResponse.json({ success: true, summary })
}

// ─── Stripe helpers ──────────────────────────────────────────

async function fetchAllSubscriptions(stripe, params) {
  const all = []
  let hasMore = true
  let startingAfter = undefined

  while (hasMore) {
    const response = await stripe.subscriptions.list({
      ...params,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    all.push(...response.data)
    hasMore = response.has_more

    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  return all
}

function sumARR(subscriptions) {
  let total = 0
  for (const sub of subscriptions) {
    const item = sub.items?.data?.[0]
    if (!item) continue
    const amount = item.plan?.amount || 0
    const interval = item.plan?.interval || 'month'

    if (interval === 'month') {
      total += (amount * 12) / 100
    } else if (interval === 'year') {
      total += amount / 100
    }
  }
  return total
}

// ─── Email builder ──────────────────────────────────────────

function buildEmailHtml({ signals, claudeSummary, errors, weekEnd, stripeConfigured, previousSnapshot, top3Names, topUnclaimed }) {
  const s = signals.stripe
  const c = signals.claims

  // Calculate deltas from previous snapshot
  let subscriberDelta = ''
  let arrDelta = ''
  if (previousSnapshot) {
    const subDiff = s.totalActive - (previousSnapshot.active_subscribers || 0)
    const arrDiff = s.totalARR - (Number(previousSnapshot.arr) || 0)
    subscriberDelta = subDiff >= 0 ? `+${subDiff}` : `${subDiff}`
    arrDelta = arrDiff >= 0 ? `+$${arrDiff.toFixed(0)}` : `-$${Math.abs(arrDiff).toFixed(0)}`
  }

  const sections = []

  // Header
  sections.push(`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #2d2a24; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: #d4a843; margin: 0; font-size: 22px; font-weight: 600;">Revenue Signal</h1>
      <p style="color: #a89a7e; margin: 4px 0 0; font-size: 13px;">Australian Atlas &middot; Week ending ${esc(weekEnd)}</p>
    </div>
    <div style="padding: 24px 32px; border: 1px solid #e5e0d5; border-top: none; border-radius: 0 0 8px 8px;">
  `)

  if (!stripeConfigured) {
    sections.push(`
      <div style="margin-bottom: 20px; padding: 12px 16px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 500;">Stripe not configured</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #92400e;">STRIPE_SECRET_KEY is not set. Subscription metrics are unavailable. Supabase data shown below.</p>
      </div>
    `)
  }

  // ── This Week ──────────────────────────────────────────
  sections.push(`
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px; border-bottom: 1px solid #e5e0d5; padding-bottom: 8px;">This Week</h2>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #166534;">${s.newSubscriptions}</div>
          <div style="font-size: 11px; color: #166534; margin-top: 4px;">New subscriptions</div>
          ${s.newARR > 0 ? `<div style="font-size: 11px; color: #15803d; margin-top: 2px;">+$${s.newARR.toFixed(0)} ARR</div>` : ''}
        </div>
        <div style="background: ${s.cancelledThisWeek > 0 ? '#fef2f2' : '#f9fafb'}; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: ${s.cancelledThisWeek > 0 ? '#991b1b' : '#6b7280'};">${s.cancelledThisWeek}</div>
          <div style="font-size: 11px; color: ${s.cancelledThisWeek > 0 ? '#991b1b' : '#6b7280'}; margin-top: 4px;">Cancelled</div>
          ${s.cancelledARR > 0 ? `<div style="font-size: 11px; color: #991b1b; margin-top: 2px;">-$${s.cancelledARR.toFixed(0)} ARR</div>` : ''}
        </div>
        <div style="background: ${s.pastDue > 0 ? '#fffbeb' : '#f9fafb'}; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: ${s.pastDue > 0 ? '#92400e' : '#6b7280'};">${s.pastDue}</div>
          <div style="font-size: 11px; color: ${s.pastDue > 0 ? '#92400e' : '#6b7280'}; margin-top: 4px;">Past due</div>
        </div>
      </div>
    </div>
  `)

  // ── Pipeline ───────────────────────────────────────────
  sections.push(`
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px; border-bottom: 1px solid #e5e0d5; padding-bottom: 8px;">Pipeline</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; font-size: 13px; color: #2d2a24;">Expiring within 30 days</td>
            <td style="padding: 8px 0; font-size: 13px; text-align: right; font-weight: 600; color: ${s.expiring30Days > 0 ? '#92400e' : '#2d2a24'};">${s.expiring30Days}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; font-size: 13px; color: #2d2a24;">New claims this week</td>
            <td style="padding: 8px 0; font-size: 13px; text-align: right; font-weight: 600; color: #2d2a24;">${c.newThisWeek}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #2d2a24;">Claims awaiting payment</td>
            <td style="padding: 8px 0; font-size: 13px; text-align: right; font-weight: 600; color: ${c.pendingPayment > 0 ? '#b8862b' : '#2d2a24'};">${c.pendingPayment}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `)

  // ── Totals ─────────────────────────────────────────────
  sections.push(`
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px; border-bottom: 1px solid #e5e0d5; padding-bottom: 8px;">Totals</h2>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 32px; font-weight: 700; color: #2d2a24;">${s.totalActive}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Active subscribers</div>
          ${subscriberDelta ? `<div style="font-size: 11px; color: ${subscriberDelta.startsWith('+') ? '#166534' : '#991b1b'}; margin-top: 2px;">${esc(subscriberDelta)} vs last week</div>` : ''}
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 32px; font-weight: 700; color: #2d2a24;">$${s.totalARR.toFixed(0)}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">ARR</div>
          ${arrDelta ? `<div style="font-size: 11px; color: ${arrDelta.startsWith('+') ? '#166534' : '#991b1b'}; margin-top: 2px;">${esc(arrDelta)} vs last week</div>` : ''}
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center;">
          <div style="font-size: 32px; font-weight: 700; color: #2d2a24;">$${s.totalMRR.toFixed(0)}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">MRR</div>
        </div>
      </div>
    </div>
  `)

  // ── Claude's Summary ───────────────────────────────────
  sections.push(`
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px; border-bottom: 1px solid #e5e0d5; padding-bottom: 8px;">Claude&rsquo;s Take</h2>
      <div style="background: #faf7f2; border-left: 3px solid #d4a843; border-radius: 4px; padding: 16px;">
        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #2d2a24; font-style: italic;">${esc(claudeSummary)}</p>
      </div>
    </div>
  `)

  // ── Unclaimed high-value listings ──────────────────────
  if (topUnclaimed.length > 0) {
    let rows = ''
    for (const l of topUnclaimed) {
      rows += `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 6px 0; font-size: 13px;">
            <a href="https://australianatlas.com.au/place/${esc(l.slug)}" style="color: #b8862b; text-decoration: none;">${esc(l.name)}</a>
          </td>
          <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(VERTICAL_LABELS[l.vertical] || l.vertical)}</td>
          <td style="padding: 6px 8px; font-size: 12px; color: #6b7280;">${esc(l.region || '')}${l.state ? `, ${esc(l.state)}` : ''}</td>
          <td style="padding: 6px 0; font-size: 12px; text-align: right;">
            <span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 10px; font-weight: 500;">${l.quality_score}</span>
          </td>
        </tr>
      `
    }

    sections.push(`
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px; border-bottom: 1px solid #e5e0d5; padding-bottom: 8px;">Highest-Value Unclaimed Listings</h2>
        <p style="font-size: 12px; color: #9ca3af; margin: 0 0 8px;">${signals.unclaimed.highQualityCount} unclaimed listings with quality score &ge; 75</p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e5e0d5;">
              <th style="padding: 6px 0; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Name</th>
              <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Vertical</th>
              <th style="padding: 6px 8px; text-align: left; font-size: 11px; color: #9ca3af; font-weight: 500;">Region</th>
              <th style="padding: 6px 0; text-align: right; font-size: 11px; color: #9ca3af; font-weight: 500;">Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `)
  }

  sections.push(`
    <p style="font-size: 12px; color: #6b7280; margin: 16px 0 0;">
      Highest-value unclaimed listings this week: ${esc(top3Names)}
    </p>
  `)

  // ── Errors ─────────────────────────────────────────────
  if (errors.length > 0) {
    sections.push(`
      <div style="margin-top: 16px; padding: 12px 16px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b; font-size: 13px;">Errors (${errors.length})</p>
        <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 12px;">
          ${errors.map(e => `<li>${esc(e)}</li>`).join('')}
        </ul>
      </div>
    `)
  }

  // ── Footer ─────────────────────────────────────────────
  sections.push(`
      <hr style="border: none; border-top: 1px solid #e5e0d5; margin: 28px 0 16px;">
      <p style="color: #c4bfb4; font-size: 11px; margin: 0;">
        Sent by the Revenue Signal Agent &middot; Australian Atlas
      </p>
    </div></div>
  `)

  return sections.join('')
}

// ─── Utilities ──────────────────────────────────────────────

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
