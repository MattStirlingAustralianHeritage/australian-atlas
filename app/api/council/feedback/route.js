import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'

// Feedback categories the dashboard form offers. Anything else falls back to
// 'general' so the column stays tidy.
const CATEGORIES = ['general', 'bug', 'feature', 'data', 'other']
const CATEGORY_LABELS = {
  general: 'General feedback',
  bug: 'Something is broken',
  feature: 'Feature request',
  data: 'Data correction',
  other: 'Other',
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// POST: an authenticated council sends beta feedback to Matt.
export async function POST(req) {
  const cookie = req.cookies.get('council_session')
  const session = validateCouncilSession(cookie?.value)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { message, category, page } = body

  if (!message || !String(message).trim()) {
    return NextResponse.json({ error: 'Feedback message is required' }, { status: 400 })
  }
  const cat = CATEGORIES.includes(category) ? category : 'general'
  const cleanMessage = String(message).trim().slice(0, 5000)
  const cleanPage = page ? String(page).slice(0, 300) : null

  const sb = getSupabaseAdmin()

  // Council context (name/tier/email) so the notification is self-describing and
  // the persisted row carries a readable council name.
  let council = null
  try {
    const { data } = await sb
      .from('council_accounts')
      .select('id, name, tier, contact_email')
      .eq('id', session.councilId)
      .single()
    council = data
  } catch { /* non-fatal */ }

  // Persist (best-effort). A missing table (migration 181 not yet applied) or any
  // insert failure must NOT block the feedback — the email below still fires and
  // the council still sees success, mirroring the enquiry path.
  try {
    const { error } = await sb.from('council_feedback').insert({
      council_id: session.councilId,
      council_name: council?.name || null,
      category: cat,
      message: cleanMessage,
      page: cleanPage,
    })
    if (error) console.error('Council feedback persist error:', error.message)
  } catch (err) {
    console.error('Council feedback persist exception:', err)
  }

  // Activity log (best-effort) so it shows in the council's recent activity feed.
  try {
    await sb.from('council_activity').insert({
      council_id: session.councilId,
      action: 'feedback',
      metadata: { category: cat },
    })
  } catch { /* non-fatal */ }

  // Notify Matt via Resend.
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: 'councils@australianatlas.com.au',
        reply_to: council?.contact_email || undefined,
        subject: `Council beta feedback — ${escapeHtml(council?.name || 'Unknown council')} (${CATEGORY_LABELS[cat]})`,
        html: `
          <h2>New council beta feedback</h2>
          <p><strong>Council:</strong> ${escapeHtml(council?.name || '—')}</p>
          <p><strong>Tier:</strong> ${escapeHtml(council?.tier || '—')}</p>
          <p><strong>Contact:</strong> ${escapeHtml(council?.contact_email || '—')}</p>
          <p><strong>Category:</strong> ${escapeHtml(CATEGORY_LABELS[cat])}</p>
          ${cleanPage ? `<p><strong>From page:</strong> ${escapeHtml(cleanPage)}</p>` : ''}
          <p><strong>Feedback:</strong></p>
          <p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>
        `,
      }),
    })
    if (!res.ok) console.error('Resend error (council feedback):', await res.text())
  } catch (err) {
    console.error('Council feedback email error:', err)
  }

  return NextResponse.json({ success: true })
}
