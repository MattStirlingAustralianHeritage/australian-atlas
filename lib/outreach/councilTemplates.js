// ============================================================
// Council outreach email templates
// ------------------------------------------------------------
// Council counterpart of lib/outreach/templates.js. Plain text with
// {{merge tokens}}; personalisation happens per-recipient at render time
// (lib/outreach/councilTemplate.js). Pure data so it's safe to import from
// both the admin client UI (template picker) and the send route.
//
// Voice: restrained, specific, professional — a note from one person to a
// council's tourism/economic-development team, not marketing. The pitch is the
// free founding-partner beta of /for-councils. {{personal_note}} is the
// AI-written opener (may be empty — renderCouncilEmail collapses the gap).
// ============================================================

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

export const COUNCIL_BETA_TEMPLATE = {
  subject: '{{region}} on Australian Atlas — free founding access for {{council_name}}',
  body: `Hi,

{{personal_note}}

We've been building Australian Atlas — a curated, independently researched guide to Australian places — and {{region}} is one of the regions we cover, with {{listing_count}} independent operators mapped so far.

We're opening the council side of the platform as a free founding beta: a dashboard with the verified listing data for your area, visitor analytics, exportable reports you can white-label, and a direct line to suggest local operators for consideration. There's no cost during the beta and nothing to install.

You can see what's included here:

{{for_councils_url}}

And an example of the regional report:

{{example_report_url}}

If it looks useful, your team can set itself up in about two minutes here — a .gov.au email is activated on the spot, so you could be inside your dashboard today:

{{enquire_url}}

${SIGNOFF}`,
}

export const COUNCIL_REPORT_TEMPLATE = {
  subject: 'What we’ve mapped across {{region}} — {{listing_count}} independent places',
  body: `Hi,

{{personal_note}}

Australian Atlas is a curated national guide to independent places — cafes, makers, galleries, stays, tours — and across {{region}} we've now mapped {{listing_count}} of them, each independently researched and verified.

That data sits behind a council dashboard we're opening to local government as a free founding beta: region-scoped analytics, exportable listing data, and a white-label report your team can put its own logo on. Here's a live example of the report format:

{{example_report_url}}

If your tourism or economic development team would find it useful, full details are at {{for_councils_url}}, and you can set {{council_name}} up in two minutes here — a .gov.au email is activated on the spot:

{{enquire_url}}

${SIGNOFF}`,
}

export const COUNCIL_FOLLOWUP_TEMPLATE = {
  subject: 'Following up — {{region}} on Australian Atlas',
  body: `Hi,

A short follow-up on my earlier note about Australian Atlas — we cover {{region}} with {{listing_count}} independently verified local operators, and council access is free while we're in beta.

If it's worth a look, everything's here:

{{for_councils_url}}

Happy to answer anything by reply — and if it's not a fit for {{council_name}}, no need to respond.

${SIGNOFF}`,
}

export function councilTemplateFor(key) {
  return COUNCIL_TEMPLATES[key] || COUNCIL_BETA_TEMPLATE
}

export const COUNCIL_TEMPLATES = {
  beta: COUNCIL_BETA_TEMPLATE,
  report: COUNCIL_REPORT_TEMPLATE,
  followup: COUNCIL_FOLLOWUP_TEMPLATE,
}

// Options for the admin template-picker dropdown.
export const COUNCIL_TEMPLATE_OPTIONS = [
  { value: 'beta', label: 'Founding beta invite' },
  { value: 'report', label: 'Region report lead' },
  { value: 'followup', label: 'Follow-up nudge' },
]
