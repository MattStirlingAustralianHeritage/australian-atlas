import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/voice-consistency-agent
 *
 * Weekly voice consistency evaluator. Samples 30 published listings and
 * scores their descriptions against the Australian Atlas editorial voice
 * using Claude Haiku. Stores evaluations for admin review.
 *
 * Schedule: Wednesday 3am AEST = Tuesday 5pm UTC
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const AGENT_NAME = 'voice-consistency'
const SAMPLE_SIZE = 30
const FETCH_SIZE = 50
const DELAY_MS = 500

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun(AGENT_NAME)

  const counts = { evaluated: 0, high_priority: 0, medium_priority: 0, errors: 0 }
  const scores = []
  const lowScoring = []

  try {
    // ── 1. Fetch candidate listings ────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: candidates, error: fetchError } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, description')
      .eq('status', 'active')
      .not('description', 'is', null)
      .or(`last_voice_evaluated_at.is.null,last_voice_evaluated_at.lt.${thirtyDaysAgo}`)
      .order('id')
      .limit(FETCH_SIZE)

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`)
    }

    if (!candidates || candidates.length === 0) {
      await completeRun(runId, {
        summary: { evaluated: 0, note: 'No eligible listings found' },
      })
      return NextResponse.json({ success: true, evaluated: 0 })
    }

    // Filter to descriptions with > 20 words
    const eligible = candidates.filter(l => {
      const wordCount = l.description.trim().split(/\s+/).length
      return wordCount > 20
    })

    // Shuffle and pick SAMPLE_SIZE
    const shuffled = eligible.sort(() => Math.random() - 0.5)
    const sample = shuffled.slice(0, SAMPLE_SIZE)

    // ── 2. Evaluate each listing ───────────────────────────────
    for (const listing of sample) {
      try {
        const prompt = `You are the editorial standards agent for Australian Atlas. Evaluate this listing description against the Australian Atlas voice: place-based, specific, non-promotional, measured, non-triumphalist. Never generic. Never uses 'unique', 'passionate', 'journey', 'amazing'. Grounds the reader in what is specific about this place.\n\nScore 1-10 for voice consistency. Return JSON only: { "score": number, "issues": [string], "rewrite_priority": "high"|"medium"|"low", "suggested_rewrite": string }\n\nDescription: ${listing.description}\n\nListing: ${listing.name}, ${listing.vertical}, ${listing.suburb || ''} ${listing.state || ''}`

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
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          console.error(`[voice-consistency] Claude API error for "${listing.name}": ${res.status} ${errText}`)
          counts.errors++
          await delay(DELAY_MS)
          continue
        }

        const data = await res.json()
        const rawText = data.content?.[0]?.text || ''

        // Parse JSON — handle possible markdown fencing
        const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        let evaluation
        try {
          evaluation = JSON.parse(jsonStr)
        } catch {
          console.error(`[voice-consistency] JSON parse error for "${listing.name}":`, rawText.slice(0, 200))
          counts.errors++
          await delay(DELAY_MS)
          continue
        }

        const { score, issues, rewrite_priority, suggested_rewrite } = evaluation
        const now = new Date().toISOString()

        // ── 3. Store evaluation ──────────────────────────────────
        const { error: insertError } = await sb
          .from('description_evaluations')
          .insert({
            listing_id: listing.id,
            evaluated_at: now,
            score,
            issues: issues || [],
            rewrite_priority: rewrite_priority || 'low',
            suggested_rewrite: suggested_rewrite || null,
          })

        if (insertError) {
          console.error(`[voice-consistency] Insert error for "${listing.name}":`, insertError.message)
          counts.errors++
          await delay(DELAY_MS)
          continue
        }

        // ── 4. Update listing ────────────────────────────────────
        await sb
          .from('listings')
          .update({ last_voice_evaluated_at: now })
          .eq('id', listing.id)

        counts.evaluated++
        scores.push(score)

        if (rewrite_priority === 'high') counts.high_priority++
        if (rewrite_priority === 'medium') counts.medium_priority++

        // Track lowest scores for email
        lowScoring.push({
          name: listing.name,
          slug: listing.slug,
          vertical: listing.vertical,
          score,
          issues,
          suggested_rewrite,
        })
      } catch (err) {
        console.error(`[voice-consistency] Error evaluating "${listing.name}":`, err.message)
        counts.errors++
      }

      // Rate limit between Claude API calls
      await delay(DELAY_MS)
    }

    // ── 5. Calculate averages ────────────────────────────────
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0

    // ── 6. Get previous week's average ───────────────────────
    let prevAvg = null
    const { data: prevRun } = await sb
      .from('agent_runs')
      .select('summary')
      .eq('agent', AGENT_NAME)
      .eq('status', 'success')
      .neq('id', runId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    if (prevRun?.summary?.avg_score) {
      prevAvg = prevRun.summary.avg_score
    }

    // ── 7. Log run ───────────────────────────────────────────
    await completeRun(runId, {
      summary: {
        evaluated: counts.evaluated,
        avg_score: avgScore,
        high_priority: counts.high_priority,
        medium_priority: counts.medium_priority,
        errors: counts.errors,
      },
    })

    // ── 8. Send email ────────────────────────────────────────
    // Sort by score ascending, take top 5 lowest
    const bottom5 = lowScoring
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)

    let trendText
    if (prevAvg === null) {
      trendText = 'First run — no comparison'
    } else if (avgScore > prevAvg) {
      trendText = `Up from ${prevAvg}/10 last week`
    } else if (avgScore < prevAvg) {
      trendText = `Down from ${prevAvg}/10 last week`
    } else {
      trendText = `Unchanged from ${prevAvg}/10 last week`
    }

    await sendAgentEmail({
      subject: `Voice Consistency Agent — network score ${avgScore}/10`,
      html: buildEmailHtml({ avgScore, trendText, bottom5, counts }),
    })

    console.log(
      `[voice-consistency] Done — evaluated: ${counts.evaluated}, avg: ${avgScore}, high: ${counts.high_priority}, med: ${counts.medium_priority}, errors: ${counts.errors}`
    )

    return NextResponse.json({
      success: true,
      ...counts,
      avg_score: avgScore,
    })
  } catch (err) {
    console.error('[voice-consistency] Fatal error:', err.message)

    await completeRun(runId, {
      status: 'error',
      error: err.message,
      summary: counts,
    })

    return NextResponse.json(
      { error: 'Voice consistency agent failed', detail: err.message },
      { status: 500 }
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildEmailHtml({ avgScore, trendText, bottom5, counts }) {
  let listingsHtml = ''

  for (const item of bottom5) {
    const issuesHtml = (item.issues || [])
      .map(i => `<li style="margin: 2px 0; font-size: 12px; color: #666;">${esc(i)}</li>`)
      .join('')

    listingsHtml += `
      <div style="margin-bottom: 20px; padding: 16px; border: 1px solid #e5e0d5; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
          <a href="https://australianatlas.com.au/place/${esc(item.slug)}" style="font-size: 14px; font-weight: 600; color: #b8862b; text-decoration: none;">
            ${esc(item.name)}
          </a>
          <span style="font-size: 12px; font-weight: 600; color: ${item.score < 4 ? '#dc2626' : item.score <= 6 ? '#d97706' : '#16a34a'}; background: ${item.score < 4 ? '#fef2f2' : item.score <= 6 ? '#fffbeb' : '#f0fdf4'}; padding: 2px 10px; border-radius: 10px;">
            ${item.score}/10
          </span>
        </div>
        ${issuesHtml ? `<ul style="margin: 0 0 10px; padding-left: 20px;">${issuesHtml}</ul>` : ''}
        ${item.suggested_rewrite ? `
          <div style="padding: 10px 14px; background: #f8f6f0; border-left: 3px solid #b8862b; border-radius: 4px; font-size: 13px; line-height: 1.5; color: #1a1a1a;">
            ${esc(item.suggested_rewrite)}
          </div>
        ` : ''}
      </div>
    `
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #2d2a24; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #d4a843; margin: 0; font-size: 22px; font-weight: 600;">Voice Consistency</h1>
        <p style="color: #a89a7e; margin: 4px 0 0; font-size: 13px;">Australian Atlas &middot; ${new Date().toLocaleDateString('en-AU')}</p>
      </div>
      <div style="padding: 24px 32px; border: 1px solid #e5e0d5; border-top: none; border-radius: 0 0 8px 8px;">

        <!-- Score summary -->
        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: ${avgScore < 4 ? '#dc2626' : avgScore <= 6 ? '#d97706' : '#16a34a'};">${avgScore}</div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Network Score</div>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center;">
            <div style="font-size: 14px; font-weight: 500; color: #2d2a24; margin-top: 8px;">${esc(trendText)}</div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Trend</div>
          </div>
        </div>

        <!-- Counts -->
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Evaluated</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${counts.evaluated}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">High priority rewrites</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${counts.high_priority > 0 ? '#dc2626' : '#666'};">${counts.high_priority}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Medium priority rewrites</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${counts.medium_priority > 0 ? '#d97706' : '#666'};">${counts.medium_priority}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Errors</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${counts.errors > 0 ? '#f59e0b' : '#666'};">${counts.errors}</td>
          </tr>
        </table>

        <!-- Lowest scoring -->
        ${bottom5.length > 0 ? `
          <h2 style="font-size: 15px; font-weight: 600; color: #2d2a24; margin: 0 0 12px;">Lowest Scoring Descriptions</h2>
          ${listingsHtml}
        ` : ''}

        <!-- CTA -->
        <div style="margin-top: 20px;">
          <a href="https://australianatlas.com.au/admin/voice-review" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            Review in Admin
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e0d5; margin: 28px 0 16px;">
        <p style="color: #c4bfb4; font-size: 11px; margin: 0;">
          Sent by the Voice Consistency Agent &middot; Australian Atlas
        </p>
      </div>
    </div>
  `.trim()
}
