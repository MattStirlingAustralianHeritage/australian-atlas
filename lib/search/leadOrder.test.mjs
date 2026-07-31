import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadWithVertical, findNameMatchPins, applyLeadOrder } from './leadOrder.js'

const row = (id, vertical, name, extra = {}) => ({ id, vertical, name, ...extra })

test('leadWithVertical groups the detected atlas first, stable within groups', () => {
  const rows = [row(1, 'craft', 'A'), row(2, 'collection', 'B'), row(3, 'craft', 'C'), row(4, 'collection', 'D')]
  assert.deepEqual(leadWithVertical(rows, 'collection').map((r) => r.id), [2, 4, 1, 3])
  assert.deepEqual(leadWithVertical(rows, null).map((r) => r.id), [1, 2, 3, 4])
})

test('an exact-name hit is pinned ahead of the atlas lead', () => {
  // The production bug: "Feather and Lawry Gallery" (craft) fused #1, but the
  // "gallery" intent led with collection rows and buried it below page 1.
  const rows = [
    row(1, 'craft', 'Feather & Lawry Gallery', { suburb: 'Toowoomba City', state: 'QLD' }),
    ...Array.from({ length: 30 }, (_, i) => row(100 + i, 'collection', `Gallery ${i}`)),
  ]
  const pins = findNameMatchPins(rows, 'Feather and Lawry Gallery')
  assert.equal(pins.length, 1)
  assert.equal(pins[0].id, 1)
  const ordered = applyLeadOrder(rows, 'collection', pins)
  assert.equal(ordered[0].id, 1, 'name match stays #1 despite the collection lead')
  assert.equal(ordered[1].id, 100, 'atlas lead follows')
  assert.equal(ordered.length, rows.length, 'no rows dropped or duplicated')
})

test('category queries pin nothing', () => {
  const rows = [row(1, 'sba', 'Deep South Brewing Co.'), row(2, 'sba', 'Hobart Brewing Company')]
  assert.deepEqual(findNameMatchPins(rows, 'craft brewery'), [])
  assert.deepEqual(applyLeadOrder(rows, 'sba', []).map((r) => r.id), [1, 2])
})

test('a name match below the scan depth is not pinned (no page-deep jumps)', () => {
  const rows = [
    row(1, 'collection', 'Gallery One'),
    row(2, 'collection', 'Gallery Two'),
    row(3, 'collection', 'Gallery Three'),
    row(4, 'craft', 'Feather & Lawry Gallery'),
  ]
  assert.deepEqual(findNameMatchPins(rows, 'Feather and Lawry Gallery'), [])
})
