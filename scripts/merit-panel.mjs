// Editorial-merit panel for Atlas candidate screening.
//
// Extracted from describe-suburb-candidates.mjs so it can be exercised directly
// by scripts/merit-panel.test.mjs — the flakiness this exists to fix is only
// observable by running the same venue repeatedly, which needs an importable
// unit rather than a CLI.
//
// Pure judgement: no DB, no filesystem. Callers supply the venue facts and its
// site text and receive the votes plus a majority verdict.

// ── Merit panel ──────────────────────────────────────────────────────
// Merit used to be judged once, inside the verifier, alongside identity and
// grounding. Those two are evidence-based and stable; merit is a taste call and
// turned out to be a coin-flip — Haberfield Hotel and Dandenong Club were each
// rejected in one batch and passed in the next, and Haberfield went live before
// being withdrawn. Sticky rejections stopped a rejected venue being re-rolled,
// but did nothing about a first-and-only judgement landing wrong.
//
// So merit is now its own panel of THREE independent votes, and a venue needs a
// MAJORITY to be listed. Each voter gets a different lens, because three
// identical prompts mostly reproduce the same error; asking "is this a chain?",
// "can you actually visit?" and "would a local send someone here?" fails
// differently. A single stray vote can no longer publish or kill anything.
//
// It also runs BEFORE the description is written, on the venue facts and site
// text alone — merit never depended on the draft, and judging first means a
// rejected venue costs three cheap votes instead of a full generate-and-verify.
const MERIT_SHARED = `The Atlas covers independent Australian places worth going out of your way for. It is explicitly NOT a directory.

BINDING EXCLUSIONS — these override your own lens. If the venue falls into any category below, answer merit=false even when it passes the particular question you were asked. A suburban RSL is a single independent location you can certainly walk into, and it is still excluded; do not vote it in on those grounds.

Reject as no merit: chain outlets and franchises (including any venue whose own site advertises multiple branches or invites franchisees); airport, motorway, highway and transit hotels; generic motels, conference hotels and serviced-apartment blocks; licensed community, sporting and returned-services clubs — RSLs, leagues, bowls, golf and workers clubs — and any venue whose draw is gaming machines, TAB, keno or a drive-through bottle shop; gyms, salons, clinics, schools and trade services; car parks, service stations, shopping centres; aggregators, booking sites and directory pages; anything with no publicly visitable offer.

A club's bistro, bowls green or function rooms do not rescue it. What would rescue a venue that looks club-like is being something else underneath — a genuine brewery, a heritage building open to visitors, a restaurant of its own standing — judged on that, not on the club around it.

For accommodation, apply this test: does the property have a distinct identity of its own — a building with a history, a design point of view, an owner-operator, a place it belongs to — or is it simply a supply of rooms near a road, an airport or a business district? A recently built hotel of dozens of near-identical rooms whose selling points are its floor count, its lift, its gym and its distance from the CBD has no merit here, regardless of how independent its ownership is. Size alone does not disqualify a genuinely distinctive hotel, and modesty does not disqualify a good small guesthouse or pub with rooms.

Keep as merit: independent operators with a specific identity — what they make, grow, cook, show, or stock. Humble is fine and good: a suburban Vietnamese bakery, a one-room ceramics studio, a family-run trattoria, a small suburban gallery, a farm gate, a neighbourhood roaster all have merit. Do NOT reject a place for being modest, cheap, or unfashionable. Reject only for being generic, corporate, transactional, or not a place a visitor could meaningfully go.

Judge the venue, not the writing on its website. Respond with ONLY a JSON object:
{"merit": true|false, "reason": "<one short sentence>"}`

const MERIT_LENSES = [
  {
    key: 'chain',
    prompt: `You are screening venues for Australian Atlas. Your lens is INDEPENDENCE: is this one place, or one outlet of many?

Look hard for multi-location signals in the venue's own words — a locations list, "our stores", franchise or partner enquiries, a loyalty app, centralised ordering, identical branches in other suburbs or states, shopping-centre food-court presence. A single venue that happens to be popular is independent; a small local group of two or three outlets is a chain for our purposes.

${MERIT_SHARED}`,
  },
  {
    key: 'visitable',
    prompt: `You are screening venues for Australian Atlas. Your lens is VISITABILITY: can a member of the public actually go here, and is going here the point?

Reject wholesale plants, production facilities, offices, distributors, online-only operations, enrolment-based schools and studios that only take students, service businesses that come to you, and anything whose "visit" is really a transaction counter. Keep places with a door a visitor can walk through and a reason to.

${MERIT_SHARED}`,
  },
  {
    key: 'local',
    prompt: `You are screening venues for Australian Atlas. Your lens is DISTINCTIVENESS: would someone who knows this suburb well send a visitor here, and why?

If you cannot name what makes it specific — what it makes, grows, cooks, shows or stocks; who runs it; what the room is — it is generic and fails. Be careful not to mistake modest for generic: a plain-looking suburban bakery with its own recipes is distinctive, a polished venue that could be anywhere is not.

${MERIT_SHARED}`,
  },
]

/**
 * Run the three-lens merit panel.
 *
 * @param {object} opts
 * @param {(o:{system:string,user:string,maxTokens?:number,effort?:string})=>Promise<{text:string|null}>} opts.callClaude
 * @param {(s:string)=>object|null} opts.parseJsonLoose
 * @param {string} opts.factsText   pre-rendered venue facts block
 * @param {string} opts.siteText    the venue's own website text
 * @param {string} opts.websiteUrl
 * @returns {Promise<{votes:Array<{key:string,merit:boolean|null,reason:string}>, forCount:number, against:Array, passed:boolean}>}
 */
export async function runMeritPanel({ callClaude, parseJsonLoose, factsText, siteText, websiteUrl }) {
  const user = ['FACTS WE HOLD:', factsText, '', `WEBSITE TEXT (${websiteUrl}):`, siteText].join('\n')
  const votes = await Promise.all(MERIT_LENSES.map(async (lens) => {
    try {
      const res = await callClaude({ system: lens.prompt, user, maxTokens: 1200, effort: 'medium' })
      const parsed = parseJsonLoose(res.text)
      // An unreadable vote abstains rather than counting as approval.
      if (!parsed || typeof parsed.merit !== 'boolean') return { key: lens.key, merit: null, reason: 'unreadable' }
      return { key: lens.key, merit: parsed.merit, reason: parsed.reason || '' }
    } catch (err) {
      return { key: lens.key, merit: null, reason: err.message }
    }
  }))
  const forCount = votes.filter(v => v.merit === true).length
  const against = votes.filter(v => v.merit === false)
  const abstained = votes.filter(v => v.merit === null)
  // Majority of three. Abstentions never count toward listing — but a panel that
  // could not actually sit is NOT a verdict of "no merit". When the API is
  // unreachable (rate limit, outage, exhausted credit) every vote abstains, and
  // treating that 0/3 as a rejection blacklists a legitimate venue because of a
  // billing problem. Callers must check `inconclusive` before recording anything
  // sticky.
  const inconclusive = against.length === 0 && forCount < 2
  return { votes, forCount, against, abstained, inconclusive, passed: forCount >= 2 }
}
