// Unit tests for the claim-note merge rule.
//
// Run with:  node --test lib/claims/adminNotes.test.mjs
//
// The case that matters is the first one. Approving a claim without typing a
// note is the overwhelmingly common path, and it used to destroy the intake
// provenance — silently, on every approval. These tests exist so that can never
// come back without a red test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeAdminNotes } from './adminNotes.mjs'

const INTAKE = 'Synced from sba vertical.'
const FORM_INTAKE = 'Role: owner. Tier: free. Domain: wombatforestwines.com'

test('a blank moderator note never erases the intake provenance', () => {
  // The regression this whole module exists for.
  assert.equal(mergeAdminNotes(INTAKE, '', 'on approval'), INTAKE)
  assert.equal(mergeAdminNotes(INTAKE, null, 'on approval'), INTAKE)
  assert.equal(mergeAdminNotes(INTAKE, undefined, 'on approval'), INTAKE)
  assert.equal(mergeAdminNotes(FORM_INTAKE, '   ', 'on approval'), FORM_INTAKE)
})

test('a typed note is appended to the intake note, not substituted for it', () => {
  const merged = mergeAdminNotes(INTAKE, 'Verified by phone with Dee.', 'on approval')
  assert.ok(merged.includes(INTAKE), 'intake provenance survives')
  assert.ok(merged.includes('Verified by phone with Dee.'), 'moderator note survives')
  assert.equal(merged, `${INTAKE}\n— on approval: Verified by phone with Dee.`)
})

test('the occasion distinguishes an approval note from a rejection note', () => {
  assert.equal(
    mergeAdminNotes(INTAKE, 'Domain did not match.', 'on rejection'),
    `${INTAKE}\n— on rejection: Domain did not match.`
  )
})

test('a typed note stands alone when there is no prior note', () => {
  assert.equal(mergeAdminNotes(null, 'Granted as a comp.', 'on approval'), 'Granted as a comp.')
  assert.equal(mergeAdminNotes('', 'Granted as a comp.', 'on approval'), 'Granted as a comp.')
})

test('nothing on either side stores NULL rather than an empty string', () => {
  // An empty string would read as "a moderator wrote nothing here on purpose";
  // NULL is the honest "no note exists".
  assert.equal(mergeAdminNotes(null, null, 'on approval'), null)
  assert.equal(mergeAdminNotes('', '', 'on approval'), null)
  assert.equal(mergeAdminNotes('  ', '  ', 'on approval'), null)
})

test('surrounding whitespace never survives into storage', () => {
  assert.equal(mergeAdminNotes('  ' + INTAKE + '  ', '  note  ', 'on approval'), `${INTAKE}\n— on approval: note`)
})

test('repeated approvals do not duplicate the provenance line', () => {
  // Idempotency guard: re-approving with no new note leaves the row unchanged,
  // so an accidental double-click cannot grow the note without bound.
  const once = mergeAdminNotes(INTAKE, 'checked', 'on approval')
  const twice = mergeAdminNotes(once, '', 'on approval')
  assert.equal(twice, once)
})
