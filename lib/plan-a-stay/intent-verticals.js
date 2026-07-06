/* ═══════════════════════════════════════════════════════════════════════
   Intent → vertical mapping for Plan-a-Stay
   ═══════════════════════════════════════════════════════════════════════
   Single source of truth — consumed by:
     • /api/plan-a-stay/retrieve  (candidate query scoping + ranking)
     • /api/plan-a-stay/recommend (region recommendation scoring)        */

export const INTENT_VERTICAL_MAP = {
  'food-and-producers': {
    primary: ['sba', 'table'],
    secondary: ['field'],
  },
  'landscape-and-walking': {
    primary: ['field'],
    secondary: [],
  },
  'makers-and-craft': {
    primary: ['craft', 'collection'],
    secondary: [],
  },
  'quiet-and-slow': {
    primary: ['rest', 'found', 'corner'],
    secondary: [],
  },
  'a-bit-of-everything': {
    primary: ['table', 'craft', 'field', 'sba', 'rest'],
    secondary: ['collection', 'found', 'corner', 'fine_grounds'],
  },
}

export function resolveVerticals(intents) {
  const primary = new Set()
  const secondary = new Set()
  for (const intent of intents || []) {
    const mapping = INTENT_VERTICAL_MAP[intent]
    if (!mapping) continue
    mapping.primary.forEach(v => primary.add(v))
    mapping.secondary.forEach(v => { if (!primary.has(v)) secondary.add(v) })
  }
  return { primary: [...primary], secondary: [...secondary] }
}
