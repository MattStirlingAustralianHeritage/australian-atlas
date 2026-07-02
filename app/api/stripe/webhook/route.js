import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { grantClaim } from '@/lib/claims/grantClaim'

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
            customerId: session.customer,
            customerEmail: session.metadata?.contact_email,
            customerName: session.metadata?.contact_name,
            vertical: session.metadata?.vertical,
            listingName: session.metadata?.listing_name,
            listingSlug: session.metadata?.listing_slug,
          })
        } else if (type === 'atlas_upgrade_checkout') {
          await handleUpgradeCheckout(sb, {
            listingId: session.metadata?.listing_id,
            subscriptionId: session.subscription,
            customerId: session.customer,
            customerEmail: session.metadata?.contact_email,
            customerName: session.metadata?.contact_name,
            vertical: session.metadata?.vertical,
            listingName: session.metadata?.listing_name,
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

        // Listing (vendor claim) subscription cancellation.
        // Commercial state lives in listing_claims (never on listings), so we
        // resolve the ownership row by Stripe subscription id, deactivate it,
        // and clear the display flag via updateListing. No phantom listings
        // columns. 'past_due' is included: that's the dunning grace state
        // (invoice.payment_failed below) and Stripe fires this event when the
        // retries exhaust — the grace must end here too.
        const { data: claimRow } = await sb
          .from('listing_claims')
          .select('id, listing_id')
          .eq('stripe_subscription_id', subscription.id)
          .in('status', ['active', 'past_due'])
          .order('status', { ascending: true }) // prefer the 'active' row if both exist
          .limit(1)
          .maybeSingle()

        if (!claimRow) {
          console.log(`[stripe-webhook] No live claim for cancelled subscription ${subscription.id}`)
          break
        }

        await sb
          .from('listing_claims')
          .update({ status: 'inactive', past_due_since: null, updated_at: new Date().toISOString() })
          .eq('id', claimRow.id)

        try {
          const { updateListing } = await import('@/lib/admin/updateListing')
          await updateListing(claimRow.listing_id, { is_claimed: false }, { action: 'claim-cancel' })
        } catch (e) {
          console.error(`[stripe-webhook] Failed to clear is_claimed for listing ${claimRow.listing_id}:`, e.message)
        }

        console.log(`[stripe-webhook] Deactivated claim ${claimRow.id} (listing ${claimRow.listing_id}) for cancelled subscription ${subscription.id}`)
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

        // Listing (vendor claim) subscription renewal — mirror the council /
        // operator handlers above. Commercial state lives in listing_claims
        // (resolved by Stripe subscription id, same as the cancellation
        // handler): refresh the paid year and clear any dunning state left by
        // a failed attempt earlier in the cycle.
        const { data: renewedClaim } = await sb
          .from('listing_claims')
          .select('id, listing_id')
          .eq('stripe_subscription_id', subscriptionId)
          .in('status', ['active', 'past_due'])
          .order('status', { ascending: true }) // prefer the 'active' row if both exist
          .limit(1)
          .maybeSingle()

        if (!renewedClaim) {
          console.log(`[stripe-webhook] No live claim for renewed subscription ${subscriptionId}`)
          break
        }

        const listingBillingEnd = new Date()
        listingBillingEnd.setFullYear(listingBillingEnd.getFullYear() + 1)
        await sb
          .from('listing_claims')
          .update({
            status: 'active',
            past_due_since: null,
            billing_cycle_end: listingBillingEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewedClaim.id)

        console.log(`[stripe-webhook] Listing claim ${renewedClaim.id} (listing ${renewedClaim.listing_id}) subscription renewed`)
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

        // Listing (vendor claim) payment failed → GRACE PERIOD, not a cut-off.
        // Mirror the council/operator dunning above: mark the claim past_due
        // (keeping the FIRST failure time across Stripe's retry attempts),
        // tell the operator their Standard benefits stay live while they fix
        // the card, and give admin a heads-up. Paid perks keep working during
        // grace (lib/listing-gallery.js counts 'past_due' as paid); the grace
        // ends when customer.subscription.deleted fires (retries exhausted).
        const { data: failedClaim } = await sb
          .from('listing_claims')
          .select('id, listing_id, vertical, claimant_email, past_due_since, listings(name)')
          .eq('stripe_subscription_id', subscriptionId)
          .in('status', ['active', 'past_due'])
          .order('status', { ascending: true }) // prefer the 'active' row if both exist
          .limit(1)
          .maybeSingle()

        if (!failedClaim) {
          console.log(`[stripe-webhook] Payment failed for subscription ${subscriptionId} — no live listing claim found`)
          break
        }

        const failedAt = new Date().toISOString()
        await sb
          .from('listing_claims')
          .update({
            status: 'past_due',
            // Stripe retries several times per cycle — keep the FIRST failure time.
            past_due_since: failedClaim.past_due_since || failedAt,
            updated_at: failedAt,
          })
          .eq('id', failedClaim.id)

        const failedListingName = failedClaim.listings?.name || subscription.metadata?.listing_name || null
        const failedVerticalName = VERTICAL_NAMES[failedClaim.vertical] || failedClaim.vertical || 'Australian Atlas'

        // Operator email — branded (lib/email/billingEmails.js), graceful
        // no-op without RESEND_API_KEY, never throws.
        try {
          const { paymentFailedEmail, sendBillingEmail } = await import('@/lib/email/billingEmails')
          await sendBillingEmail(
            failedClaim.claimant_email,
            paymentFailedEmail({ listingName: failedListingName, verticalName: failedVerticalName })
          )
        } catch (emailErr) {
          console.error('[stripe-webhook] Failed to send listing payment failure email:', emailErr.message)
        }

        // Admin heads-up (matt@australianatlas.com.au via lib/agents/email.js).
        try {
          const { sendAgentEmail } = await import('@/lib/agents/email')
          await sendAgentEmail({
            subject: `[Atlas] Listing payment failed — ${failedListingName || failedClaim.listing_id}`,
            html: `
              <p>Stripe reported a failed renewal payment for a paid listing claim.</p>
              <ul>
                <li><strong>Listing:</strong> ${failedListingName || '(name unavailable)'} (${failedClaim.listing_id})</li>
                <li><strong>Vertical:</strong> ${failedVerticalName}</li>
                <li><strong>Claimant:</strong> ${failedClaim.claimant_email}</li>
                <li><strong>Subscription:</strong> ${subscriptionId}</li>
                <li><strong>Past due since:</strong> ${failedClaim.past_due_since || failedAt}</li>
              </ul>
              <p>The claim is now <strong>past_due</strong> — a grace period, so Standard benefits stay live while Stripe retries. If retries exhaust, customer.subscription.deleted deactivates it. See <a href="https://www.australianatlas.com.au/admin/claims">/admin/claims</a>.</p>
            `,
          })
        } catch (adminErr) {
          console.error('[stripe-webhook] Failed to send admin payment-failed notice:', adminErr.message)
        }

        console.log(`[stripe-webhook] Listing claim ${failedClaim.id} (listing ${failedClaim.listing_id}) marked past_due`)
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

// ─── Vertical display names ──────────────────────────────────────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Operator access lives on the portal itself (australianatlas.com.au), never a
// vertical /vendor/login surface. Sign-in is driven off the Supabase invite that
// grantClaim sends; this is the fallback / existing-user sign-in base.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// ─── Paid claim auto-approve ─────────────────────────────────────────────────

async function handlePaidClaimAutoApprove(sb, {
  claimId, listingId, subscriptionId, customerId, customerEmail, customerName,
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
    .select('id, listing_id, vertical, claimant_email, claimant_name, admin_notes')
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

  // ── 3. Approve the claim in the portal moderation record ───────────────────
  // claims_review is the authoritative moderation/intake record. Commercial
  // state (tier, Stripe ids) lives in listing_claims, written by grantClaim
  // below — never on listings, never in a vertical DB.
  const existingNotes = claimRecord.admin_notes || ''
  await sb
    .from('claims_review')
    .update({
      status: 'approved',
      admin_notes: `${existingNotes}\n[AUTO-APPROVED] Stripe subscription ${subscriptionId} confirmed.`.trim(),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', resolvedClaimId)

  // ── 4. Grant the claim (single idempotent entry point) ─────────────────────
  // grantClaim resolves/provisions the user by email, promotes to vendor +
  // vertical, inserts the listing_claims ownership row (tier 'standard' with
  // the Stripe ids), and flips listings.is_claimed via updateListing. On
  // failure it records failed_role_promotions for admin retry. This replaces
  // the former phantom listings write, the per-vertical commercial-row write,
  // and the separate promote-role call.
  const grant = await grantClaim({
    listing_id: effectiveListingId,
    vertical: effectiveVertical,
    claimant_email: effectiveEmail,
    tier: 'standard',
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    source_review_id: resolvedClaimId,
  })

  if (grant.ok) {
    console.log(`[stripe-webhook] Auto-approved + granted claim ${resolvedClaimId} for listing ${effectiveListingId}`)
  } else {
    console.error(`[stripe-webhook] grantClaim failed for claim ${resolvedClaimId}:`, grant.error)
  }

  // ── 6. Send approval email ─────────────────────────────────────────────────
  try {
    if (effectiveEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
      const displayName = listingName || listingRecord?.name || 'your listing'

      // Access is driven off the Supabase invite grantClaim sends to new operators
      // (redirectTo → /account). No /vendor/login, no auto-link promise.
      const accessBlock = grant.provisioned
        ? `<p>We've just sent a separate email to <strong>${effectiveEmail}</strong> with a secure sign-in link. Click it to finish setting up access and open your operator dashboard.</p>
           <p style="color:#888;font-size:13px;">You can also sign in any time at <a href="${SITE_URL}/login">${SITE_URL.replace(/^https?:\/\//, '')}/login</a>.</p>`
        : `<p><a href="${SITE_URL}/login" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to your dashboard</a></p>
           <p style="color:#888;font-size:13px;">Sign in to your Australian Atlas account (<strong>${effectiveEmail}</strong>) to manage your listing.</p>`

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
        to: effectiveEmail,
        subject: `Your claim for ${displayName} is confirmed`,
        html: `
          <h2>Claim confirmed</h2>
          <p>Hi ${effectiveName || 'there'},</p>
          <p>Great news! Your Standard plan claim for <strong>${displayName}</strong> on <strong>${verticalName}</strong> has been automatically approved.</p>
          <p>Your subscription is now active and will renew in 12 months.</p>
          ${accessBlock}
          <p>From your dashboard you can update your listing details, add photos, manage your subscription, and track page views.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Thanks for being part of the Australian Atlas network.</p>
        `,
      }).catch(err => console.error('[stripe-webhook] Email error:', err.message))

      await sb.from('claim_audit_log').insert({
        claim_id: resolvedClaimId,
        action: 'notification_sent',
        actor: 'system',
        details: { type: 'auto_approval_email', to: effectiveEmail },
      }).then(null, () => {})
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

// ─── Upgrade checkout (free → standard) ──────────────────────────────────────
//
// Fired when an operator who already owns a listing on the FREE tier completes
// the "unlock editing" payment from their dashboard. Unlike the claim checkout,
// there is no pending claims_review to approve — an active (free) listing_claims
// row already exists. grantClaim with tier 'standard' upgrades that row in place
// (attaching the Stripe ids) and is idempotent, so a duplicate webhook is safe.
async function handleUpgradeCheckout(sb, {
  listingId, subscriptionId, customerId, customerEmail, customerName, vertical, listingName,
}) {
  if (!listingId || !customerEmail) {
    console.error('[stripe-webhook] Upgrade checkout missing listing_id or contact_email', { listingId })
    return
  }

  // Resolve the vertical if the session metadata didn't carry it (grantClaim needs it).
  let effectiveVertical = vertical
  let resolvedName = listingName
  if (!effectiveVertical || !resolvedName) {
    const { data: listing } = await sb
      .from('listings')
      .select('vertical, name')
      .eq('id', listingId)
      .maybeSingle()
    effectiveVertical = effectiveVertical || listing?.vertical
    resolvedName = resolvedName || listing?.name
  }

  // Upgrade the existing active claim in place (free → standard). grantClaim
  // resolves the owner by email, finds the active row, and attaches the Stripe
  // ids — it does not create a second claim.
  const grant = await grantClaim({
    listing_id: listingId,
    vertical: effectiveVertical,
    claimant_email: customerEmail,
    tier: 'standard',
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
  })

  if (grant.ok) {
    console.log(`[stripe-webhook] Upgraded listing ${listingId} to standard (subscription ${subscriptionId})`)
  } else {
    console.error(`[stripe-webhook] Upgrade grant failed for listing ${listingId}:`, grant.error)
  }

  // ── Confirmation email: editing is now unlocked ──
  try {
    if (customerEmail && process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const verticalName = VERTICAL_NAMES[effectiveVertical] || effectiveVertical || 'Australian Atlas'
      const displayName = resolvedName || 'your listing'
      const editUrl = `${SITE_URL}/dashboard/listings/${listingId}/edit`

      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        replyTo: 'listings@australianatlas.com.au',
        to: customerEmail,
        subject: `${displayName} is now on the Standard plan`,
        html: `
          <h2>Editing unlocked</h2>
          <p>Hi ${customerName || 'there'},</p>
          <p>Your payment is confirmed and <strong>${displayName}</strong> on <strong>${verticalName}</strong> is now on the <strong>Standard plan</strong>.</p>
          <p>You can now manage every detail of your listing — website and contact details, opening hours, your photo gallery, highlights and more.</p>
          <p><a href="${editUrl}" style="display:inline-block;padding:12px 28px;background:#5F8A7E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Edit your listing</a></p>
          <p>Your subscription is active and will renew in 12 months.</p>
          <p style="color:#888;font-size:13px;margin-top:24px;">Thanks for being part of the Australian Atlas network.</p>
        `,
      }).catch(err => console.error('[stripe-webhook] Upgrade email error:', err.message))
    }
  } catch {
    // Non-fatal
  }
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
