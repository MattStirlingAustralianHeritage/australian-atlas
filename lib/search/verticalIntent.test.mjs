import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectVerticalIntent } from './verticalIntent.js'

test('category queries detect their atlas', () => {
  assert.equal(detectVerticalIntent('craft brewery near hobart')?.vertical, 'sba')
  assert.equal(detectVerticalIntent('specialty coffee')?.vertical, 'fine_grounds')
  assert.equal(detectVerticalIntent('quiet farm stay')?.vertical, 'rest')
  assert.equal(detectVerticalIntent('plant nursery')?.vertical, 'corner')
  assert.equal(detectVerticalIntent('chocolatiers in melbourne')?.vertical, 'craft')
  assert.equal(detectVerticalIntent('best café in fitzroy')?.vertical, 'fine_grounds')
})

test('longest keyword wins over its substring', () => {
  // "boutique stay" (rest) must beat bare "stay"; "specialty coffee" beats "coffee"
  assert.equal(detectVerticalIntent('boutique stay yarra valley')?.keyword, 'boutique stay')
  assert.equal(detectVerticalIntent('specialty coffee roaster')?.keyword, 'specialty coffee')
})

test('keywords no longer fire from inside other words', () => {
  // substring era: 'gin' matched "ginger", 'stay' matched "staysail"
  assert.equal(detectVerticalIntent('ginger factory'), null)
  assert.equal(detectVerticalIntent('staysail marine supplies'), null)
  assert.equal(detectVerticalIntent('vineyard')?.vertical ?? null, null) // 'wine' must not fire inside "vineyard"... but 'winery' related terms may
})

test('bare place names carry no intent', () => {
  assert.equal(detectVerticalIntent('apollo bay'), null)
  assert.equal(detectVerticalIntent('broulee'), null)
})
