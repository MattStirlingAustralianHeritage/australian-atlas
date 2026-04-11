// app/api/admin/councils/route.js
// Admin CRUD for council accounts.
// POST — create new council
// PATCH — update council (change tier, status, assign regions)

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, slug, contact_name, contact_email, tier, status } = await request.json()

    if (!name?.trim() || !contact_email?.trim()) {
      return NextResponse.json({ error: 'Name and contact email are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const finalSlug = slug?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const { data, error } = await sb
      .from('council_accounts')
      .insert({
        name: name.trim(),
        slug: finalSlug,
        contact_name: contact_name?.trim() || null,
        contact_email: contact_email.trim().toLowerCase(),
        tier: ['explorer', 'partner', 'enterprise'].includes(tier) ? tier : 'explorer',
        status: ['active', 'trial', 'suspended', 'cancelled'].includes(status) ? status : 'trial',
      })
      .select('id, name, slug')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A council with that slug or email already exists' }, { status: 409 })
      }
      throw error
    }

    // ── Council onboarding email ────────────────────────────
    if (contact_email && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: contact_email.trim().toLowerCase(),
          subject: `Welcome to Australian Atlas — ${name.trim()}`,
          html: `
            <h2>Welcome to the Australian Atlas Council Portal</h2>
            <p>Hi ${contact_name?.trim() || 'there'},</p>
            <p>Your council account for <strong>${name.trim()}</strong> has been created on the Australian Atlas network.</p>
            <p>As a council member, you can manage regional tourism content, access analytics for your region, and collaborate with operators across the network.</p>
            <p><a href="https://www.australianatlas.com.au/council/login" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to the Council Portal</a></p>
            <p style="color:#888;font-size:13px;">Use your organisation email address (<strong>${contact_email.trim().toLowerCase()}</strong>) to sign in via magic link.</p>
            <p style="color:#888;font-size:13px;margin-top:24px;">Thanks for being part of the Australian Atlas network.</p>
          `,
        }).catch(err => console.error('[admin/councils] Onboarding email error:', err.message))
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ success: true, council: data })
  } catch (err) {
    console.error('[admin/councils] POST error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { councilId, action, tier, status, regionId, regionRole, approved } = await request.json()

    if (!councilId) {
      return NextResponse.json({ error: 'councilId required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    switch (action) {
      case 'update_tier': {
        if (!['explorer', 'partner', 'enterprise'].includes(tier)) {
          return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
        }
        const { error } = await sb
          .from('council_accounts')
          .update({ tier, updated_at: new Date().toISOString() })
          .eq('id', councilId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'update_status': {
        if (!['active', 'trial', 'suspended', 'cancelled', 'past_due'].includes(status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }
        const { error } = await sb
          .from('council_accounts')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', councilId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'assign_region': {
        if (!regionId) {
          return NextResponse.json({ error: 'regionId required' }, { status: 400 })
        }
        const { error } = await sb
          .from('council_regions')
          .insert({
            council_id: councilId,
            region_id: regionId,
            role: regionRole || 'manager',
          })
        if (error) {
          if (error.code === '23505') {
            return NextResponse.json({ error: 'Region already assigned' }, { status: 409 })
          }
          throw error
        }
        return NextResponse.json({ success: true })
      }

      case 'remove_region': {
        if (!regionId) {
          return NextResponse.json({ error: 'regionId required' }, { status: 400 })
        }
        const { error } = await sb
          .from('council_regions')
          .delete()
          .eq('council_id', councilId)
          .eq('region_id', regionId)
        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'set_approved': {
        const approvedValue = approved !== undefined ? !!approved : true
        const { error } = await sb
          .from('council_accounts')
          .update({ approved: approvedValue, updated_at: new Date().toISOString() })
          .eq('id', councilId)
        if (error) throw error
        return NextResponse.json({ success: true, approved: approvedValue })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[admin/councils] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
