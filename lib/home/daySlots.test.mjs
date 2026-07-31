import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY_TRIP_SLOTS, slotEligible, TABLE_LUNCH, MORNING_TABLE } from './daySlots.mjs'

// ── What a worked day may not contain ───────────────────────────────

// The Ben Adams case: a furniture maker with a showroom passes every
// data gate (active, described, trail_suitable=true) and still must
// never carry a slot — visitable is not the same as visit-worthy.
test('a furniture maker never carries a slot, however clean its row', () => {
  assert.equal(slotEligible({ vertical: 'craft', sub_type: 'wood_furniture' }), false)
})

test('commission-led makers are out even when claimed', () => {
  for (const sub_type of ['wood_furniture', 'jewellery_metalwork', 'textile_fibre', 'leathermaker', 'shoemaker', 'clothing']) {
    assert.equal(
      slotEligible({ vertical: 'craft', sub_type, is_claimed: true }), false,
      `craft/${sub_type} should not be day-eligible`
    )
  }
})

test('supply runs are not stops: nurseries and bottle shops are out', () => {
  assert.equal(slotEligible({ vertical: 'corner', sub_type: 'nursery' }), false)
  assert.equal(slotEligible({ vertical: 'corner', sub_type: 'bottle_shop' }), false)
  assert.equal(slotEligible({ vertical: 'corner', sub_type: 'plants' }), false)
})

test('evening rooms are not daytime stops: cinemas and drive-ins are out', () => {
  assert.equal(slotEligible({ vertical: 'collection', sub_type: 'cinema' }), false)
  assert.equal(slotEligible({ vertical: 'collection', sub_type: 'drive_in' }), false)
})

test('way experiences stay out of the worked day entirely', () => {
  assert.equal(slotEligible({ vertical: 'way', sub_type: 'cultural_tour' }), false)
})

// ── What it may contain ─────────────────────────────────────────────

test('gallery-like craft is browsable and in', () => {
  for (const sub_type of ['visual_art', 'ceramics_clay', 'glass', 'printmaking']) {
    assert.equal(slotEligible({ vertical: 'craft', sub_type }), true, `craft/${sub_type} should be day-eligible`)
  }
})

test('the classic day-out stops all qualify', () => {
  assert.equal(slotEligible({ vertical: 'fine_grounds', sub_type: 'roaster' }), true)
  assert.equal(slotEligible({ vertical: 'collection', sub_type: 'museum' }), true)
  assert.equal(slotEligible({ vertical: 'found', sub_type: 'antiques' }), true)
  assert.equal(slotEligible({ vertical: 'corner', sub_type: 'bookshop' }), true)
  assert.equal(slotEligible({ vertical: 'field', sub_type: 'waterfall' }), true)
  assert.equal(slotEligible({ vertical: 'sba', sub_type: 'winery' }), true)
  assert.equal(slotEligible({ vertical: 'rest', sub_type: 'farm_stay' }), true)
})

// ── The lunch slot names sub_types that exist ───────────────────────

// Regression: the old midday pref listed 'pub' and 'bistro', which no
// row carries — the live sub_type is 'historic_pub'. A preference for
// a phantom sub_type silently never matches.
test('lunch preferences use live sub_types, historic_pub included', () => {
  assert.ok(TABLE_LUNCH.includes('historic_pub'))
  assert.ok(!TABLE_LUNCH.includes('pub'))
  assert.ok(!TABLE_LUNCH.includes('bistro'))
})

test('lunch comes from the table vertical or not at all', () => {
  const midday = DAY_TRIP_SLOTS.find(s => s.slot === 'midday')
  assert.ok(midday.prefs.every(([vertical]) => vertical === 'table'))
})

// ── Breakfast must not eat lunch ────────────────────────────────────

// In a region with no coffee listing, morning falls through to a
// bakery breakfast from the table vertical. Both table prefs are
// marked shared so that fallback doesn't consume the vertical and
// cost the day its lunch — and the shared pair must stay sub_type
// disjoint, or one bakery could be seated at two slots.
test('the morning table fallback and lunch are shared and disjoint', () => {
  const morning = DAY_TRIP_SLOTS.find(s => s.slot === 'morning')
  const midday = DAY_TRIP_SLOTS.find(s => s.slot === 'midday')
  const morningTable = morning.prefs.find(([v]) => v === 'table')
  const middayTable = midday.prefs.find(([v]) => v === 'table')
  assert.equal(morningTable[2]?.shared, true)
  assert.equal(middayTable[2]?.shared, true)
  for (const st of morningTable[1]) {
    assert.ok(!middayTable[1].includes(st), `'${st}' appears in both table lists`)
  }
})

test('every shared pref carries an explicit sub_type list', () => {
  for (const { slot, prefs } of DAY_TRIP_SLOTS) {
    for (const [v, subTypes, opts] of prefs) {
      if (opts?.shared) {
        assert.ok(Array.isArray(subTypes) && subTypes.length > 0,
          `${slot}/${v} is shared but has no sub_type list to keep it disjoint`)
      }
    }
  }
})

// ── Slot structure the page relies on ───────────────────────────────

test('the day still deals six slots ending in a bed', () => {
  assert.equal(DAY_TRIP_SLOTS.length, 6)
  assert.deepEqual(DAY_TRIP_SLOTS.map(s => s.slot),
    ['morning', 'midmorning', 'midday', 'afternoon', 'tasting', 'stay'])
  assert.deepEqual(DAY_TRIP_SLOTS.at(-1).prefs, [['rest']])
})
