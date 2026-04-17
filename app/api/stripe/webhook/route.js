import { NextResponse } from 'next/server'
import { getSupabaseAdmin, getVerticalClient, VERTICAL_CONFIG, getClaimFieldConfig, buildClaimPayload, getVerticalClaimsTable } from '@/lib/supabase/clients'

const ATLAS_AUTH_URL = process.env.NEXT_PUBLIC_ATLAS_AUTH_URL || 'https://www.australianatlas.com.au'

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = getStripe()
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // ── Idempotency check ──────────────────────────────────────────────────────
  const { data: alreadyProcessed } = await sb
    .from('processed_stripe_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (alreadyProcessed) {
    console.log(`[stripe-webhook] Skipping duplicate event ${event.id}`)
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break

        const type = session.metadata?.type

        if (type === 'atlas_claim_checkout') {
          await handlePaidClaimAutoApprove(sb, {
            claimId: session.metadata?.claim_id,
            listingId: session.metadata?.listing_id,
            subscriptionId: session.subscription,
            customerEmail: session.metadata?.contact_email,
            customerName: session.metadata?.contact_name,
            vertical: session.metadata?.vertical,
            listingName: session.metadata?.listing_name,
            listingSlug: session.metadata?.listing_slug,
          })
        } else if (type === 'council_checkout') {
          await handleCouncilCheckoutSuccess(sb, {
            councilId: session.metadata?.council_id,
            tier: session.metadata?.tier,
            subscriptionId: session.subscription,
            customerId: session.customer,
          })
        } else if (type === 'operator_checkout') {
          await handleOperatorCheckoutSuccess(sb, {
            operatorId: session.metadata?.operator_id,
            tier: session.metadata?.tier,
            subscriptionId: session.subscription,
            customerId: session.customer,
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object

        // Council subscription cancellation
        if (subscription.metadata?.type === 'council_checkout') {
          const councilId = subscription.metadata?.council_id
          if (councilId) {
            await sb.from('council_accounts').update({
              tier: 'explorer',
              status: 'cancelled',
              stripe_subscription_id: null,
              billing_cycle_end: new Date().toISOString(),
            }).eq('id', councilId)
            console.log(`[stripe-webhook] Council subscription cancelled for ${councilId}`)
          }
          break
        }

        // Operator subscription cancellation
        if (subscription.metadata?.type === 'operator_checkout') {
          const operatorId = subscription.metadata?.operator_id
          if (operatorId) {
            await sb.from('operator_accounts').update({
              tier: 'starter',
              status: 'cancelled',
              stripe_subscription_id: null,
              billing_cycle_end: new Date().toISOString(),
            }).eq('id', operatorId)
            await sb.from('operator_activity').insert({
              operator_id: operatorId,
              action: 'subscription_cancelled',
              metadata: {},
            }).then(null, () => {})
            console.log(`[stripe-webhook] Operator subscription cancelled for ${operatorId}`)
          }
          break
        }

        // Listing subscription cancellation
        const listingId = subscription.metadata?.listing_id
        if (!listingId) break

        await sb
          .from('listings')
          .update({
            subscription_tier: 'free',
            subscription_id: null,
          })
          .eq('id', listingId)

        console.log(`[stripe-webhook] Subscription cancelled for listing ${listingId}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.billing_reason !== 'subscription_cycle') break

        const subscriptionId = invoice.subscription
        if (!subscriptionId) break
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        // Council subscription renewal
        if (subscription.metadata?.type === 'council_checkout') {
          const councilId = subscription.metadata?.council_id
          if (councilId) {
            const billingEnd = new Date()
            billingEnd.setFullYear(billingEnd.getFullYear() + 1)
            await sb.from('council_accounts').update({
              status: 'active',
              billing_cycle_start: new Date().toISOString(),
              billing_cycle_end: billingEnd.toISOString(),
            }).eq('id', councilId)
            console.log(`[stripe-webhook] Council ${councilId} subscription renewed`)
          }
          break
        }

        // Operator subscription renewal
        if (subscription.metadata?.type === 'operator_checkout') {
          const operatorId = subscription.metadata?.operator_id
          if (operatorId) {
            const billingEnd = new Date()
            billingEnd.setFullYear(billingEnd.getFullYear() + 1)
            await sb.from('operator_accounts').update({
              status: 'active',
              billing_cycle_start: new Date().toISOString(),
              billing_cycle_end: billingEnd.toISOString(),
            }).eq('id', operatorId)
            await sb.from('operator_activity').insert({
              operator_id: operatorId,
              action: 'subscription_renewed',
              metadata: { subscription_id: subscriptionId },
            }).then(null, () => {})
            console.log(`[stripe-webhook] Operator ${operatorId} subscription renewed`)
          }
          break
        }

        // Listing subscription renewal
        const listingId = subscription.metadata?.listing_id
        if (listingId) {
          console.log(`[stripe-webhook] Listing ${listingId} subscription renewed`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscriptionId = invoice.subscription
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        // Council payment failed
        if (subscription.metadata?.type === 'council_checkout') {
          const councilId = subscription.metadata?.council_id
          if (councilId) {
            await sb.from('council_accounts').update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            }).eq('id', councilId)

            // Send payment failure notification email
            try {
              const { data: council } = await sb
                .from('council_accounts')
                .select('contact_email, name')
                .eq('id', councilId)
                .single()

              if (council?.contact_email && process.env.RESEND_API_KEY) {
                const { Resend } = await import('resend')
                const resend = new Resend(process.env.RESEND_API_KEY)
                await resend.emails.send({
                  from: 'Australian Atlas <noreply@australianatlas.com.au>',
                  to: council.contact_email,
                  subject: 'Action required: payment failed for your Atlas Council account',
                  html: `
                    <h2>Payment failed</h2>
                    <p>Hi ${council.name || 'there'},</p>
                    <p>We were unable to process your subscription payment for your Australian Atlas Council account.</p>
                    <p>Please update your payment method to avoid service interruption. You can do this from your <a href="https://www.australianatlas.com.au/council">council dashboard</a>.</p>
                    <p>If you have any questions, reply to this email or contact <a href="mailto:councils@australianatlas.com.au">councils@australianatlas.com.au</a>.</p>
                    <p style="color:#888;font-size:13px;margin-top:24px;">Australian Atlas</p>
                  `,
                }).catch(err => console.error('[stripe-webhook] Council payment fail email error:', err.message))
              }
            } catch (emailErr) {
              console.error('[stripe-webhook] Failed to send council payment failure email:', emailErr.message)
            }

            console.log(`[stripe-webhook] Council ${councilId} payment failed`)
          }
          break
        }

        // Operator payment failed
        if (subscription.metadata?.type === 'operator_checkout') {
          const operatorId = subscription.metadata?.operator_id
          if (operatorId) {
            await sb.from('operator_accounts').update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            }).eq('id', operatorId)

            try {
              const { data: op } = await sb
                .from('operator_accounts')
                .select('contact_email, business_name')
                .eq('id', operatorId)
                .single()

              if (op?.contact_email && process.env.RESEND_API_KEY) {
                const { Resend } = await import('resend')
                const resend = new Resend(process.env.RESEND_API_KEY)
                await resend.emails.send({
                  from: 'Australian Atlas <noreply@australianatlas.com.au>',
                  to: op.contact_email,
                  subject: 'Action required: payment failed for your Atlas Operator account',
                  html: `
                    <h2>Payment failed</h2>
                    <p>Hi ${op.business_name || 'there'},</p>
                    <p>We were unable to process your subscription payment for your Australian Atlas Operator account.</p>
                    <p>Please update your payment method to avoid service interruption from your <a href="https://www.australianatlas.com.au/operators/dashboard">operator dashboard</a>.</p>
                    <p style="color:#888;font-size:13px;margin-top:24px;">Australian Atlas</p>
                  `,
                }).catch(err => console.error('[stripe-webhook] Operator payment fail email error:', err.message))
              }
            } catch (emailErr) {
              console.error('[stripe-webhook] Failed to send operator payment failure email:', emailErr.message)
            }

            await sb.from('operator_activity').insert({
              operator_id: operatorId,
              action: 'payment_failed',
              metadata: {},
            }).then(null, () => {})

            console.log(`[stripe-webhook] Operator ${operatorId} payment failed`)
          }
          break
        }

        // Listing payment failed
        const listingId = subscription.metadata?.listing_id
        if (listingId) {
          console.log(`[stripe-webhook] Payment failed for listing ${listingId}`)
        }
        break
      }

      default:
        // Unhandled event type
    }

    // ── Record processed event ──────────────────────────────────────────────
    await sb
      .from('processed_stripe_events')
      .insert({ event_id: event.id, event_type: event.type })
      .then(null, err => console.error('[stripe-webhook] Failed to record event:', err))

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[stripe-webhook] Handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

// ─── Vertical display names & vendor URLs ────────────────────────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

function getVerticalVendorUrl(vertical) {
  const config = VERTICAL_CONFIG[vertical]
  if (!config?.baseUrl) return null
  return `${config.baseUrl}/vendor/login`
}

// ─── Paid claim auto-approve ─────────────────────────────────────────────────

async function handlePaidClaimAutoApprove(sb, {
  claimId, listingId, subscriptionId, customerEmail, customerName,
  vertical, listingName, listingSlug,
}) {
  // ── 1. Resolve the claim record ────────────────────────────────────────────
  let resolvedClaimId = claimId

  if (!resolvedClaimId && listingId && customerEmail) {
    const { data: claims } = await sb
      .from('claims_review')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimant_email', customerEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)

    resolvedClaimId = claims?.[0]?.id
  }

  if (!resolvedClaimId) {
    console.error('[stripe-webhook] Auto-approve failed: no claim found for', { listingId, customerEmail })
    return
  }

  // ── 2. Fetch the full claim + listing ──────────────────────────────────────
  const { data: claimRecord } = await sb
    .from('claims_review')
    .select('id, listing_id, vertical, claimant_email, claimant_name, admin_notes, source_claim_id, tier')
    .eq('id', resolvedClaimId)
    .single()

  if (!claimRecord) {
    console.error(`[stripe-webhook] Claim ${resolvedClaimId} not found`)
    return
  }

  const effectiveListingId = listingId || claimRecord.listing_id
  const effectiveVertical = vertical || claimRecord.vertical
  const effectiveEmail = customerEmail || claimRecord.claimant_email
  const effectiveName = customerName || claimRecord.claimant_name

  let listingRecord = null
  if (effectiveListingId) {
    const { data } = await sb
      .from('listings')
      .select('id, vertical, source_id, name, slug')
      .eq('id', effectiveListingId)
      .single()
    listingRecord = data
  }

  // ── 3. Approve the claim + update subscription ─────────────────────────────
  const existingNotes = claimRecord.admin_notes || ''
  await sb
    .from('claims_review')
    .update({
      status: 'approved',
      admin_notes: `${existingNotes}\n[AUTO-APPROVED] Stripe subscription ${subscriptionId} confirmed.`.trim(),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', resolvedClaimId)

  // Mark listing as claimed + store subscription
  if (effectiveListingId) {
    try {
      const { updateListing } = await import('@/lib/admin/updateListing')
      await updateListing(effectiveListingId, {
        is_claimed: true,
        subscription_tier: 'standard',
        subscription_id: subscriptionId,
      }, { action: 'auto-approve-payment' })
    } catch {
      // Fallback: direct write
      await sb.from('listings').update({
        is_claimed: true,
        subscription_tier: 'standard',
        subscription_id: subscriptionId,
      }).eq('id', effectiveListingId)
    }
  }

  console.log(`[stripe-webhook] Auto-approved claim ${resolvedClaimId} for listing ${effectiveListingId}`)

  // ── 4. Sync to vertical DB ─────────────────────────────────────────────────
  let verticalUserId = null

  if (effectiveVertical && claimRecord.source_claim_id) {
    // Path A: Vertical-originated claim
    try {
      const verticalClient = getVerticalClient(effectiveVertical)
      const claimConfig = getVerticalClaimsTable(effectiveVertical)

      await verticalClient
        .from(claimConfig.table)
        .update({ status: 'approved' })
        .eq('id', claimRecord.source_claim_id)

      const { data: verticalClaim } = await verticalClient
        .from(claimConfig.table)
        .select(`${claimConfig.entityKey}, user_id`)
        .eq('id', claimRecord.source_claim_id)
        .maybeSingle()

      const entityId = verticalClaim?.[claimConfig.entityKey]
      if (entityId) {
        const venueTable = VERTICAL_CONFIG[effectiveVertical]?.table || 'venues'
        const payload = buildClaimPayload(effectiveVertical, verticalClaim?.user_id)
        if (payload) {
          await verticalClient
            .from(venueTable)
            .update(payload)
            .eq('id', entityId)
        }
      }

      verticalUserId = verticalClaim?.user_id
    } catch (err) {
      console.error(`[stripe-webhook] Vertical sync error (${effectiveVertical}):`, err.message)
    }
  } else if (effectiveVertical && listingRecord?.source_id) {
    // Path B: Portal-originated claim — create on vertical + mark claimed
    try {
      const verticalClient = getVerticalClient(effectiveVertical)
      const config = VERTICAL_CONFIG[effectiveVertical]
      let venueTable = config?.table || 'venues'
      let venueId = listingRecord.source_id

      // Fine Grounds prefixed source_ids
      if (effectiveVertical === 'fine_grounds') {
        if (venueId.startsWith('roaster_')) {
          venueTable = 'roasters'
          venueId = venueId.replace('roaster_', '')
        } else if (venueId.startsWith('cafe_')) {
          venueTable = 'cafes'
          venueId = venueId.replace('cafe_', '')
        }
      }

      // Mark venue as claimed using correct field per vertical
      const claimFieldCfg = getClaimFieldConfig(effectiveVertical)
      if (claimFieldCfg && claimFieldCfg.claimable !== false) {
        const payload = buildClaimPayload(effectiveVertical, null)
        if (payload) {
          await verticalClient
            .from(venueTable)
            .update(payload)
            .eq('id', venueId)
        }
      }

      // Create pre-approved claim on vertical
      try {
        const claimConfig = getVerticalClaimsTable(effectiveVertical)
        const claimInsertData = {
          [claimConfig.entityKey]: venueId,
          [claimConfig.nameKey]: effectiveName,
          [claimConfig.emailKey]: effectiveEmail,
          status: 'approved',
          selected_tier: 'standard',
          user_id: null,
        }
        if (claimConfig.table === 'claims') {
          claimInsertData.venue_name = listingRecord.name || effectiveName
        }
        if (claimConfig.table === 'listing_claims') {
          claimInsertData.listing_name = listingRecord.name || effectiveName
        }
        await verticalClient
          .from(claimConfig.table)
          .insert(claimInsertData)
      } catch {
        // Non-fatal — not all verticals have a claims table
      }
    } catch (err) {
      console.error(`[stripe-webhook] Vertical sync error (${effectiveVertical}):`, err.message)
    }
  }

  // ── 5. Promote user to vendor role ─────────────────────────────────────────
  if (verticalUserId) {
    try {
      await fetch(`${ATLAS_AUTH_URL}/api/auth/promote-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.SHARED_API_SECRET || process.env.SHARED_AUTH_SECRET,
        },
        body: JSON.stringify({
          userId: verticalUserId,
          role: 'vendor',
          vertical: effectiveVertical,
        }),
      })
    } catch (promoteErr) {
      // Log to failed_role_promotions for admin retry
      console.error('[stripe-webhook] Promote-role error:', promoteErr.message)
      await sb.from('failed_role_promotions').insert({
        claim_id: resolvedClaimId,
        user_email: effectiveEmail,
        target_role: 'vendor',
        vertical: effectiveVertical,
        error_message: promoteErr.message,
      }).then(null, () => {})
    }
  }

  // ── 6. Send approval email ─────────────────────────────────────────────────
  try {
    if (effectiveEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
      const vendorUrl = getVerticalVendorUrl(effectiveVertical)
      const displayName = listingName || listingRecord?.name || 'your listing'

      const vendorLink = vendorUrl
        ? `<p><a href="${vendorUrl}" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to your dashboard</a></p>
           <p style="color:#888;font-size:13px;">If you don't have an account yet, create one at <a href="${vendorUrl}">${vendorUrl}</a> using <strong>${effectiveEmail}</strong> — your approved claim will be linked automatically.</p>`
        : ''

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: effectiveEmail,
        subject: `Your claim for ${displayName} has been approved`,
        html: `
          <h2>Claim approved</h2>
          <p>Hi ${effectiveName || 'there'},</p>
          <p>Great news! Your claim for <strong>${displayName}</strong> on <strong>${verticalName}</strong> has been approved.</p>
          <p>You selected the <strong>Standard tier ($99/yr)</strong> and your subscription is now active.</p>
          ${vendorLink}
          <p>From your dashboard you can update your listing details, add photos, manage your subscription, and track page views.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Thanks for being part of the Australian Atlas network.</p>
        `,
      }).catch(err => console.error('[stripe-webhook] Email error:', err.message))
    }
  } catch {
    // Non-fatal
  }

  // ── 7. Audit log ───────────────────────────────────────────────────────────
  await sb.from('claim_audit_log').insert({
    claim_id: resolvedClaimId,
    action: 'auto_approved',
    actor: 'stripe_webhook',
    details: {
      subscription_id: subscriptionId,
      listing_id: effectiveListingId,
      vertical: effectiveVertical,
      tier: 'standard',
    },
  }).then(null, err => console.error('[stripe-webhook] Audit log error:', err))
}

// ─── Council checkout success ────────────────────────────────────────────────

async function handleCouncilCheckoutSuccess(sb, { councilId, tier, subscriptionId, customerId }) {
  if (!councilId) {
    console.error('[stripe-webhook] Council checkout missing council_id')
    return
  }

  const billingEnd = new Date()
  billingEnd.setFullYear(billingEnd.getFullYear() + 1)

  const { error } = await sb
    .from('council_accounts')
    .update({
      tier: tier || 'explorer',
      status: 'active',
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      billing_cycle_start: new Date().toISOString(),
      billing_cycle_end: billingEnd.toISOString(),
    })
    .eq('id', councilId)

  if (error) {
    console.error(`[stripe-webhook] Failed to update council ${councilId}:`, error)
    throw error
  }

  // Log the activity
  await sb.from('council_activity').insert({
    council_id: councilId,
    action: 'subscription_activated',
    metadata: { tier, subscription_id: subscriptionId },
  }).then(null, () => {})

  console.log(`[stripe-webhook] Council ${councilId} activated on ${tier} tier`)
}

// ─── Operator checkout success ─────────────────────────────────────────────

async function handleOperatorCheckoutSuccess(sb, { operatorId, tier, subscriptionId, customerId }) {
  if (!operatorId) {
    console.error('[stripe-webhook] Operator checkout missing operator_id')
    return
  }

  const billingEnd = new Date()
  billingEnd.setFullYear(billingEnd.getFullYear() + 1)

  const { error } = await sb
    .from('operator_accounts')
    .update({
      tier: tier || 'starter',
      status: 'active',
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      billing_cycle_start: new Date().toISOString(),
      billing_cycle_end: billingEnd.toISOString(),
    })
    .eq('id', operatorId)

  if (error) {
    console.error(`[stripe-webhook] Failed to update operator ${operatorId}:`, error)
    throw error
  }

  await sb.from('operator_activity').insert({
    operator_id: operatorId,
    action: 'subscription_activated',
    metadata: { tier, subscription_id: subscriptionId },
  }).then(null, () => {})

  // Send confirmation email
  try {
    const { data: op } = await sb
      .from('operator_accounts')
      .select('contact_email, business_name')
      .eq('id', operatorId)
      .single()

    if (op?.contact_email && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: op.contact_email,
        subject: `Welcome to Atlas for Operators — ${tier === 'pro' ? 'Pro' : 'Starter'} plan activated`,
        html: `
          <h2>You're all set</h2>
          <p>Hi ${op.business_name || 'there'},</p>
          <p>Your <strong>${tier === 'pro' ? 'Pro' : 'Starter'}</strong> subscription is now active.</p>
          <p>Head to your <a href="https://www.australianatlas.com.au/operators/dashboard">operator dashboard</a> to start building collections and trails for your clients.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Australian Atlas</p>
        `,
      }).catch(err => console.error('[stripe-webhook] Operator welcome email error:', err.message))
    }
  } catch {}

  console.log(`[stripe-webhook] Operator ${operatorId} activated on ${tier} tier`)
}
