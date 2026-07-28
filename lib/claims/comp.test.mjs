// Unit tests for comped-Standard term logic.
//
// Run with:  node --test lib/claims/comp.test.mjs
//
// The date arithmetic is the reason this file exists. A comp granted on the
// 31st must not gain days by overflowing into the next month, and "in
// perpetuity" must stay distinguishable from "expired" — get either wrong and
// an operator is either billed-in-effect early or comped forever by accident.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMP_DURATIONS,
  DEFAULT_COMP_DURATION,
  addMonthsUTC,
  compDurationLabel,
  compExpiryFromDuration,
  compStatus,
  isComped,
  isCompLapsed,
  isValidCompDuration,
} from './comp.mjs'

// ─── Duration catalogue ──────────────────────────────────

test('offers one month through to in perpetuity', () => {
  const keys = COMP_DURATIONS.map(d => d.key)
  assert.ok(keys.includes('1m'), 'shortest offer is one month')
  assert.ok(keys.includes('perpetual'), 'longest offer is in perpetuity')
  assert.equal(COMP_DURATIONS.find(d => d.key === 'perpetual').months, null)
  assert.ok(isValidCompDuration(DEFAULT_COMP_DURATION))
})

test('rejects unknown durations', () => {
  assert.equal(isValidCompDuration('99y'), false)
  assert.equal(isValidCompDuration(''), false)
  assert.equal(isValidCompDuration(undefined), false)
  assert.throws(() => compExpiryFromDuration('99y'), /Unknown comp duration/)
})

test('labels every offered duration', () => {
  for (const d of COMP_DURATIONS) {
    assert.equal(compDurationLabel(d.key), d.label)
  }
})

// ─── Month arithmetic ────────────────────────────────────

test('adds whole months', () => {
  const from = new Date('2026-07-28T04:00:00.000Z')
  assert.equal(addMonthsUTC(from, 1).toISOString(), '2026-08-28T04:00:00.000Z')
  assert.equal(addMonthsUTC(from, 12).toISOString(), '2027-07-28T04:00:00.000Z')
})

test('clamps to the last day instead of overflowing the month', () => {
  // 31 Jan + 1 month is 28 Feb, NOT 3 March. Naive setMonth() gets this wrong
  // and silently hands the operator three extra days.
  const jan31 = new Date('2026-01-31T00:00:00.000Z')
  assert.equal(addMonthsUTC(jan31, 1).toISOString(), '2026-02-28T00:00:00.000Z')

  // Leap year keeps the 29th.
  const jan31Leap = new Date('2028-01-31T00:00:00.000Z')
  assert.equal(addMonthsUTC(jan31Leap, 1).toISOString(), '2028-02-29T00:00:00.000Z')

  // 31 Aug + 1 month is 30 Sep.
  const aug31 = new Date('2026-08-31T00:00:00.000Z')
  assert.equal(addMonthsUTC(aug31, 1).toISOString(), '2026-09-30T00:00:00.000Z')
})

test('crosses the year boundary', () => {
  const nov = new Date('2026-11-15T00:00:00.000Z')
  assert.equal(addMonthsUTC(nov, 3).toISOString(), '2027-02-15T00:00:00.000Z')
})

// ─── Expiry resolution ───────────────────────────────────

test('in perpetuity resolves to no expiry at all', () => {
  assert.equal(compExpiryFromDuration('perpetual'), null)
})

test('a term resolves to an expiry that many months out', () => {
  const from = new Date('2026-07-28T00:00:00.000Z')
  assert.equal(compExpiryFromDuration('1m', from), '2026-08-28T00:00:00.000Z')
  assert.equal(compExpiryFromDuration('6m', from), '2027-01-28T00:00:00.000Z')
  assert.equal(compExpiryFromDuration('24m', from), '2028-07-28T00:00:00.000Z')
})

// ─── What counts as a comp ───────────────────────────────

test('only unpaid Standard is a comp', () => {
  assert.equal(isComped({ tier: 'standard', stripe_subscription_id: null }), true)
  assert.equal(isComped({ tier: 'standard', stripe_subscription_id: 'sub_123' }), false, 'Stripe-billed is paid, not comped')
  assert.equal(isComped({ tier: 'free', stripe_subscription_id: null }), false)
  assert.equal(isComped(null), false)
})

// ─── Lapsing ─────────────────────────────────────────────

const NOW = new Date('2026-07-28T12:00:00.000Z')

test('a perpetual comp never lapses', () => {
  const row = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: null }
  assert.equal(isCompLapsed(row, NOW), false)
  assert.equal(compStatus(row, NOW).perpetual, true)
  assert.equal(compStatus(row, NOW).paid, true)
})

test('a comp lapses once its term has passed', () => {
  const expired = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: '2026-07-28T11:59:59.000Z' }
  assert.equal(isCompLapsed(expired, NOW), true)
  assert.equal(compStatus(expired, NOW).paid, false, 'a lapsed comp must not read as paid')

  const running = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: '2026-07-28T12:00:01.000Z' }
  assert.equal(isCompLapsed(running, NOW), false)
  assert.equal(compStatus(running, NOW).paid, true)
})

test('the boundary instant counts as lapsed', () => {
  const exactly = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: NOW.toISOString() }
  assert.equal(isCompLapsed(exactly, NOW), true)
})

test('a Stripe-billed claim never lapses through comp logic', () => {
  // The CHECK constraint in migration 261 forbids this row shape, but the gate
  // must not depend on the constraint holding: a paying operator losing their
  // features to a stray expiry is the lockout class this repo has sworn off.
  const paying = { tier: 'standard', stripe_subscription_id: 'sub_123', comp_expires_at: '2020-01-01T00:00:00.000Z' }
  assert.equal(isCompLapsed(paying, NOW), false)
  assert.equal(compStatus(paying, NOW).paid, true)
})

test('a free claim is never paid, comped or lapsed', () => {
  const free = { tier: 'free', stripe_subscription_id: null, comp_expires_at: null }
  const s = compStatus(free, NOW)
  assert.deepEqual(
    { paid: s.paid, comped: s.comped, lapsed: s.lapsed },
    { paid: false, comped: false, lapsed: false }
  )
})

// ─── Days remaining (drives the admin countdown) ─────────

test('counts the days left, and stops counting once lapsed', () => {
  const in10Days = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: '2026-08-07T12:00:00.000Z' }
  assert.equal(compStatus(in10Days, NOW).daysRemaining, 10)

  const gone = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: '2026-07-01T12:00:00.000Z' }
  assert.equal(compStatus(gone, NOW).daysRemaining, null)

  const forever = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: null }
  assert.equal(compStatus(forever, NOW).daysRemaining, null)
})

// ─── Round trip: grant a term, then check it holds ───────

test('a granted term is live the day before it ends and dead the day after', () => {
  const grantedAt = new Date('2026-07-28T00:00:00.000Z')
  const expiry = compExpiryFromDuration('3m', grantedAt)
  const row = { tier: 'standard', stripe_subscription_id: null, comp_expires_at: expiry }

  assert.equal(isCompLapsed(row, new Date('2026-10-27T00:00:00.000Z')), false)
  assert.equal(isCompLapsed(row, new Date('2026-10-29T00:00:00.000Z')), true)
})
