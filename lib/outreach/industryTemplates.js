// ============================================================
// Industry outreach email templates
// ------------------------------------------------------------
// Industry counterpart of lib/outreach/pressTemplates.js. Plain text with
// {{merge tokens}}; personalisation happens per-recipient at render time
// (lib/outreach/industryTemplate.js). Pure data so it's safe to import from
// both the admin client UI (template picker) and the send route.
//
// Voice: restrained, specific, useful — one founder writing to a peak body or
// association, offering the Atlas as infrastructure for their sector (member
// visibility, regional coverage, a national audience for independents). Never
// marketing. {{personal_note}} is the AI-written opener (may be empty —
// renderIndustryEmail collapses the gap). {{greeting_name}} resolves to a
// first name for a named contact, or "there" for a generic org row.
// ============================================================

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

export const INDUSTRY_INTRO_TEMPLATE = {
  subject: 'Australian Atlas — a national guide to independent {{focus}}',
  body: `Hi {{greeting_name}},

{{personal_note}}

I run Australian Atlas — a curated, independently researched guide to the country's independent places: the makers, growers, cellar doors, cafes, galleries, stays and small producers that rarely make it into the usual listings. We map and write up thousands of them, region by region, across nine categories.

I'm writing because {{org_name}} sits at the centre of the sector we cover, and I'd rather build alongside the industry than around it. A few ways the Atlas might be useful to you:

- Your members are likely already in the guide — independently researched, free to be listed, and free for any operator to claim and keep current: {{venues_url}}
- Our regional coverage gives sectors like yours a national shop window — see how a region reads here: {{regions_url}}
- We hold network-wide data on independent operators (openings, categories, regional spread) that we're happy to share with industry bodies.

There's nothing to buy in this email — I'd simply like the Atlas on your radar, and to hear where it could genuinely help your members. If it's worth a conversation, just reply; I read everything myself.

You can get a feel for the whole project here:

{{about_url}}

${SIGNOFF}`,
}

export const INDUSTRY_MEMBERS_TEMPLATE = {
  subject: 'Free listings for {{org_name}} members on Australian Atlas',
  body: `Hi {{greeting_name}},

{{personal_note}}

I'm the founder of Australian Atlas, a curated national guide to independent Australian places — food, drink, craft, culture, stays — researched region by region.

Many of your members are likely already listed. Every listing is free, and any operator can claim theirs in a couple of minutes to keep photos, hours and details current — no cost, no catch:

{{venues_url}}

I'd love to make that easy for {{org_name}}: a note in your member newsletter, a run-through of your member list against our directory, or anything else that fits how you communicate with members. Happy to prepare whatever makes it a two-minute job for you.

And if there's a bigger conversation — regional data, co-promotion, or gaps in our coverage of your sector — I'm always keen to hear it. Just reply.

The guide itself is here if you'd like a look first:

{{site_url}}

${SIGNOFF}`,
}

export const INDUSTRY_FOLLOWUP_TEMPLATE = {
  subject: 'Following up — Australian Atlas',
  body: `Hi {{greeting_name}},

A short follow-up on my earlier note. Australian Atlas is a curated national guide to independent Australian places, and I reached out because {{org_name}} works with exactly the operators we cover — listings are free, members can claim theirs any time, and we're happy to share regional data with industry bodies.

If it's worth a look, everything starts here:

{{about_url}}

And if it's not a fit, no need to reply — I won't chase it again.

${SIGNOFF}`,
}

export const INDUSTRY_TEMPLATES = {
  intro: INDUSTRY_INTRO_TEMPLATE,
  members: INDUSTRY_MEMBERS_TEMPLATE,
  followup: INDUSTRY_FOLLOWUP_TEMPLATE,
}

export function industryTemplateFor(key) {
  return INDUSTRY_TEMPLATES[key] || INDUSTRY_INTRO_TEMPLATE
}

// Options for the admin template-picker dropdown.
export const INDUSTRY_TEMPLATE_OPTIONS = [
  { value: 'intro', label: 'Atlas introduction' },
  { value: 'members', label: 'Free member listings' },
  { value: 'followup', label: 'Follow-up nudge' },
]
