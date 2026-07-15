// ============================================================
// Outreach email templates
// ------------------------------------------------------------
// One generic default plus per-vertical variants. Each body is plain text with
// {{merge tokens}} — personalisation happens per-recipient at render time
// (lib/outreach/template.js). Pure data so it's safe to import from both the
// admin client UI (the template picker) and the send route.
//
// Voice: restrained, specific, anti-chain. No hospitality cliché. {{personal_note}}
// is the AI-written opener (may be empty — renderEmail collapses the gap).
// ============================================================

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

const CLAIM_BLOCK = `We'd love for you to claim the listing so you can tell your own story, add photos, and keep the details right. It's quick and free:

{{claim_url}}

If it's not the right fit, no worries at all — just ignore this note.`

function make(intro) {
  return `Hi,

{{personal_note}}

${intro} It's already live and being discovered here:

{{place_url}}

${CLAIM_BLOCK}

${SIGNOFF}`
}

export const GENERIC_TEMPLATE = {
  subject: '{{name}} is on Australian Atlas',
  body: make(`We've been building Australian Atlas — a curated guide to independent Australian places — and we've listed {{name}} as part of our guide to independent {{region}}.`),
}

// Per-vertical variants keyed by the portal vertical code. Anything not listed
// falls back to GENERIC_TEMPLATE.
export const VERTICAL_TEMPLATES = {
  sba: {
    subject: '{{name}} — on our guide to independent makers',
    body: make(`We've listed {{name}} in Australian Atlas, our curated guide to independent Australian producers, as one of the small-batch makers worth knowing in {{region}}.`),
  },
  table: {
    subject: '{{name}} is on Australian Atlas',
    body: make(`We've listed {{name}} in Australian Atlas — our curated guide to independent places to eat and drink — as one of the tables worth travelling for in {{region}}.`),
  },
  fine_grounds: {
    subject: '{{name}} — on our independent coffee guide',
    body: make(`We've listed {{name}} in Australian Atlas, our guide to independent cafes and roasters, as one of the good coffee stops in {{region}}.`),
  },
  rest: {
    subject: '{{name}} — on our guide to independent stays',
    body: make(`We've listed {{name}} in Australian Atlas, our curated guide to independent places to stay, as one of the distinctive stays in {{region}}.`),
  },
  collection: {
    subject: '{{name}} is on Australian Atlas',
    body: make(`We've listed {{name}} in Australian Atlas — our guide to independent galleries and cultural spaces — as one of the places worth seeking out in {{region}}.`),
  },
  craft: {
    subject: '{{name}} — on our guide to independent makers',
    body: make(`We've listed {{name}} in Australian Atlas, our curated guide to independent maker studios and workshops, as one of the studios worth knowing in {{region}}.`),
  },
  corner: {
    subject: '{{name}} is on Australian Atlas',
    body: make(`We've listed {{name}} in Australian Atlas — our guide to the independent neighbourhood shops worth a detour — as one to know in {{region}}.`),
  },
  found: {
    subject: '{{name}} is on Australian Atlas',
    body: make(`We've listed {{name}} in Australian Atlas — our guide to the best vintage, second-hand and one-off finds — as one worth a look in {{region}}.`),
  },
  way: {
    subject: '{{name}} — on our guide to independent experiences',
    body: make(`We've listed {{name}} in Australian Atlas, our curated guide to independent tours and experiences, as one worth doing in {{region}}.`),
  },
}

export function templateForVertical(vertical) {
  return VERTICAL_TEMPLATES[vertical] || GENERIC_TEMPLATE
}

// Second (and final) touch, sent by the autopilot ~a week after the first
// email to recipients who haven't claimed, replied, or unsubscribed. Short,
// no pressure, and explicit that the thread ends here — two touches is the
// ceiling for unsolicited outreach.
export const FOLLOWUP_TEMPLATE = {
  subject: 'Still time to claim {{name}} on Australian Atlas',
  body: `Hi,

A quick follow-up on my earlier note — {{name}} is live on Australian Atlas, our curated guide to independent {{region}}, and travellers are already finding it:

{{place_url}}

Claiming the listing is free and takes about a minute. You can add photos, set your hours, and tell the story in your own words:

{{claim_url}}

If it's not for you, no need to do anything — this is the last note from me either way.

${SIGNOFF}`,
}

// Options for the admin template-picker dropdown.
export const TEMPLATE_OPTIONS = [
  { value: '', label: 'Generic (all verticals)' },
  { value: 'sba', label: 'Small Batch — producers' },
  { value: 'table', label: 'Table — eat & drink' },
  { value: 'fine_grounds', label: 'Fine Grounds — cafes' },
  { value: 'rest', label: 'Rest — stays' },
  { value: 'collection', label: 'Culture — galleries' },
  { value: 'craft', label: 'Craft — studios' },
  { value: 'corner', label: 'Corner — shops' },
  { value: 'found', label: 'Found — vintage' },
  { value: 'way', label: 'Way — experiences' },
]

// Kept for backwards-compat with the send route's earlier import.
export const DEFAULT_TEMPLATE = GENERIC_TEMPLATE
