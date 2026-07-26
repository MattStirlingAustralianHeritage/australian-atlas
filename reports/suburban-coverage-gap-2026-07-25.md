# The suburban coverage gap — 2026-07-25

Atlas coverage of Australian cities stops at about the 5km mark. This report
measures that, explains why it happens, and records the first pass at closing it.

## 1. The measurement

`scripts/audit-metro-ring-density.mjs` buckets every active listing with
coordinates (9,967 of them) by great-circle distance from the nearest of the 15
largest urban centres, then normalises by ring area:

| Ring | Listings | Per 100 km² |
|---|---|---|
| 0–5km (CBD/inner) | 2,090 | **177.40** |
| 5–15km (middle) | 1,216 | **12.90** |
| 15–30km (outer) | 1,013 | **3.18** |
| 30–55km (fringe) | 450 | **0.45** |

A **14× drop at the 5km boundary**, and 56× by the outer ring.

Real venue density does fall with distance from a CBD — but not like that.
Marrickville, Footscray, Sunnybank and Fremantle are not a fourteenth as dense
as their city centres. The cliff is an artefact of how discovery works, not a
description of Australia.

### Where it bites hardest

Share of each metro's listings sitting inside 5km:

| City | Total | Inner | Middle | Outer | Inner share |
|---|---|---|---|---|---|
| Cairns | 133 | 100 | 18 | 15 | **75.2%** |
| Darwin | 112 | 72 | 33 | 7 | 64.3% |
| Hobart | 284 | 177 | 53 | 54 | 62.3% |
| Newcastle | 139 | 86 | 34 | 19 | 61.9% |
| Wollongong | 84 | 49 | 22 | 13 | 58.3% |
| Brisbane | 392 | 225 | 86 | 81 | 57.4% |
| Townsville | 37 | 21 | 14 | 2 | 56.8% |
| Canberra | 242 | 134 | 88 | 20 | 55.4% |
| Sydney | 666 | 321 | 193 | 152 | 48.2% |
| Melbourne | 997 | 395 | 235 | 367 | 39.6% |
| Adelaide | 582 | 218 | 137 | 227 | 37.5% |
| Perth | 540 | 154 | 157 | 229 | 28.5% |
| Gold Coast | 214 | 49 | 79 | 86 | 22.9% |
| Sunshine Coast | 228 | 47 | 50 | 131 | 20.6% |

Sydney holds 666 listings for 5.5 million people, only 152 of them beyond 15km.
Brisbane has 81 beyond 15km for a metro of 2.7 million.

The verticals most CBD-bound are `found` (56.5% inner), `table` (52.2%) and
`fine_grounds` (51.2%) — precisely the categories where suburban high streets are
strongest. `field` (23.6%) and `sba` (23.4%) skew outward for obvious geographic
reasons.

### Why it happens

The daily prospector and floor-seeder sweep whole-state bounding boxes with a
result cap. Dense inner-city areas consume that cap before the sweep reaches
anything else, so the middle and outer suburbs are never actually looked at. It
is the same failure that starved regional towns, which `town-gap-packs.js`
already addresses — the geometry is just different.

## 2. The approach

`scripts/metro-suburb-packs.js` adds 193 anchors across 26 packs, covering the
middle and outer suburbs of all 15 centres. Each anchor gets one tight OSM
Overpass bbox (quota-free, no Google Places), and every survivor goes through the
**unchanged 5-gate candidate pipeline** — only the geography of discovery is
finer, not the quality bar.

Three corrections were needed along the way, each caught by checking rather than
assuming:

**Anchor coordinates were machine-verified, not trusted.** Hand-typed suburb
coordinates are the weakest link in a pack file. `verify-suburb-anchors.mjs`
checks each one two ways against Mapbox — forward (bare suburb name,
proximity-biased) and reverse (what is actually at that point) — and asserts the
result is the named suburb in the named state. 194/194 passed after one real fix:
**Queanbeyan was filed under ACT when it is legally NSW**, which would have
stamped the wrong state on every venue found there. It now has its own NSW pack.

**The inner ring had to be excluded explicitly.** A suburb anchor plus its radius
can reach back toward the CBD: Marrickville sits 7km out, and a 4km bbox around
it takes in Newtown at 3.9km. The first queueing run put **14 of 24 candidates
inside 5km** — mostly into the ring these packs exist to avoid. Suburb packs now
drop any POI within 5km of a major city centre. Marrickville's yield fell from 88
gaps to 39 accordingly, which is the filter working, not a loss.

**Dedup was only seeing 7% of the network.** `buildDedupSets` used a single
`.select().limit(20000)`, but PostgREST caps a response at 1,000 rows regardless
of `.limit()`. Dedup therefore compared against the first 1,000 listings out of a
13,464-name corpus, and everything past that page looked brand new. Fixed by
paging; verified 1,000 → 13,464 names. **This was on the path of every prospector
run, not just this crawl.**

## 3. Descriptions are gated before publish, not after

The approval route resolves a description as
`reviewerOverrides > candidate.description > enriched > AI fallback`, and that
final fallback is an ungated Haiku call — no banned-phrase check, no source
binding, and its `descriptionSource` is logged but never persisted. The
2026-07-24 unlogged-description audit (554 bad in a 6,518 no-provenance cohort)
and the 2026-07-25 tone pass both traced their worst findings to copy written
that way.

So `candidate.description` is filled first, with text that must clear four gates.
Because it outranks the fallback, the ungated path never runs for these listings.

| Gate | What it checks |
|---|---|
| banned-phrase | the existing operator-intake `BANNED_PHRASES` |
| source-binding | every 3+ digit number and multi-word proper noun must appear **verbatim** in the venue's own site text |
| identity | does this website actually belong to *this* venue in *this* suburb? |
| merit | is this an Atlas-worthy place at all? — **three independent votes, majority required** |

One corrective retry; then the candidate is left with `description = null` and
reported rather than published. Silence beats a plausible invention.

The last two gates are new, and both earned their place immediately. The
discovery pipeline's Gate 4 checks fit for the **vertical** ("is this really
accommodation?"), not whether somewhere is worth going out of your way for — so
an airport transit hotel passes Gate 4 legitimately and has to be stopped here.
The merit prompt is deliberately written to *keep* humble places (a suburban
Vietnamese bakery, a one-room ceramics studio, a family trattoria) and reject
only the generic, corporate, and non-visitable.

### What the gates caught

| Venue | Gate | Finding |
|---|---|---|
| Daddy Rich Records | identity | Site is genuine, but the shop **relocated from Dulwich Hill to Balaclava, Melbourne** — would have gone live as a Sydney listing in the wrong city |
| Peace Bakery | merit | Wholesale bread production and delivery; nothing to visit |
| Airport Hotel | merit | Airport transit hotel — passed Gate 4 as real accommodation, rejected here as generic |
| Heinemann | source-binding | Airport duty-free chain; brand names in the draft were not verifiable as the venue's own |
| Grevillea Park | identity | The OSM `website` tag resolves to a **septic tank installation company in Conroe, Texas** — a re-registered domain |
| Swedish Restaurant | identity | Site is **IKEA's national restaurant page**; the POI is an in-store cafeteria, not an independent venue |
| Bungaree Community Garden | identity | Site is a City of Parramatta directory page about community groups; never mentions the garden |
| Yorke Educational Centre | identity | Site's address is in Chatswood, the POI is in Parramatta |
| Bourke St Bakery, Dosa Hut, Okami, Dragon Hot Pot, Bondi Pizza, Amalfi, Mikazuki | merit | Chains — each site advertises multiple branches or invites franchisees |
| Brighton Savoy | merit | Its own site says it **"was"** a hotel and is now a digital-marketing blog — there is no venue left to visit |
| Present Story | merit | **Closing permanently**, last trading day in January; no publicly visitable offer |
| Mamo home | merit | Online store closed, and the site's address contradicts the listed location |
| Mondrian | merit | A global luxury hotel brand (LA, Ibiza, Doha, Singapore) — the opposite of independent |
| RACV Torquay Resort | merit | One of nine near-identical RACV resorts across several states |
| Fasta Pasta | identity | Chain landing page reading "there are no restaurants available in this region yet" — nothing to confirm |

One limitation surfaced and was mitigated rather than papered over: the
source-binding checker matches a capitalised run *verbatim* and treats `and` as
part of the run, so a draft joining two separately-grounded names ("Belgian
Tripel and Stout") fails even though both terms are in the source. The retry
feedback now explains that mechanic so the rewrite splits the phrase instead of
deleting real detail.

## 4. Results

**182 new listings are live**, verified rendering on both the portal
(`/place/[slug]`) and their vertical's canonical URL. Three more were published
and then withdrawn on review (see §7).

**The sweep is complete: all 193 anchors crawled**, across NSW, VIC, QLD, WA, SA,
TAS, ACT and NT. That was only practical once the crawl became resumable
part-way through — `reports/suburb-crawl-state.json` records each finished
anchor, so a run picks up where the last stopped instead of starting over.

### The full sweep

| | |
|---|---:|
| Anchors crawled | **193 / 193** |
| Net-new gaps found | **1,063** |
| POIs skipped inside 5km of a CBD | **2,153** |
| Queued through the 5 discovery gates | 317 |
| Deferred by the per-vertical ceiling | 787 |
| Published | 185 |
| Withdrawn on review | 3 |
| **Live** | **182** |

The inner-ring exclusion is the number that most vindicates building it: **2,153
POIs** fell within 5km of a city centre, 871 of them `table`. Without it, most of
what the suburb anchors touched would have landed back in the saturated ring
these packs exist to avoid — which is precisely what the first queueing run did,
before the filter existed.

Queued by vertical across the full sweep: Table 201, Rest 49, Culture 32,
Corner 21, Field 11, Small Batch 3. The full per-suburb landscape for all 193
anchors is in `reports/suburb-gap-crawl-2026-07-26-metro-suburbs.md`.

### What the first 22 suburbs contained

The sample below is from early in the sweep and is kept because the ratios are
the clearest statement of the problem.

| Suburb | OSM POIs | Atlas nearby | Net-new gaps |
|---|---:|---:|---:|
| Marrickville | 261 | 138 | 24 |
| Parramatta | 107 | 15 | **48** |
| Chatswood | 102 | 26 | 31 |
| Cronulla | 35 | 8 | 6 |
| Preston | 319 | 97 | **59** |
| Footscray | 117 | 34 | 32 |
| Box Hill | 62 | 15 | **35** |
| Dandenong | 20 | 3 | 11 |
| Sunnybank | 23 | 11 | 10 |
| Indooroopilly | 106 | 37 | 7 |
| Wynnum | 15 | 3 | 5 |
| Leederville | 168 | 139 | 2 |
| Fremantle | 93 | 125 | 15 |
| Norwood | 241 | 173 | 1 |
| Port Adelaide | 32 | 24 | 10 |
| Kingston (TAS) | 27 | 9 | 3 |
| Dickson | 64 | 34 | 2 |
| Queanbeyan | 17 | 20 | 4 |
| Parap | 35 | 22 | 0 |
| Hamilton (NSW) | 38 | 77 | 4 |
| Bulli / Thirroul | — | — | 6 |
| **Total (22 anchors)** | **1,882+** | **1,010+** | **315** |

**315 net-new candidates in the first 22 suburbs**, after deduplication against the full
13,464-name corpus and after excluding everything inside 5km of a CBD.

The distribution is as informative as the total. Parramatta had 107 mapped POIs
against 15 Atlas listings; Box Hill 62 against 15; Dandenong 20 against 3. Those
are the holes. Meanwhile Norwood (241 POIs, 173 listings, 1 gap), Leederville
(168/139, 2 gaps) and Parap (35/22, 0 gaps) are already well covered — the crawl
correctly finds nothing to do there. This is not a tool that adds listings
indiscriminately.

### From gap to live listing

| Stage | Count |
|---|---:|
| Net-new gaps found | 1,063 |
| Queued through the 5 discovery gates | 317 |
| Cleared the description gates and published | 185 |
| Withdrawn again on review | 3 |
| **Live** | **182** |

Gate 1 (web presence) is the dominant rejection at discovery: most OSM POIs
carrying a `website` tag have a dead or unreachable site.

### Where the 86 landed

| Ring | Count |
|---|---:|
| 0–5km (inner — off-goal) | 1 |
| 5–15km (middle) | 108 |
| 15–30km (outer) | 73 |
| 30km+ (fringe) | 0 |

**181 of 182 sit outside the inner ring** — the single exception is PACT, published
before the exclusion existed. Every listing has a description; none was left to
the ungated fallback.

| Nearest centre | Count | | Vertical | Count |
|---|---:|---|---|---:|
| Sydney | 81 | | Table | 134 |
| Melbourne | 62 | | Culture | 27 |
| Brisbane | 9 | | Corner | 7 |
| Adelaide | 8 | | Rest | 6 |
| Gold Coast | 6 | | Field | 5 |
| Perth | 5 | | Small Batch | 3 |
| Cairns | 3 | | | |
| Newcastle | 3 | | | |
| Wollongong | 2 | | | |
| Hobart | 2 | | | |
| Geelong | 1 | | | |

Non-`table` share rose from 15% to **26%** once gaps were interleaved by vertical
and the per-vertical ceiling began to bind.

Samples spanning every covered centre and 3.9–22.4km from the middle were checked
live throughout; every one returned HTTP 200 with a rendered page, on the portal
and on the vertical's own site.

Representative finds — the kind of place the ring audit predicted was missing:
Luke's Banh Mi (Preston), A1 Bakery (Fairfield VIC), Bluestone Church Arts Space
(Footscray), Paesanella Food Emporium (Marrickville, making ricotta since 1952),
40 Grains (Summer Hill), Slow Lane Brewing (Dulwich Hill), Islamic Museum of
Australia (Thornbury), Polish Museum and Archives (Melbourne), Zagreb Croatian
Bookshop, Hobart Bush Cabins, Pancakes at the Port (Port Adelaide), Grace
Takeaway (Wynnum), Bib and Tucker (Perth), antojitos (Mayfield, Newcastle), Bulli Beach Cafe.

## 5. Honest limitations

- **The queue is capped, the report is not.** `--max` bounds how many candidates
  are queued; the crawl continues so the landscape stays complete. Both the
  report and stdout state how many eligible gaps went unqueued. Previously a
  capped run silently truncated the report at the cap and read as "this is all
  there is" — that is fixed, but the remainder is still real work outstanding.
- **PACT Centre for Emerging Artists (Newtown, 3.9km) was published before the
  inner-ring exclusion existed.** It is a good listing and has been left live,
  but it is inside the saturated ring and so does not count toward closing this
  gap.
- **14 inner-ring candidates from the first run remain `pending`** in the review
  queue. They are legitimate venues and can be reviewed normally; they are simply
  not what this exercise was for.
- **Gate 1 rejects a lot.** Most OSM POIs with a `website` tag have a dead or
  unreachable site, so web presence is the dominant rejection reason. That is the
  intended bar, but it means OSM's suburban coverage is richer than the queue
  suggests.
- **Merit is a model judgement.** The three-lens panel (§7) makes it
  reproducible, not exact. Split 2/1 decisions still publish and are recorded as
  splits. Haberfield Hotel went live on a single flaky verdict before the panel
  existed, and was withdrawn.
- **787 `table` gaps sit deferred** in `reports/suburb-deferred.json`, held back
  by the per-vertical ceiling. That is a curation decision, not a discovery
  failure — raising `--max-per-vertical` releases them. Whether the Atlas wants
  another 787 suburban restaurants is a judgement for an editor, which is exactly
  why they are recorded rather than silently dropped.
- **The result is still Sydney- and Melbourne-heavy** (143 of 182) and
  `table`-heavy (134 of 182), even after balancing lifted the non-`table` share
  from 15% to 26%. Sydney and Melbourne simply have more suburbs in the packs,
  and OSM maps restaurants far more thoroughly than makers, shops or
  accommodation. The balancing reduced restaurants by *declining* them, not by
  finding more makers — lifting the thin verticals genuinely would need a
  different source, which this crawler deliberately avoids for quota reasons.
- **Gate 1 and dead websites cap the yield.** 1,063 gaps produced 317 queued
  candidates. Most OSM POIs carrying a `website` tag point at a dead, blocked or
  403-ing site, and a handful (My Saigon Tuckshop, Headlands Hotel, The Esplanade
  Hotel) resisted every attempt. OSM's suburban coverage is richer than the queue
  suggests.
- **One cosmetic data defect was found and not fixed here**: the place-page
  address line renders the state twice ("… Dulwich Hill, NSW, 2203, NSW") because
  the enrichment writes a full address including state while the renderer appends
  state again. It affects existing listings too, so it was spun out rather than
  patched mid-run.

## 6. Reproducing / continuing

```bash
# measure the rings again
node --env-file=.env.local scripts/audit-metro-ring-density.mjs

# re-verify every anchor coordinate against Mapbox (two-way)
node --env-file=.env.local scripts/verify-suburb-anchors.mjs

# continue the sweep (interleaved across cities; inner ring excluded)
node --env-file=.env.local scripts/crawl-town-gaps.mjs --metro --queue --max=200

# describe what was queued, gated; then publish only what passed
node --env-file=.env.local scripts/describe-suburb-candidates.mjs --pending-since=2026-07-25
node --env-file=.env.local scripts/publish-suburb-candidates.mjs \
  --results=reports/suburb-descriptions-2026-07-25.json \
  --base=https://www.australianatlas.com.au
```

Point `--base` at a dev server on this worktree instead of production if you want
to interrupt a bad batch locally. A single pack can be targeted with
`--region=melbourne-west`; suburb packs keep the inner-ring exclusion wherever
they are run from.
