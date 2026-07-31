import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOpenIntervals, parseWeekdayTextLine, openForSlot, localDayName, SLOT_WINDOWS } from './openHours.mjs'

// A Wednesday in NSW: 2026-08-05T02:00:00Z is 12:00 midday AEST.
const WEDNESDAY = new Date('2026-08-05T02:00:00Z')

const regular = (days) => ({
  opening_hours: {
    regular: {
      monday: [], tuesday: [], wednesday: [], thursday: [],
      friday: [], saturday: [], sunday: [],
      ...days,
    },
  },
  state: 'NSW',
})

// ── Rule one: closed on the day → never shown ───────────────────────

test('a venue closed all day today carries no slot at all', () => {
  const closedWednesday = regular({ thursday: [{ open: '09:00', close: '17:00' }] })
  for (const slot of ['morning', 'midmorning', 'midday', 'afternoon', 'tasting']) {
    assert.equal(openForSlot(closedWednesday, slot, WEDNESDAY), false, slot)
  }
})

test('the same venue is dealt normally on a day it opens', () => {
  const openWednesday = regular({ wednesday: [{ open: '09:00', close: '17:00' }] })
  for (const slot of ['morning', 'midmorning', 'midday', 'afternoon']) {
    assert.equal(openForSlot(openWednesday, slot, WEDNESDAY), true, slot)
  }
})

// ── Rule two: open today, but not at that hour → not that slot ──────

test('a dinner-only restaurant cannot be dealt as lunch', () => {
  const dinnerOnly = regular({ wednesday: [{ open: '17:00', close: '23:00' }] })
  assert.equal(openForSlot(dinnerOnly, 'midday', WEDNESDAY), false)
  assert.equal(openForSlot(dinnerOnly, 'morning', WEDNESDAY), false)
})

test('a morning-only roastery keeps its morning and loses the tasting', () => {
  const morningOnly = regular({ wednesday: [{ open: '07:00', close: '11:00' }] })
  assert.equal(openForSlot(morningOnly, 'morning', WEDNESDAY), true)
  assert.equal(openForSlot(morningOnly, 'tasting', WEDNESDAY), false)
})

test('a cellar door closing at four still makes the tasting window', () => {
  const cellarDoor = regular({ wednesday: [{ open: '10:00', close: '16:00' }] })
  assert.equal(openForSlot(cellarDoor, 'tasting', WEDNESDAY), true)
})

// ── Absence of data is not a closure ────────────────────────────────

test('no hours at all passes every slot', () => {
  const waterfall = { state: 'NSW' }
  for (const slot of Object.keys(SLOT_WINDOWS)) {
    assert.equal(openForSlot(waterfall, slot, WEDNESDAY), true, slot)
  }
})

test('appointment-only prose with no schedule passes (unknown, not closed)', () => {
  const prose = { state: 'VIC', opening_hours: { human: 'By appointment — check ahead' } }
  assert.equal(openForSlot(prose, 'midday', WEDNESDAY), true)
})

// ── The stay slot is exempt ─────────────────────────────────────────

test('accommodation is never hours-gated: reception hours are not the stay', () => {
  const shutReception = { ...regular({}), vertical: 'rest' }
  assert.equal(openForSlot(shutReception, 'stay', WEDNESDAY), true)
})

// ── Source formats ──────────────────────────────────────────────────

test('operator hours: a listed day opens, an unlisted day is closed', () => {
  const bakery = {
    state: 'NSW',
    hours: { wednesday: { open: '07:30', close: '16:00' }, thursday: { open: '07:30', close: '16:00' } },
  }
  assert.equal(openForSlot(bakery, 'morning', WEDNESDAY), true)
  const SUNDAY = new Date('2026-08-09T02:00:00Z')
  assert.equal(openForSlot(bakery, 'morning', SUNDAY), false)
})

test('weekday_text: shared meridiem, closed and 24 hours all read', () => {
  assert.deepEqual(parseWeekdayTextLine('Tuesday: 4:00 – 11:00 PM'), [[16 * 60, 23 * 60]])
  assert.deepEqual(parseWeekdayTextLine('Monday: Closed'), [])
  assert.deepEqual(parseWeekdayTextLine('Friday: Open 24 hours'), [[0, 1440]])
  assert.deepEqual(parseWeekdayTextLine('Saturday: 9:30 AM – 2:00 PM'), [[570, 840]])
})

test('weekday_text-only venue: dinner house is closed to lunch, open to nothing on Monday', () => {
  const pub = {
    state: 'NSW',
    opening_hours: { weekday_text: ['Monday: Closed', 'Wednesday: 5:00 PM – 12:00 AM'] },
  }
  assert.equal(openForSlot(pub, 'midday', WEDNESDAY), false)
  const MONDAY = new Date('2026-08-03T02:00:00Z')
  assert.equal(openForSlot(pub, 'midday', MONDAY), false)
})

test('closing past midnight clamps to end of day instead of vanishing', () => {
  const bar = regular({ wednesday: [{ open: '15:00', close: '00:00' }] })
  assert.equal(openForSlot(bar, 'tasting', WEDNESDAY), true)
  assert.equal(openForSlot(bar, 'morning', WEDNESDAY), false)
})

test('an unreadable interval is unknown for that day, not a closure', () => {
  const garbled = regular({ wednesday: [{ open: 'ten-ish', close: 'late' }] })
  assert.equal(openForSlot(garbled, 'midday', WEDNESDAY), true)
})

// ── Timezones ───────────────────────────────────────────────────────

test('one instant is Saturday in Sydney and still Friday in Perth', () => {
  const instant = new Date('2026-07-31T15:00:00Z')
  assert.equal(localDayName('NSW', instant), 'saturday')
  assert.equal(localDayName('WA', instant), 'friday')
})
