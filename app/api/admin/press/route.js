// app/api/admin/press/route.js
// Admin control surface for the For Press programme.
//   GET   — everything the admin page renders: enquiries, members, leads,
//           requests, feedback
//   POST  — create a press account directly (pre-approved)
//   PATCH — actions: approve_enquiry / decline_enquiry / set_status /
//           set_approved / update_request / create_lead / update_lead /
//           publish_lead / archive_lead / delete_lead

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
const OUTLET_TYPES = ['national', 'metro', 'regional', 'local', 'newsletter', 'magazine', 'broadcast', 'podcast', 'online', 'freelance', 'other']
const LEAD_TYPES = ['story_lead', 'release', 'data_note', 'milestone']

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'outlet'
}

async function uniquePressSlug(sb, base) {
  const { data } = await sb.from('press_accounts').select('slug').like('slug', `${base}%`)
  const taken = new Set((data || []).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  }
  return `${base}-${Date.now().toString(36)}`
}

async function createAccount(sb, { name, outlet, email, outletType, roleTitle, website }) {
  const slug = await uniquePressSlug(sb, slugify(outlet))
  const { data, error } = await sb
    .from('press_accounts')
    .insert({
      name: String(name).trim().slice(0, 200),
      outlet: String(outlet).trim().slice(0, 200),
      slug,
      contact_email: String(email).trim().toLowerCase(),
      outlet_type: OUTLET_TYPES.includes(outletType) ? outletType : 'other',
      role_title: roleTitle ? String(roleTitle).trim().slice(0, 200) : null,
      website: website ? String(website).trim().slice(0, 300) : null,
      approved: true,
    })
    .select('id, name, outlet, slug, contact_email')
    .single()
  if (error) return { error }
  return { account: data }
}

async function sendWelcomeEmail({ name, outlet, email }) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Australian Atlas <noreply@australianatlas.com.au>',
      to: email,
      replyTo: PRESS_CONTACT_EMAIL,
      subject: `Your Australian Atlas Newsroom access is live — ${outlet}`,
      html: `
        <div style="font-family: 'DM Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 16px; color: #1C1A17;">
          <p style="font-family: 'Playfair Display', Georgia, serif; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6760; margin: 0 0 20px;">Australian Atlas · Newsroom</p>
          <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight: 400; font-size: 21px; margin: 0 0 12px;">Welcome to the press desk, ${name}</h2>
          <p style="font-size: 14px; color: #3D3A34; line-height: 1.65;">
            Your Newsroom account for <strong>${outlet}</strong> is approved. Sign in with this email address —
            no password, we send you a code:
          </p>
          <p style="margin: 18px 0;">
            <a href="${SITE}/newsroom/login" style="display: inline-block; background: #1C1A17; color: #faf8f5; padding: 11px 26px; border-radius: 99px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign in to the Newsroom</a>
          </p>
          <p style="font-size: 14px; color: #3D3A34; line-height: 1.65;">
            First thing to do: <strong>follow the regions you cover</strong>. From then on you'll hear the moment
            a listed independent puts on an event there — plus story leads, new places, citable regional data,
            CSV downloads and a calendar feed. Everything is free for working press, and our data is free to
            cite with attribution.
          </p>
          <p style="font-size: 13px; color: #6B6760; line-height: 1.6;">
            Need anything for a story — an introduction, a data pull, a comment? Reply to this email;
            we answer the same business day.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Press welcome email error:', err)
  }
}

export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const [enquiries, members, leads, requests, feedback, follows] = await Promise.all([
      sb.from('press_enquiries').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('press_accounts')
        .select('id, name, outlet, slug, outlet_type, contact_email, role_title, website, approved, status, cadence, beat_verticals, last_login_at, created_at')
        .order('created_at', { ascending: false }).limit(200),
      sb.from('press_leads')
        .select('id, title, summary, body, lead_type, region_id, vertical, status, embargo_until, published_at, created_at, region:regions ( name, slug )')
        .order('created_at', { ascending: false }).limit(100),
      sb.from('press_requests').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('press_feedback').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('press_follows').select('press_id, region:regions ( name )'),
    ])

    const followsByPress = {}
    for (const f of follows.data || []) {
      if (!followsByPress[f.press_id]) followsByPress[f.press_id] = []
      if (f.region?.name) followsByPress[f.press_id].push(f.region.name)
    }

    const { data: regions } = await sb
      .from('regions').select('id, name, slug').eq('status', 'live').order('name')

    return NextResponse.json({
      enquiries: enquiries.data || [],
      members: (members.data || []).map(m => ({ ...m, follows: followsByPress[m.id] || [] })),
      leads: leads.data || [],
      requests: requests.data || [],
      feedback: feedback.data || [],
      regions: regions || [],
    })
  } catch (err) {
    console.error('Admin press GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, outlet, email, outletType, roleTitle, website } = await request.json()
    if (!name?.trim() || !outlet?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name, outlet and email are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { account, error } = await createAccount(sb, { name, outlet, email, outletType, roleTitle, website })
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
      }
      throw error
    }

    await sendWelcomeEmail({ name: account.name, outlet: account.outlet, email: account.contact_email })
    return NextResponse.json({ ok: true, account })
  } catch (err) {
    console.error('Admin press POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action } = body
    const sb = getSupabaseAdmin()

    if (action === 'approve_enquiry') {
      const { data: enquiry } = await sb
        .from('press_enquiries').select('*').eq('id', body.enquiryId).single()
      if (!enquiry) return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })

      const { account, error } = await createAccount(sb, {
        name: enquiry.name,
        outlet: enquiry.outlet || enquiry.name,
        email: enquiry.email,
        outletType: enquiry.outlet_type,
      })
      if (error) {
        if (error.code === '23505') {
          // Account already exists — just mark the enquiry handled.
          await sb.from('press_enquiries').update({ status: 'approved' }).eq('id', enquiry.id)
          return NextResponse.json({ ok: true, note: 'account already existed' })
        }
        throw error
      }

      await sb.from('press_enquiries').update({ status: 'approved' }).eq('id', enquiry.id)
      await sendWelcomeEmail({ name: account.name, outlet: account.outlet, email: account.contact_email })
      return NextResponse.json({ ok: true, account })
    }

    if (action === 'decline_enquiry') {
      await sb.from('press_enquiries').update({ status: 'declined' }).eq('id', body.enquiryId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'set_status') {
      if (!['active', 'suspended', 'cancelled'].includes(body.status)) {
        return NextResponse.json({ error: 'Bad status' }, { status: 400 })
      }
      await sb.from('press_accounts')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', body.pressId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'set_approved') {
      await sb.from('press_accounts')
        .update({ approved: !!body.approved, updated_at: new Date().toISOString() })
        .eq('id', body.pressId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_request') {
      if (!['new', 'in_progress', 'closed'].includes(body.status)) {
        return NextResponse.json({ error: 'Bad status' }, { status: 400 })
      }
      await sb.from('press_requests').update({ status: body.status }).eq('id', body.requestId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'create_lead' || action === 'update_lead') {
      const fields = {}
      if ('title' in body) fields.title = String(body.title || '').trim().slice(0, 200)
      if ('summary' in body) fields.summary = String(body.summary || '').trim().slice(0, 1000)
      if ('body' in body) fields.body = body.body ? String(body.body).trim().slice(0, 8000) : null
      if ('leadType' in body) fields.lead_type = LEAD_TYPES.includes(body.leadType) ? body.leadType : 'story_lead'
      if ('regionId' in body) fields.region_id = body.regionId || null
      if ('vertical' in body) fields.vertical = body.vertical || null
      if ('embargoUntil' in body) fields.embargo_until = body.embargoUntil || null

      if (action === 'create_lead') {
        if (!fields.title || !fields.summary) {
          return NextResponse.json({ error: 'Title and summary are required' }, { status: 400 })
        }
        const { data, error } = await sb.from('press_leads').insert(fields).select('id').single()
        if (error) throw error
        return NextResponse.json({ ok: true, leadId: data.id })
      }

      fields.updated_at = new Date().toISOString()
      const { error } = await sb.from('press_leads').update(fields).eq('id', body.leadId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (action === 'publish_lead') {
      // Publishing sets the clock: the next press-notify run emails it to
      // every member it's visible to (after any embargo lifts).
      await sb.from('press_leads')
        .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', body.leadId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'archive_lead') {
      await sb.from('press_leads')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', body.leadId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_lead') {
      await sb.from('press_leads').delete().eq('id', body.leadId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('Admin press PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
