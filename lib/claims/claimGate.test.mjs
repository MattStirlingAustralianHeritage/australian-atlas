import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isClaimPayable,
  isConfirmationProof,
  landsOnPasswordSetup,
  UNPROVEN_CONFIRM_SOURCE,
} from './claimGate.mjs'

// ── What a pay link may be used for ─────────────────────────────────────────

test('a claim still in the funnel can be paid for', () => {
  assert.equal(isClaimPayable('pending'), true)
  assert.equal(isClaimPayable('pending_verification'), true)
  assert.equal(isClaimPayable('approved'), true)
})

test('a rejected claim can never be paid back into ownership', () => {
  // The pay link lives forever in an approval email and the webhook writes
  // 'approved' on payment, so this is the only thing standing between a refused
  // claimant and the listing.
  assert.equal(isClaimPayable('rejected'), false)
})

test('a claim handed to a transfer is not payable by its old claimant', () => {
  assert.equal(isClaimPayable('transfer_pending'), false)
})

test('an unknown or missing status is not payable', () => {
  assert.equal(isClaimPayable(undefined), false)
  assert.equal(isClaimPayable(null), false)
  assert.equal(isClaimPayable(''), false)
  assert.equal(isClaimPayable('APPROVED'), false) // case matters; statuses are lowercase
})

// ── What counts as proof of an address ──────────────────────────────────────

test('an unconfirmed account is never proof', () => {
  assert.equal(isConfirmationProof({ email_confirmed_at: null }), false)
  assert.equal(isConfirmationProof({}), false)
  assert.equal(isConfirmationProof(null), false)
})

test('a genuinely confirmed address is proof', () => {
  assert.equal(isConfirmationProof({ email_confirmed_at: '2026-07-30T00:00:00Z' }), true)
})

test('an outage auto-confirm is confirmed but NOT proof', () => {
  // Signup confirms server-side when Resend is down so signup never dead-ends.
  // Nobody opened anything, so this must not be able to finalize a claim —
  // otherwise an outage is a window to claim a venue's published address.
  assert.equal(
    isConfirmationProof({
      email_confirmed_at: '2026-07-30T00:00:00Z',
      app_metadata: { email_confirm_source: UNPROVEN_CONFIRM_SOURCE },
    }),
    false
  )
})

test('opening a real link later restores proof', () => {
  // /auth/callback rewrites the source on a successful verifyOtp. Without that
  // the account would be permanently barred from owning its own listing.
  assert.equal(
    isConfirmationProof({
      email_confirmed_at: '2026-07-30T00:00:00Z',
      app_metadata: { email_confirm_source: 'email_link' },
    }),
    true
  )
})

test('an unrelated app_metadata provider does not disqualify an account', () => {
  assert.equal(
    isConfirmationProof({
      email_confirmed_at: '2026-07-30T00:00:00Z',
      app_metadata: { provider: 'google', providers: ['google'] },
    }),
    true
  )
})

// ── Where an emailed link is allowed to land ────────────────────────────────

test('links for accounts with no working password land on set-password', () => {
  assert.equal(landsOnPasswordSetup('recovery'), true)
  assert.equal(landsOnPasswordSetup('invite'), true)
})

test('a signup confirmation goes to its destination, not set-password', () => {
  // That account already chose a password; interrupting it to choose another
  // would be a pointless step in the middle of the claim journey.
  assert.equal(landsOnPasswordSetup('signup'), false)
})

test('unknown link types are not treated as password setup', () => {
  assert.equal(landsOnPasswordSetup('email_change'), false)
  assert.equal(landsOnPasswordSetup(undefined), false)
  // 'magiclink' was removed from the platform: accounts sign in with a
  // password. If this ever returns true again, passwordless sign-in is back.
  assert.equal(landsOnPasswordSetup('magiclink'), false)
})
