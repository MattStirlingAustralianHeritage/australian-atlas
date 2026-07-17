// ============================================================
// Press outreach email templates
// ------------------------------------------------------------
// Outbound press counterpart of lib/outreach/councilTemplates.js. Plain text
// with {{merge tokens}}; personalisation happens per-recipient at render time
// (lib/outreach/pressTemplate.js). Pure data so it's safe to import from both
// the admin client UI (template picker) and the send route.
//
// Voice: restrained, specific, useful — a note from one person to a journalist
// or newsdesk, offering the Atlas as a story SOURCE (regional leads, a data
// room, intros to independent operators). Never marketing. {{personal_note}} is
// the AI-written opener (may be empty — renderPressEmail collapses the gap).
// {{greeting_name}} resolves to a first name for a journalist, or "there" for a
// desk row.
// ============================================================

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

export const PRESS_INVITE_TEMPLATE = {
  subject: 'A newsroom source for {{beat}} — Australian Atlas',
  body: `Hi {{greeting_name}},

{{personal_note}}

I run Australian Atlas — a curated, independently researched guide to the country's independent places: the makers, growers, cafes, galleries, stays and small producers that rarely make it into the usual listings. We've built a press newsroom around it, and I thought it might be useful to {{outlet_name}}.

It's a working source, not a mailing list: ready-to-run regional story leads, a data room with network-wide numbers you can cite, a media kit, and direct intros to the operators behind any place we cover. The newsroom's in beta right now, so it's free for working press through 2026 while we build it out.

You can see what's there here:

{{for_press_url}}

And a live example of a regional fact sheet — real numbers, updated automatically:

{{example_url}}

If it's useful for your reporting, you can set up your own newsroom account in about a minute — we email you a sign-in link, and there's nothing to pay:

{{signup_url}}

Or just pull whatever you need from the pages above. Either way, reply any time if I can help with a story.

${SIGNOFF}`,
}

export const PRESS_STORY_TEMPLATE = {
  subject: 'Story leads from {{region}} — independent operators worth a look',
  body: `Hi {{greeting_name}},

{{personal_note}}

I'm the editor of Australian Atlas, a curated national guide to independent Australian places. We map and independently research the small operators — food, drink, craft, culture, stays — region by region, and a lot of it turns into the kind of local story that's genuinely hard to find otherwise.

Because you cover {{beat}}, I wanted to point you at our press newsroom. It surfaces story signals as they happen — a region's first of a kind, a maker keeping a rare craft alive, a cluster of new openings — alongside a data room you can cite and intros to the people behind any of it.

Everything's here — the newsroom's in beta, so it's free for press through 2026:

{{for_press_url}}

And a live regional fact sheet as an example:

{{example_url}}

When you want in, you can set up your own account in about a minute — we email you a sign-in link, free for working press:

{{signup_url}}

And I'm always happy to line up an interview or pull specific data for {{outlet_name}} — just reply.

${SIGNOFF}`,
}

export const PRESS_FOLLOWUP_TEMPLATE = {
  subject: 'Following up — the Australian Atlas newsroom',
  body: `Hi {{greeting_name}},

A short follow-up on my earlier note. Australian Atlas is a curated guide to independent Australian places, and our press newsroom — in beta, and free for press through 2026 — is a source of regional story leads, citable data, and intros to the operators behind them.

If it's worth a look for your {{beat}} reporting, you can set up a free account in about a minute — we email you a sign-in link, and you can read what's there first if you'd rather:

{{signup_url}}

And if it's not a fit, no need to reply — I won't chase it again.

${SIGNOFF}`,
}

export const PRESS_TEMPLATES = {
  invite: PRESS_INVITE_TEMPLATE,
  story: PRESS_STORY_TEMPLATE,
  followup: PRESS_FOLLOWUP_TEMPLATE,
}

export function pressTemplateFor(key) {
  return PRESS_TEMPLATES[key] || PRESS_INVITE_TEMPLATE
}

// Options for the admin template-picker dropdown.
export const PRESS_TEMPLATE_OPTIONS = [
  { value: 'invite', label: 'Newsroom source invite' },
  { value: 'story', label: 'Regional story leads' },
  { value: 'followup', label: 'Follow-up nudge' },
]
