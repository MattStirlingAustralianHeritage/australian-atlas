/**
 * Status transition state machine for editorial trails.
 * Mirrors article workflow conventions (draft → in_review → published → archived).
 */

const TRANSITIONS = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'published'],   // 'draft' is the "return to draft with notes" path
  published: ['archived'],
  archived: ['draft'],                 // resurrection path
}

const ACTION_TO_STATE = {
  submit_for_review: 'in_review',
  approve_publish: 'published',
  return_to_draft: 'draft',
  unpublish: 'archived',
  resurrect: 'draft',
}

export function isValidTransition(from, to) {
  if (!from) return false
  return (TRANSITIONS[from] || []).includes(to)
}

export function actionToTargetState(action) {
  return ACTION_TO_STATE[action] ?? null
}

export { TRANSITIONS, ACTION_TO_STATE }
