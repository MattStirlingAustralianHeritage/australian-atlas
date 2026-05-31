// Editorial voice for operator-fed description generation.
//
// The voice is the Atlas house voice: place-grounded, restrained, anti-chain,
// non-promotional. The banned-phrase list is the canonical Atlas list (mirrors
// lib/plan-a-stay/title-generation.js) plus a few description-specific clichés in
// the same spirit. Enforcement matches that file: any banned phrase present →
// the draft fails and is not publishable.

export const BANNED_PHRASES = [
  // Canonical Atlas banned list (lib/plan-a-stay/title-generation.js)
  'unparalleled',
  'bespoke',
  'curated experiences',
  'creating memorable experiences',
  'nestled in',
  'hidden gem',
  // Description-specific clichés, same anti-promotional spirit
  'nestled',
  "stone's throw",
  'a feast for the senses',
  'something for everyone',
  'iconic',
  'must-visit',
  'world-class',
  'state-of-the-art',
  'boasts',
]

// The five-movement structure every generated description follows, in order.
export const STRUCTURE = [
  'building',          // what the building is — one specific, dated, located sentence
  'what you book',     // what a visitor actually books / buys / does
  'feel and fittings', // the material detail — design, fittings, texture
  'where it sits',     // its place in the street / town / region
  'closing texture',   // one closing line of texture, not a sell
]

export const SYSTEM_PROMPT = `You are writing the editorial description for a venue on Australian Atlas, a curated guide to independent Australian places.

You will be given a set of FACTS the operator submitted about their venue. Write the description using ONLY those facts.

Absolute rules:
- Use ONLY the facts provided. Do not add history, dates, names, places, products, or claims that are not in the facts. If a fact is not provided, do not invent it and do not gesture at it.
- Never fill gaps with general knowledge about the town, the region, the trade, or venues "like this one". If you are unsure, leave it out.
- Australian English. Concrete nouns over adjectives. No emoji. No quotation marks around the whole text.
- No promotional language, no hospitality cliché, no superlatives. Do not address the reader as "you'll find" or sell. Describe.
- Do not name or reference Australian Atlas, this platform, claiming, or listings.
- Do not state the venue's own name. It is shown to readers separately as the page heading; describe the place without naming it.

Voice: place-grounded, restrained, confident without being clipped. Plain, exact sentences. The register of a good field guide, not a brochure.

Structure — five short movements, in this order, each its own paragraph separated by a blank line:
1. The building: one specific sentence, dated and located, drawn from the building fact.
2. What you book: what a visitor actually books, buys, or does here.
3. Feel and fittings: the material detail — design, fittings, texture.
4. Where it sits: its place in the street, town, or region.
5. A closing line of texture: one quiet, concrete closing sentence. Not a sell.

If the facts only support some movements, write only those — never pad. Total length 80–170 words.

Output: just the description text, paragraphs separated by blank lines. No preamble, no headings, no labels.`

// Case-insensitive banned-phrase check. Mirrors the enforcement in
// lib/plan-a-stay/title-generation.js: any banned phrase present → fail.
export function bannedPhraseCheck(text) {
  const lower = String(text || '').toLowerCase()
  const violations = []
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) violations.push(phrase)
  }
  return { passed: violations.length === 0, violations }
}

// Discrete intake fields, in form order, with the prompts/labels the operator
// sees. ownership_transition_note is surfaced as a first-class field because a
// change of ownership is the most common source of stale or fabricated copy.
export const INTAKE_FIELDS = [
  {
    key: 'building_description',
    label: 'The building',
    type: 'sentence',
    help: 'One specific sentence — dated and located. E.g. "A 1923 red-brick warehouse on Gertrude Street, Fitzroy."',
    required: true,
  },
  {
    key: 'what_you_book',
    label: 'What you book',
    type: 'sentence',
    help: 'What a visitor actually books, buys, or does here.',
    required: true,
  },
  {
    key: 'design_fitting_detail',
    label: 'Design & fittings',
    type: 'sentence',
    help: 'The material detail — the fittings, the texture, what the room is made of.',
    required: false,
  },
  {
    key: 'where_it_sits',
    label: 'Where it sits',
    type: 'sentence',
    help: 'Its place in the street, town, or region.',
    required: false,
  },
  {
    key: 'established_year',
    label: 'Established',
    type: 'year',
    help: 'The year established, if you want it stated. Leave blank if unsure — we will not guess.',
    required: false,
  },
  {
    key: 'products_operators_named',
    label: 'Named products',
    type: 'list',
    help: 'Specific products, ranges, or makers you want named. One per line.',
    required: false,
  },
  {
    key: 'ownership_transition_note',
    label: 'Ownership / change note',
    type: 'paragraph',
    help: 'IMPORTANT. If ownership, name, or focus has changed, say so here. This is the single most common cause of out-of-date copy — telling us protects you from a description that describes the old place.',
    required: false,
    emphasised: true,
  },
]
