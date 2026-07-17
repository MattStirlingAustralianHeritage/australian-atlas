// ============================================================
// Trade outreach email templates
// ------------------------------------------------------------
// Travel-trade counterpart of lib/outreach/templates.js (operators) and
// lib/outreach/councilTemplates.js. Plain text with {{merge tokens}};
// personalisation happens per-recipient at render time
// (lib/outreach/tradeTemplate.js). Pure data so it's safe to import from
// both the admin client UI (template picker) and the send route.
//
// Voice: restrained, specific, professional — a note from one person to the
// product team at a tour operator / DMC / agency, not marketing. The pitch is
// the free founding beta of Atlas Trade (/for-trade): build day-planned,
// co-branded itineraries and proposals from independently verified Australian
// operators. No dollar figures anywhere (TRADE config rule). {{personal_note}}
// is the AI-written opener (may be empty — renderTradeEmail collapses the gap).
// ============================================================

const SIGNOFF = `Warm regards,
Matt
Australian Atlas`

export const TRADE_BETA_TEMPLATE = {
  subject: 'Verified Australian supply for {{company_name}} — free founding access to Atlas Trade',
  body: `Hi,

{{personal_note}}

We've been building Australian Atlas — a curated, independently researched guide to Australian places — and we've now mapped {{network_count}} independent operators, cafes, cellar doors, galleries, stays and experiences across the country, each one a verified live record.

We're opening the trade side of the platform as a free founding beta: a directory you can filter by group size, access and region; operator fact sheets with the practical details (capacity, notice, coach access, seasonal notes); and a builder that turns a shortlist into a day-planned, co-branded itinerary you can send to a client as a PDF under your own organisation's name.

You can see what's included here:

{{for_trade_url}}

There's no cost during the beta and nothing to install. Your team can join in about two minutes here:

{{apply_url}}

${SIGNOFF}`,
}

export const TRADE_BUILDER_TEMPLATE = {
  subject: 'Day-planned, co-branded Australian itineraries — built from verified operators',
  body: `Hi,

{{personal_note}}

A quick note from Australian Atlas — a curated national guide to independent Australian places. Everything on it is independently researched and verified: {{network_count}} operators across every state and territory.

For teams that build itineraries, we've added Atlas Trade: shortlist from the directory, arrange stops into days with driving legs estimated between them, and export a co-branded proposal PDF with your organisation's name on it. Fact sheets carry the trade practicalities — group capacity, notice required, coach access — so you're not chasing basics before you can quote.

It's free while we're in the founding beta. Details here:

{{for_trade_url}}

If it looks useful for {{company_name}}, your team can join in about two minutes here — and reply any time if you'd like a hand:

{{apply_url}}

${SIGNOFF}`,
}

export const TRADE_FOLLOWUP_TEMPLATE = {
  subject: 'Following up — Atlas Trade for {{company_name}}',
  body: `Hi,

A short follow-up on my earlier note about Atlas Trade — the itinerary and proposal builder that sits on Australian Atlas, our verified guide to {{network_count}} independent Australian operators. Trade access is free while we're in beta.

If it's worth a look, everything's here:

{{for_trade_url}}

Happy to answer anything by reply — and if it's not a fit for {{company_name}}, no need to respond.

${SIGNOFF}`,
}

export function tradeTemplateFor(key) {
  return TRADE_TEMPLATES[key] || TRADE_BETA_TEMPLATE
}

export const TRADE_TEMPLATES = {
  beta: TRADE_BETA_TEMPLATE,
  builder: TRADE_BUILDER_TEMPLATE,
  followup: TRADE_FOLLOWUP_TEMPLATE,
}

// Options for the admin template-picker dropdown.
export const TRADE_TEMPLATE_OPTIONS = [
  { value: 'beta', label: 'Founding beta invite' },
  { value: 'builder', label: 'Itinerary-builder lead' },
  { value: 'followup', label: 'Follow-up nudge' },
]
