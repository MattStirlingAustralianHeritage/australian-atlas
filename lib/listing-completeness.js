/**
 * The five things that make an operator's listing usable to a visitor.
 *
 * Both the dashboard Overview card and the listing editor show a completeness
 * score, and they used to compute it from two separate hard-coded lists — so
 * an operator could be told "2/5" in one place and see a different set of
 * missing items in the other. This is the single definition both read.
 *
 * `panel` maps each check to the editor panel that fixes it, so a prompt can
 * link straight to the right place instead of dropping the operator at the top
 * of the editor to hunt for it.
 */

export const COMPLETENESS_CHECKS = [
  {
    field: 'description',
    label: 'Description',
    action: 'Write your description',
    hint: 'Listings with descriptions get 3× more engagement',
    panel: 'story',
  },
  {
    field: 'hero_image_url',
    label: 'Cover photo',
    action: 'Add a cover photo',
    hint: 'A photo is the difference between a scroll past and a click',
    panel: 'cover',
  },
  {
    field: 'hours',
    label: 'Opening hours',
    action: 'Add opening hours',
    hint: 'Listings with hours get seen 40% more',
    panel: 'basics',
  },
  {
    field: 'website',
    label: 'Website',
    action: 'Add your website',
    hint: 'Help visitors find your site',
    panel: 'basics',
  },
  {
    field: 'phone',
    label: 'Phone number',
    action: 'Add a phone number',
    hint: 'Help people find you',
    panel: 'basics',
  },
]

/**
 * Score a listing. Pass `overrides` to score against unsaved editor state
 * (e.g. `{ website, phone, hours, hero_image_url }` currently in the form)
 * rather than what's persisted, so the meter moves as the operator types.
 */
export function getCompleteness(listing, overrides = {}) {
  const source = { ...(listing || {}), ...overrides }
  const checks = COMPLETENESS_CHECKS.map(c => ({
    ...c,
    complete: !!(typeof source[c.field] === 'string' ? source[c.field].trim() : source[c.field]),
  }))
  const complete = checks.filter(c => c.complete).length
  return {
    checks,
    complete,
    total: checks.length,
    remaining: checks.filter(c => !c.complete),
    allComplete: complete === checks.length,
  }
}
