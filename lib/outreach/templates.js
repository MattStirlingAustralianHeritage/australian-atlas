// ============================================================
// Outreach email templates
// ------------------------------------------------------------
// One editorial listing template — used for every vertical — plus the second
// (follow-up) touch. Each body is plain text with {{merge tokens}};
// personalisation happens per-recipient at render time
// (lib/outreach/template.js). Pure data so it's safe to import from both the
// admin client UI (the template picker) and the send route.
//
// Voice: first-person, editorial, plain — no hospitality cliché. The
// per-listing specificity comes from {{personal_note}} (the AI-written opener)
// and {{description}} (our editorial line for the listing), not from
// hard-coded per-vertical phrasing. Both tokens may be empty — renderEmail
// collapses the blank gap they leave behind.
// ============================================================

// The listing outreach email. One voice for every vertical.
export const GENERIC_TEMPLATE = {
  subject: 'We wrote about {{name}}',
  body: `Hi,

{{personal_note}}

I run Australian Atlas, an editorial guide to independent places around the country. We chose {{name}} for our guide to independent {{region}} and wrote the listing ourselves. Here's what we published:

{{description}}

It's live now: {{place_url}}

The listing is yours to take over. Claiming lets you replace the card we're using with your own photographs and take control of how the page looks. It takes a couple of minutes:

{{claim_url}}

If anything's off, or you'd rather not be listed, just reply and I'll fix it or take it down.

Matt
Australian Atlas`,
}

// Every vertical now sends the same editorial email. Kept as an (empty) map so
// templateForVertical and the admin picker keep their existing shape; anything
// looked up here falls back to GENERIC_TEMPLATE.
export const VERTICAL_TEMPLATES = {}

export function templateForVertical(_vertical) {
  return GENERIC_TEMPLATE
}

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

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

// Options for the admin template-picker dropdown. One editorial voice now, so
// a single option; the map is left in place for the picker's existing shape.
export const TEMPLATE_OPTIONS = [
  { value: '', label: 'Listing outreach' },
]

// Kept for backwards-compat with the send route's earlier import.
export const DEFAULT_TEMPLATE = GENERIC_TEMPLATE
