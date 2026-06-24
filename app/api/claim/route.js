import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'
import { createHash } from 'crypto'
import { getCurrentLegalDocuments, recordLegalAcceptances, CLAIM_REQUIRED_DOC_TYPES } from '@/lib/legal/documents'

// Minimal HTML-entity escape for values interpolated into outbound email HTML.
// Claimant-supplied name/role/domain land in the admin notification inbox — an
// unescaped `<img onerror=…>` would otherwise be live HTML there.
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export async function POST(request) {
  // In-memory rate limit (first line of defence)
  const rateLimited = checkRateLimit(request, { keyPrefix: 'claim', maxRequests: 5 })
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const { listingId, slug, name, email, role, tier, websiteDomain } = body

    // ── Honeypot check ───────────────────────────────────────
    // Hidden field named "website" in ClaimForm — real users never fill it.
    // Bots auto-fill it. Return 200 so bots think it worked.
    if (body.website) {
      return NextResponse.json({ success: true, claimId: 'ok' })
    }

    // ── DB-persisted rate limiting (5 claims/hour per IP) ────
    const sb = getSupabaseAdmin()
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()

    const { data: recentAttempts } = await sb
      .from('claim_attempts')
      .select('id, attempt_count')
      .eq('ip_hash', ipHash)
      .gte('window_start', oneHourAgo)
      .order('window_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentAttempts && recentAttempts.attempt_count >= 5) {
      return NextResponse.json(
        { error: 'Too many claim attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Increment or create attempt record
    if (recentAttempts) {
      await sb.from('claim_attempts')
        .update({ attempt_count: recentAttempts.attempt_count + 1 })
        .eq('id', recentAttempts.id)
    } else {
      await sb.from('claim_attempts')
        .insert({ ip_hash: ipHash, attempt_count: 1, window_start: new Date().toISOString() })
    }

    // ── Validate required fields ──────────────────────────────
    if (!listingId || !name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'Name, email, and listing ID are required.' },
        { status: 400 }
      )
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 }
      )
    }

    // ── Legal acceptance gate ─────────────────────────────────
    // The operator must affirm the current Operator Agreement + Upload Terms
    // (rendered from legal_documents). Fail CLOSED: if the docs can't be loaded
    // we never complete a claim without recordable consent.
    const requiredDocs = await getCurrentLegalDocuments(sb, CLAIM_REQUIRED_DOC_TYPES)
    const operatorDoc = requiredDocs.operator_agreement
    const uploadDoc = requiredDocs.upload_terms
    if (!operatorDoc || !uploadDoc) {
      console.error('[claim] Required legal documents missing/unloadable — blocking claim (fail closed)')
      return NextResponse.json(
        { error: 'Our terms are being updated and claims are paused momentarily. Please try again shortly.' },
        { status: 503 }
      )
    }
    if (body.acceptOperatorAgreement !== true || body.acceptUploadTerms !== true) {
      return NextResponse.json(
        { error: 'You must accept the Operator Agreement and the Upload Terms to claim a listing.' },
        { status: 400 }
      )
    }

    // ── Verify listing exists and is active ───────────────────
    const { data: listing, error: listingError } = await sb
      .from('listings')
      .select('id, vertical, is_claimed, name')
      .eq('id', listingId)
      .eq('status', 'active')
      .single()

    if (listingError || !listing) {
      return NextResponse.json(
        { error: 'Listing not found or is not active.' },
        { status: 404 }
      )
    }

    if (listing.is_claimed) {
      return NextResponse.json(
        { error: 'This listing has already been claimed.' },
        { status: 409 }
      )
    }

    // Field Atlas listings are natural features — not claimable
    if (listing.vertical === 'field') {
      return NextResponse.json(
        { error: 'This type of listing cannot be claimed.' },
        { status: 400 }
      )
    }

    // ── Check for duplicate pending claim ─────────────────────
    const { data: existing } = await sb
      .from('claims_review')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimant_email', email.trim())
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'You already have a pending claim for this listing.' },
        { status: 409 }
      )
    }

    // ── Insert claim ──────────────────────────────────────────
    const { data: insertedClaim, error: insertError } = await sb
      .from('claims_review')
      .insert({
        listing_id: listingId,
        vertical: listing.vertical,
        claimant_name: name.trim(),
        claimant_email: email.trim(),
        tier: ['free', 'standard'].includes(tier) ? tier : 'free',
        status: 'pending',
        admin_notes: `Role: ${role || 'not specified'}. Tier: ${tier || 'free'}. Domain: ${websiteDomain?.trim() || 'not provided'}`,
      })
      .select('id')
      .single()

    if (insertError) {
      // DB-level unique constraint catch (partial index on pending claims)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A claim for this listing is already under review.' },
          { status: 409 }
        )
      }
      console.error('[claim] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit claim. Please try again.' },
        { status: 500 }
      )
    }

    // ── Record legal acceptances (audit trail of the consent) ─
    // The gate above is the enforcement; these rows are the durable record,
    // tied to the claim (pre-account: operator_id is back-filled on approval).
    const { error: acceptErr } = await recordLegalAcceptances(sb, {
      documents: [operatorDoc, uploadDoc],
      claimId: insertedClaim?.id || null,
      subjectEmail: email.trim(),
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || null,
    })
    if (acceptErr) {
      console.error('[claim] CRITICAL: claim', insertedClaim?.id, 'created but legal_acceptances write failed:', acceptErr.message)
    }

    // ── Audit log (non-blocking) ─────────────────────────────
    sb.from('claim_audit_log').insert({
      claim_id: insertedClaim?.id,
      action: 'created',
      actor: email.trim(),
      details: { listing_id: listingId, tier: tier || 'free', vertical: listing.vertical },
    }).then(null, err => console.error('[claim] Audit log error:', err))

    // ── Claim submission confirmation email (non-blocking) ───
    if (process.env.RESEND_API_KEY) {
      import('resend').then(({ Resend }) => {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const listingName = listing.name || 'your listing'

        // 1. Confirmation to claimant
        resend.emails.send({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: email.trim(),
          subject: `Claim received for ${listingName}`,
          html: `
            <h2>We've received your claim</h2>
            <p>Hi ${escHtml(name)},</p>
            <p>Thanks for submitting a claim for <strong>${escHtml(listingName)}</strong>. Our team will review it and get back to you within 1-2 business days.</p>
            <p>You selected the <strong>${tier === 'standard' ? 'Standard ($295/yr)' : 'Free'}</strong> tier.</p>
            <p style="color:#888;font-size:13px;margin-top:24px;">If you didn't submit this claim, you can safely ignore this email.</p>
          `,
        }).catch(err => console.error('[claim] Confirmation email error:', err.message))

        // 2. Admin notification
        resend.emails.send({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: 'matt@australianatlas.com.au',
          subject: `New claim submitted: ${listingName}`,
          html: `
            <h2>New claim submission</h2>
            <p><strong>Listing:</strong> ${escHtml(listingName)}</p>
            <p><strong>Vertical:</strong> ${escHtml(listing.vertical || 'unknown')}</p>
            <p><strong>Claimant:</strong> ${escHtml(name)} (${escHtml(email)})</p>
            <p><strong>Role:</strong> ${escHtml(role || 'not specified')}</p>
            <p><strong>Tier:</strong> ${escHtml(tier || 'free')}</p>
            <p><strong>Domain:</strong> ${escHtml(websiteDomain?.trim() || 'not provided')}</p>
            <p style="margin-top:16px;"><a href="https://www.australianatlas.com.au/admin/claims">Review in admin</a></p>
          `,
        }).catch(err => console.error('[claim] Admin notification error:', err.message))
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, claimId: insertedClaim?.id })
  } catch (err) {
    console.error('[claim] Unexpected error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
