import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

export const maxDuration = 300

const AGENT_NAME = 'content-recycling'
const DELAY_MS = 1500

/**
 * HARD RULE: This agent NEVER writes to the body, content, or description
 * field of any article. It may only write to:
 * - meta_description (if currently null)
 * - recycled_at (timestamp)
 * Any violation of this rule is a critical bug.
 */
const ALLOWED_ARTICLE_FIELDS = ['meta_description', 'recycled_at']

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractJSON(text) {
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  return cleaned
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Call Claude API with a prompt and return text content.
 */
async function callClaude(prompt, maxTokens = 2000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
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

  const counts = { articles_found: 0, recycled: 0, meta_updated: 0, errors: 0 }
  const recycledArticles = []

  try {
    // ── Fetch articles needing recycling ──────────────────────
    // Recent 7 days (primary) + any missed in last 90 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const { data: articles } = await sb
      .from('articles')
      .select('id, title, slug, body, published_at, meta_description')
      .eq('status', 'published')
      .is('recycled_at', null)
      .gte('published_at', ninetyDaysAgo)
      .not('body', 'is', null)
      .order('published_at', { ascending: false })
      .limit(10)

    if (!articles || articles.length === 0) {
      console.log('[content-recycling] No articles need recycling')
      await completeRun(runId, { status: 'success', summary: { ...counts, note: 'No articles to recycle' } })
      return NextResponse.json({ ok: true, ...counts })
    }

    counts.articles_found = articles.length
    console.log(`[content-recycling] Found ${articles.length} articles to recycle`)

    for (const article of articles) {
      try {
        const bodyText = article.body || ''
        const bodyPreview = bodyText.substring(0, 3000)

        // ── 1. Social posts (3 variations) ───────────────────
        const socialRaw = await callClaude(
          `You are the social media voice for Australian Atlas — a curated guide to independent Australian places. Voice: editorial, specific, non-promotional, warm without being gushing. Generate 3 social media posts for this article, each taking a different angle. Post 1: lead with the most surprising or specific fact in the piece (under 200 chars). Post 2: lead with a question that the article answers (under 200 chars). Post 3: lead with the human story at the centre of the piece (under 200 chars). Do not use hashtags. Do not use exclamation marks. Do not use 'amazing', 'incredible', 'unique'. Return as JSON: { "posts": [{ "angle": string, "text": string }] }. Article title: "${article.title}". Article: ${bodyPreview}`,
          1500,
        )
        await delay(DELAY_MS)

        let socialPosts = []
        try {
          const parsed = JSON.parse(extractJSON(socialRaw))
          socialPosts = parsed.posts || parsed
        } catch {
          socialPosts = [{ angle: 'raw', text: socialRaw.substring(0, 200) }]
        }

        // ── 2. Newsletter excerpt ────────────────────────────
        const newsletterExcerpt = await callClaude(
          `Write a 80-100 word newsletter excerpt for this article suitable for a monthly dispatch called 'Dispatches from Independent Australia'. Voice: like a trusted friend who has been paying attention to interesting places. Should make the reader want to read the full piece. End with a natural CTA: 'Read the full piece →'. Article title: "${article.title}". Article: ${bodyPreview}`,
          500,
        )
        await delay(DELAY_MS)

        // ── 3. Meta description ──────────────────────────────
        const metaDescription = await callClaude(
          `Write a search-optimised meta description for this article, under 155 characters. Should accurately represent the piece and include the primary location and topic. No clickbait. Article title: ${article.title}. Article: ${bodyText.substring(0, 1500)}`,
          300,
        )
        await delay(DELAY_MS)

        // ── 4. Follow-up angles ──────────────────────────────
        const anglesRaw = await callClaude(
          `Based on this article, suggest 2 follow-up article angles that would: (a) explore a related story in the same region or vertical, and (b) explore a thematically related story in a different region or vertical. For each: suggested title, one-sentence pitch, suggested interview subject if applicable. Return JSON only: [{ "title": string, "pitch": string, "interview_subject": string }]. Article title: "${article.title}". Article: ${bodyPreview}`,
          1000,
        )
        await delay(DELAY_MS)

        let followUpAngles = []
        try {
          followUpAngles = JSON.parse(extractJSON(anglesRaw))
        } catch {
          followUpAngles = []
        }

        // ── 5. Pull quotes ───────────────────────────────────
        const quotesRaw = await callClaude(
          `Select the 5 most shareable, specific, or striking quotes or sentences from this article. These will be used as pull quotes in social media and editorial contexts. Prioritise: specific facts, surprising claims, strong voice moments, quotable human statements. Return as JSON array of strings. Article title: "${article.title}". Article: ${bodyPreview}`,
          1000,
        )

        let pullQuotes = []
        try {
          pullQuotes = JSON.parse(extractJSON(quotesRaw))
        } catch {
          pullQuotes = []
        }

        // ── Store content package ────────────────────────────
        const { error: insertError } = await sb.from('content_recycling').insert({
          article_id: article.id,
          article_title: article.title,
          social_posts: socialPosts,
          newsletter_excerpt: newsletterExcerpt.trim(),
          meta_description: metaDescription.trim().substring(0, 155),
          follow_up_angles: followUpAngles,
          pull_quotes: pullQuotes,
          status: 'pending_review',
        })

        if (insertError) {
          counts.errors++
          console.error(`[content-recycling] Insert error for "${article.title}": ${insertError.message}`)
          continue
        }

        // ── Update meta on article if missing ────────────────
        if (!article.meta_description) {
          await sb.from('articles').update({
            meta_description: metaDescription.trim().substring(0, 155),
          }).eq('id', article.id)
          counts.meta_updated++
        }

        // ── Mark article as recycled ─────────────────────────
        await sb.from('articles').update({
          recycled_at: new Date().toISOString(),
        }).eq('id', article.id)

        counts.recycled++
        recycledArticles.push({
          title: article.title,
          bestPost: (socialPosts[0]?.text || '').substring(0, 100),
          anglesCount: followUpAngles.length,
          quotesCount: pullQuotes.length,
        })

        console.log(`[content-recycling] Recycled: "${article.title}"`)
        await delay(DELAY_MS)
      } catch (err) {
        counts.errors++
        console.error(`[content-recycling] Error recycling "${article.title}": ${err.message}`)
      }
    }

    // ── Email notification ───────────────────────────────────
    if (recycledArticles.length > 0) {
      await sendAgentEmail({
        subject: `Content Recycling Agent — ${recycledArticles.length} articles recycled`,
        html: buildEmailHtml(counts, recycledArticles),
      })
    }

    await completeRun(runId, {
      status: counts.errors > 0 ? 'partial' : 'success',
      summary: counts,
    })

    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    console.error(`[content-recycling] Fatal error: ${err.message}`)
    await completeRun(runId, { status: 'error', error: err.message, summary: counts })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// ─── Email HTML ──────────────────────────────────────────────────

function buildEmailHtml(counts, articles) {
  const rows = articles.map(a => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:14px;color:#2d2a24">
        <strong>${esc(a.title)}</strong>
        <br/><span style="font-size:12px;color:#8a7a5a;font-style:italic">"${esc(a.bestPost)}..."</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e4da;font-family:sans-serif;font-size:12px;color:#8a7a5a;text-align:center;white-space:nowrap">
        ${a.anglesCount} angles · ${a.quotesCount} quotes
      </td>
    </tr>
  `).join('')

  return `
    <div style="background:#2d2a24;padding:24px 32px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#d4a843">
        Content Recycling Agent
      </h1>
      <p style="margin:6px 0 0;font-family:sans-serif;font-size:13px;color:#8a7a5a">
        ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>

    <div style="padding:24px 32px;background:#faf8f4;border:1px solid #e8e4da;border-top:none;border-radius:0 0 8px 8px">
      <div style="text-align:center;padding:16px 24px;background:#fff;border-radius:8px;border:1px solid #e8e4da;margin-bottom:24px">
        <div style="font-family:Georgia,serif;font-size:36px;color:#4a7c59">${counts.recycled}</div>
        <div style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a;margin-top:4px">Articles Recycled</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#f0ece4">
            <th style="padding:8px 12px;text-align:left;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Article & Best Post</th>
            <th style="padding:8px 12px;text-align:center;font-family:sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#8a7a5a">Extras</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${articles.length > 0 ? `
        <h3 style="font-family:sans-serif;font-size:13px;font-weight:600;color:#2d2a24;margin:20px 0 8px">Follow-up angles this week</h3>
        <p style="font-family:sans-serif;font-size:13px;color:#2d2a24;line-height:1.6;margin:0 0 20px">
          The recycler identified ${articles.reduce((sum, a) => sum + a.anglesCount, 0)} potential follow-up stories across these articles. Check the social queue for details.
        </p>
      ` : ''}

      <div style="text-align:center;margin-top:20px">
        <a href="https://australianatlas.com.au/admin/social-queue" style="display:inline-block;padding:10px 24px;background:#2d2a24;color:#d4a843;font-family:sans-serif;font-size:13px;font-weight:500;text-decoration:none;border-radius:6px">
          Review Social Queue
        </a>
      </div>

      <p style="font-family:sans-serif;font-size:11px;color:#8a7a5a;margin-top:20px;border-top:1px solid #e8e4da;padding-top:12px;text-align:center">
        ${counts.articles_found} articles found · ${counts.recycled} recycled · ${counts.meta_updated} meta descriptions updated${counts.errors > 0 ? ` · ${counts.errors} errors` : ''}
      </p>
    </div>
  `
}
