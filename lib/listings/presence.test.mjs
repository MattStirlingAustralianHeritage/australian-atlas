import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isByAppointment,
  setByAppointment,
  normalisePresencePair,
  hasPreciseLocation,
} from './presence.js'

// The switch's whole job: a permanent venue can say "come by arrangement"
// without becoming something else.
test('switching on a permanent venue sets the scalar and seeds the array', () => {
  const next = setByAppointment(true, { presence_type: 'permanent', presence_types: null })
  assert.equal(next.presence_type, 'by_appointment')
  assert.deepEqual(next.presence_types, ['by_appointment'])
})

test('switching off returns to permanent', () => {
  const next = setByAppointment(false, { presence_type: 'by_appointment', presence_types: ['by_appointment'] })
  assert.equal(next.presence_type, 'permanent')
  assert.equal(next.presence_types, null)
})

// The bug this helper exists to prevent: a maker who sells at markets AND takes
// studio visits must not lose the markets mode either way the switch moves.
test('another presence mode survives the switch in both directions', () => {
  const on = setByAppointment(true, { presence_type: 'markets', presence_types: ['markets'] })
  assert.equal(on.presence_type, 'by_appointment', 'by_appointment wins the priority order')
  assert.deepEqual(on.presence_types, ['by_appointment', 'markets'])

  const off = setByAppointment(false, on)
  assert.equal(off.presence_type, 'markets', 'falls back to what is left, not to permanent')
  assert.deepEqual(off.presence_types, ['markets'])
})

test('a mobile venue stays mobile when the switch goes off', () => {
  const next = setByAppointment(false, { presence_type: 'mobile', presence_types: null })
  assert.equal(next.presence_type, 'mobile')
  assert.equal(next.presence_types, null)
})

// Rows created before migration 200 carry only the scalar.
test('isByAppointment reads a legacy row with no array', () => {
  assert.equal(isByAppointment({ presence_type: 'by_appointment', presence_types: null }), true)
  assert.equal(isByAppointment({ presence_type: 'online', presence_types: ['online', 'by_appointment'] }), true)
  assert.equal(isByAppointment({ presence_type: 'permanent', presence_types: null }), false)
  assert.equal(isByAppointment(null), false)
})

test('turning the switch on twice is idempotent', () => {
  const once = setByAppointment(true, { presence_type: 'permanent', presence_types: null })
  const twice = setByAppointment(true, once)
  assert.deepEqual(twice, once)
})

test('normalisePresencePair drops the array for the visitable-by-default modes', () => {
  assert.deepEqual(
    normalisePresencePair('permanent', ['by_appointment']),
    { presence_type: 'permanent', presence_types: null }
  )
  assert.deepEqual(
    normalisePresencePair('mobile', ['markets']),
    { presence_type: 'mobile', presence_types: null }
  )
})

test('normalisePresencePair always keeps the scalar inside the array', () => {
  assert.deepEqual(
    normalisePresencePair('by_appointment', ['markets']),
    { presence_type: 'by_appointment', presence_types: ['by_appointment', 'markets'] }
  )
  // Junk values (a hand-rolled API call, a stale client) are dropped, not stored.
  assert.deepEqual(
    normalisePresencePair('by_appointment', ['markets', 'markets', 'nonsense']),
    { presence_type: 'by_appointment', presence_types: ['by_appointment', 'markets'] }
  )
})

// A by-appointment studio is still a real address on a real street — the map
// gate must keep drawing its pin unless the address is explicitly withheld.
test('by appointment alone does not suppress the map pin', () => {
  const studio = { lat: -35.27, lng: 149.13, presence_type: 'by_appointment', presence_types: ['by_appointment'] }
  assert.equal(hasPreciseLocation(studio), true)
  assert.equal(hasPreciseLocation({ ...studio, address_on_request: true }), false)
})
