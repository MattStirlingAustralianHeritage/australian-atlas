# Gate 1 calibration ceremony — 2026-05-22T02:12:01Z

## TL;DR

All five dry-runs completed without errors. Fact-check passed on all
five. detectBailToken did not fire on any. Mixed-slot ceremony: 2
general (Black Gate, Timboon), 3 new_producer (Tram Museum, Apostle
Whey, Alkina). Confidence range: 60–75/90. Both general-slot pitches
hit the 75/90 single-anchor ceiling; all three new-producer pitches
sit below the 70-point threshold (60, 60, 65) — which is the spec's
designed behaviour (low-confidence flag, not a hard reject). No bail
tokens, no schema errors, no LLM-level corruption like the one-off
Morris v4 anomaly.

## Slot type rationale

Pre-flight surfaced three of the five editorial picks failing the
general-slot floor:

- **Melbourne Tram Museum** — no `founded_year`/`awards` anchor, 0/6
  booleans.
- **Apostle Whey Cheese** — `region` NULL (hard fail), no anchor, 0/6
  booleans.
- **Alkina Lodge** — no anchor, only 1/6 booleans.

Matt's decision: keep all five editorial picks, mix slot types. The
three failing the general-slot floor pass the new-producer floor
(which is lighter — name + region + at least one of {website,
description ≥ 100 chars, owner=true}). This tests both slot types
across multiple verticals in a single ceremony.

## Pre-flight artifacts

`apostle-whey-cheese` was unblocked before the ceremony via a single
UPDATE on the listings table:

```sql
UPDATE listings
SET region = 'Great Ocean Road'
WHERE slug = 'apostle-whey-cheese';
-- affected_rows = 1
```

Region value `'Great Ocean Road'` is the canonical Victoria region name
per `05-regions.md`. No other field on this listing or any other listing
was touched. The new_producer floor was re-verified post-UPDATE: PASS
(name ✓, region ✓, website ✓, description ≥ 100 ✓).

Pre-flight floor results post-fix:

| Listing | Slot | Floor | Phase 1 score |
|---|---|---|---|
| black-gate-distillery-mendooran | general | PASS | n/a (editor-named) |
| timboon-distillery | general | PASS | n/a (editor-named) |
| melbourne-tram-museum | new_producer | PASS | n/a (editor-named) |
| apostle-whey-cheese | new_producer | PASS (post-fix) | n/a (editor-named) |
| alkina-lodge | new_producer | PASS | n/a (editor-named) |

Phase 1 score is not applicable in this ceremony — the listings are
editor-selected for calibration, not Phase 1-surfaced. The dry-run CLI
takes slugs directly and does not compute Phase 1 ranking.

---

## The five pitches

### 1. Black Gate Distillery Mendooran [GENERAL slot]

**Headline.** Black Gate Distillery: Small-Batch Whisky and Rum from
the Wheat Belt

**Angle.** Black Gate Distillery has been making small-batch whisky
and rum in Mendooran, a wheat-belt town in central NSW, since 2009 —
early days by Australian whisky standards. The story worth telling is
one of deliberate location: an owner-operated distillery that chose a
remote ranges town as its base, and has been quietly working there for
over fifteen years. For readers planning a route through inland NSW,
this is a detour-worthy producer with genuine vintage in a young
national category.

**Anchor listing.** Black Gate Distillery Mendooran
(sba — Mendooran). Slug `black-gate-distillery-mendooran`,
ID `790d2649-15a2-46c5-8526-43f284d94931`.

**Verified facts (8 entries, all atomic).**

| # | Claim | Field |
|---|---|---|
| 1 | Black Gate produces small-batch whisky and rum | `description` |
| 2 | The distillery is located in Mendooran, described as a wheat-belt town | `description` |
| 3 | Black Gate has been distilling since 2009, considered early in Australian whisky terms | `founded_year` (value `"2009"`) |
| 4 | The distillery is owner-operated | `is_owner_operator` (true) |
| 5 | Black Gate is an independent operator | `independence_confirmed` (true) |
| 6 | Located at 72 Forrest Road, Mendooran NSW | `address` |
| 7 | The venue is visitable as an experiential visit | `visit_type` ("experiential") |
| 8 | The distillery is trail-suitable, fitting a detour through the ranges | `trail_suitable` (true) |

**Editorial framing.** Lead with place: the deliberate oddness of
choosing a remote wheat-belt town for a craft distillery, and what
that choice signals about the producer's posture. Voice should be dry,
road-trip-oriented, and unhurried — this is a "worth the detour"
piece, not a hype piece. Structure suggestion: open on the geography,
pivot to the 2009 founding date as the substantiating fact (early in
the Australian craft whisky timeline), then close on the practical
detail that this is a visitable, owner-run operation on a touring
route. Avoid superlatives the data doesn't support; the strength of
the piece is restraint that matches the venue's apparent character.

**Research needed (6).**
1. Visiting hours are not populated — confirm before publication.
2. Best season field is null — confirm cellar door rhythms.
3. No awards listed — independent verification required.
4. The record does not name the operator(s).
5. Specific products, cask program, and current releases not in the record.
6. The phrase 'early in Australian whisky terms' comes from the description; sanity-check the Australian craft whisky timeline.

**Fact-check.** PASSED — all 8 claims traced.
**Confidence.** 75/90 (single-anchor ceiling). Signals: facts_traced +40, founding_date +10, substantive_description +10, independence_confirmed +5, framing_distinguishable +10.
**Bail detection.** null.
**Runtime.** 22.8s.

---

### 2. Timboon Railway Shed Distillery [GENERAL slot]

**Headline.** Slow Whisky in a Restored Railway Shed: Inside Timboon
Distillery

**Angle.** Timboon Railway Shed Distillery has been quietly making
single malt the long way around since 2007 — a family-run,
owner-operated outfit working out of a restored railway shed in
Timboon, with its own on-site cooperage heavy-charring ex-fortified
wine barrels. The story writes itself: a regional Victorian distillery
leaning into the district's illicit bush-still folklore while doing
the patient, unglamorous work of barrel-finished single malt under
expressions like Port Expression, Tom's Surrender and the peated SMOKY
1881.

**Anchor listing.** Timboon Railway Shed Distillery (sba — Southern
Highlands). Slug `timboon-distillery`,
ID `b477732f-bec7-403c-9985-3892335d1f94`.

**Verified facts (13 entries — most of any pitch in this ceremony, all atomic).**

| # | Claim | Field |
|---|---|---|
| 1 | The distillery has been operating since 2007 | `founded_year` (`"2007"`) |
| 2 | It is family-run | `description` |
| 3 | It operates out of a restored railway shed | `description` |
| 4 | The distillery makes single malt whisky the slow way | `description` |
| 5 | Maturation uses ex-fortified wine barrels | `description` |
| 6 | Barrels are heavy-charred on site at the distillery's own cooperage | `description` |
| 7 | Notable expressions include the Port Expression, Tom's Surrender and the peated SMOKY 1881 | `description` |
| 8 | The district carries a history of illicit bush-stills that informs the distillery's sense of place | `description` |
| 9 | The distillery is owner-operated | `is_owner_operator` (true) |
| 10 | Its independence has been confirmed | `independence_confirmed` (true) |
| 11 | The venue is set up for an experiential visit | `visit_type` ("experiential") |
| 12 | It is located at 1 Bailey St, Timboon, Victoria | `address` |
| 13 | The distillery is suitable for inclusion on a trail itinerary | `trail_suitable` (true) |

**Editorial framing.** Lean into texture and place. The voice should
be unhurried and slightly conspiratorial — a writer who treats the
bush-still folklore as atmosphere rather than gimmick. Structurally,
consider a three-act build: the shed (architecture and provenance),
the cooperage (process — heavy-char, ex-fortified casks, the
discipline of slow making), and the glass (a guided walk through the
three named expressions, with Port Expression as the gentle entry and
SMOKY 1881 as the finisher). Resist hagiography; this is a working
family distillery, not a heritage monument. A short closing on what an
experiential visit actually looks like on the ground would give
readers a reason to act.

**Research needed (7), notable item:**
> "Region is listed as 'Southern Highlands' in the record but the
> address is Timboon VIC, which is in south-west Victoria — flag this
> apparent data inconsistency to editorial before publishing any
> regional framing."

The model caught the known Timboon region-contamination issue and
surfaced it as a research_needed item without trying to paper over it.
Working as intended.

**Fact-check.** PASSED — all 13 claims traced.
**Confidence.** 75/90 (single-anchor ceiling).
**Bail detection.** null.
**Runtime.** 25.6s.

---

### 3. Melbourne Tram Museum [NEW_PRODUCER slot]

**Headline.** Inside the Melbourne Tram Museum: Hands-On Transport
History in Hawthorn

**Angle.** The Melbourne Tram Museum sits at 8 Wallen Road in
Hawthorn, presenting transport and social history through exhibition,
education, and conservation. The record describes it as family-oriented
with interactive exhibits and immersive experiences — a small but
distinctive corner of Melbourne's collection landscape worth a fresh
editorial visit, especially for readers planning weekend outings with
kids in tow.

**Anchor listing.** Melbourne Tram Museum (collection — Melbourne).
Slug `melbourne-tram-museum`, ID `1ffa22ee-5285-4a85-aa04-7a0787bf63cd`.

**Verified facts (7, all atomic).**

| # | Claim | Field |
|---|---|---|
| 1 | The Melbourne Tram Museum is located in Hawthorn, Victoria | `suburb` ("Hawthorn") |
| 2 | The museum's street address is 8 Wallen Road | `street_address` ("8 Wallen Road") |
| 3 | The museum explores themes of transport and social history | `description` |
| 4 | Core activities at the museum include exhibition, education, and conservation | `description` |
| 5 | The venue is family-oriented and features interactive exhibits and immersive experiences | `description` |
| 6 | The museum is categorised in the collection vertical and presents as a visitable attraction | `visit_type` ("attraction") |
| 7 | The museum is suitable for trail-based itineraries | `trail_suitable` (true) |

**Editorial framing.** Pitch this as a warm, service-minded discovery
piece — the kind of short read that nudges Melburnians toward an
overlooked weekend stop. Voice should be curious and approachable,
not reverent; the hook is the unexpected pairing of "museum" with
hands-on, kid-friendly play. Suggested structure: open with a scene
at the Hawthorn address, pivot through the three stated activities
(exhibition, education, conservation) as a tidy organising spine,
and close on why a transport-and-social-history pairing rewards a
family visit. Keep the piece tight — the data supports texture, not
a deep history. Resist the urge to speculate on tram models, founding
lore, or the depot's backstory; the record is silent on all of it.

**Research needed (8).** Notable explicit research items: confirm
founded_year before any date or age claim, verify the operating body
(website domain suggests Hawthorn Tram Depot association — must be
verified, not assumed), clarify whether the building or collection
carries any formal heritage status. The "resist the urge to speculate
on tram models, founding lore, or the depot's backstory" line in
framing is the prompt's "research_needed not invention" rule landing
correctly.

**Fact-check.** PASSED — all 7 claims traced.
**Confidence.** 60/90 (below 70-point threshold — surfaces flagged
low-confidence per spec). Missing signals: founding_date_populated
(no founded_year), independence_confirmed (null).
**Bail detection.** null.
**Runtime.** 26.2s.

---

### 4. Apostle Whey Cheese [NEW_PRODUCER slot]

**Headline.** Apostle Whey Cheese: A Single-Origin Dairy on the Great
Ocean Road

**Angle.** At Cooriemungle on Victoria's Great Ocean Road, Julian and
Dianne run a single-origin dairy farm where the cheeses borrow their
names from the coastline itself — Loch Ard Gorgeous Camembert, The
Grotto Washed Rind, Bay of Martyrs Blue Vein. Visitors can walk in for
a $3 tasting flight of 13 cheeses, share a platter at the farmgate
cafe, or join Julian for a two-hour farm tour that moves through the
mooternity ward, the make room and the milking. It's a piece on
agritourism done with genuine warmth, where the farmer doubles as
communicator and the coastline drives the menu.

**Anchor listing.** Apostle Whey Cheese (table — Great Ocean Road).
Slug `apostle-whey-cheese`, ID `1d9c5f2d-e5d2-4e04-bb40-f3d9bf05a1ac`.

**Verified facts (10, all atomic).**

| # | Claim | Field |
|---|---|---|
| 1 | Apostle Whey Cheese is a single-origin dairy farm run by Julian and Dianne at Cooriemungle on the Great Ocean Road | `description` |
| 2 | The $3 tasting covers 13 cheeses and 2 gelato flavours | `description` |
| 3 | The farmgate cafe serves platters, toasties, coffee, and milkshakes made from the cows' own milk | `description` |
| 4 | Cheeses are named for the local coastline, including Loch Ard Gorgeous Camembert, The Grotto Washed Rind, and Bay of Martyrs Blue Vein | `description` |
| 5 | Visitors can watch the cows milked at 4pm every day | `description` |
| 6 | Julian runs a 2-hour farm tour Mon-Fri for $55pp that visits the mooternity ward, the make room and the milking | `description` |
| 7 | Julian is described as a farmer-as-communicator who publishes a monthly video journal | `description` |
| 8 | The farm is open every day of the year except Christmas Day, 8 to 5 | `description` |
| 9 | The creamery is located at 9 Gallum Road, Cooriemungle VIC | `address` |
| 10 | Apostle Whey Cheese is classed as a creamery | `sub_type` ("creamery") |

**Editorial framing.** Pitch this as a warm, second-person agritourism
portrait — the kind of piece a reader saves before driving the Great
Ocean Road. Lead with the coastline-named cheeses as a hook (the
naming gesture does a lot of work cheaply), then widen to the farm
experience: the 4pm milking, the mooternity ward, Julian's tour.
Voice should be unhurried and concrete, leaning on the small, vivid
details already in the record rather than reaching for superlatives.
A useful structural move is to braid the cheese names with the actual
coastal landmarks they reference, letting place and product mirror
each other. Keep the register hospitable; this is a working dairy
that invites you in, not a luxury fromagerie. The monthly video
journal is a nice closing beat — "watch before you go" — that turns
the piece into a practical recommendation rather than a review.

**Research needed (8).** Notably includes confirming
`is_owner_operator` and `independence_confirmed` (both null in the
record), and verifying current pricing on the $3 tasting and $55pp
farm tour.

**Fact-check.** PASSED — all 10 claims traced.
**Confidence.** 60/90 (below 70 threshold). Missing:
founding_date_populated, independence_confirmed.
**Bail detection.** null.
**Runtime.** 29.0s.

---

### 5. Alkina Lodge [NEW_PRODUCER slot]

**Headline.** Sitting Lightly on the Great Ocean Road: Inside Alkina
Lodge

**Angle.** Alkina Lodge offers three private residences on the Great
Ocean Road, designed by Glenn Murcutt and Wendy Lewin to sit lightly
on the land. The pitch is a quiet introduction to a self-contained
retreat at Wattle Hill — stone floors, log fires, and kangaroos at
the window — where guests are advised to provision in Lorne before
arrival. It's a chance to introduce readers to an architect-designed
stay on a stretch of coast better known for its drive than its
dwellings.

**Anchor listing.** Alkina Lodge (rest — Great Ocean Road).
Slug `alkina-lodge`, ID `9a28f587-418e-4165-bdde-05d59e81a454`.

**Verified facts (8, all atomic).**

| # | Claim | Field |
|---|---|---|
| 1 | Alkina Lodge comprises three private residences on the Great Ocean Road | `description` |
| 2 | The residences were designed by Glenn Murcutt and Wendy Lewin | `description` |
| 3 | The design intent is to sit lightly on the land | `description` |
| 4 | Interiors feature stone floors, clean lines, and log fires | `description` |
| 5 | Guests typically see kangaroos at the window most mornings | `description` |
| 6 | The lodge is self-contained and the nearest shops are in Lorne, so guests should stock up before arrival | `description` |
| 7 | Alkina Lodge is located at Wattle Hill on the Great Ocean Road in Victoria | `address` |
| 8 | Alkina Lodge is categorised as a cottage-style stay | `sub_type` ("cottage") |

**Editorial framing.** Lean into the quiet — this is an
architect-designed retreat, not a resort, and the voice should match:
measured, sensory, unhurried. A useful structure is a slow arrival
piece: the drive from Lorne with the boot full of provisions, the
turn off the highway at Wattle Hill, then a walk-through of the three
residences keyed to the textures named in the record (stone, fire,
the morning kangaroo at the glass). Resist the urge to mythologise
the architects beyond what the record states; let the design speak
through what guests actually touch and see. Close on the
self-contained ethos as a feature, not a warning.

**Research needed (7).** Includes confirming founded_year and the
completion date of the Murcutt/Lewin residences, drive time from
Lorne for the provisioning note, and the exact number/layout/naming
of the three residences.

**Fact-check.** PASSED — all 8 claims traced.
**Confidence.** 65/90 (below 70 threshold but +5 above the other two
new-producer pitches — earns `independence_confirmed=true`).
**Bail detection.** null.
**Runtime.** 24.5s.

---

## Cross-listing observations

1. **No echo of the v4 positive examples on this ceremony's pitches.**
   None of the five headlines mirror "Morris of Rutherglen finishes
   single malt in tokay casks" or "Hands in the Clay on Beaufort
   Street" verbatim or near-verbatim. Each pitch authored a fresh
   headline grounded in its own listing's data. The earlier Morris/
   Perth Pottery example-echo concern (raised in v3 + v4 reports)
   was specific to those candidates; it didn't generalise to the
   broader candidate pool.

2. **Black Gate vs Timboon read distinctly.** Both are SBA distilleries
   at the general-slot ceiling (75/90), but the angles and structural
   suggestions are clearly differentiated — Black Gate leans "remote
   location, deliberate posture, fifteen years' vintage"; Timboon leans
   "restored railway shed, named expressions, bush-still folklore". The
   model is not collapsing across SBA distillery pitches.

3. **The two Great Ocean Road venues (Timboon by address, Apostle Whey
   by region, Alkina by region) were treated independently.** Each
   pitch is bounded by its own anchor listing; no model-side
   cross-references invented to link them. This is the spec's
   single-anchor design holding.

4. **Tram Museum and Apostle Whey land at identical confidence (60/90)
   despite very different data shapes.** Both lose the same two
   signals: no `founded_year` (-10), no `independence_confirmed=true`
   (-5). Alkina Lodge gets +5 from `independence_confirmed=true` and
   lands at 65/90. This is the confidence function discriminating
   correctly between thin candidates on a single signal.

5. **One observation worth Matt's attention — derived numeric in
   Black Gate's angle.** The angle contains the phrase "has been
   quietly working there for over fifteen years". 2026 − 2009 = 17.
   "Fifteen years" is a derived value not present in verified_facts
   (which has `founded_year = "2009"` only). This is the same class
   of issue as the v1 Morris "166 Years" bug — a derived numeric
   that bypasses fact-check because fact-check only validates the
   verified_facts array, not the prose. The v4 prompt rule explicitly
   forbids this ("ARITHMETIC and DERIVATION are not allowed"), but
   the rule held only on Timboon, Tram Museum, Apostle Whey, and
   Alkina. Black Gate slipped one through. Single occurrence in a
   five-pitch ceremony; worth noting whether Matt accepts this rate
   as Gate 1-passing or whether it counts as an invented claim
   against the spec's "zero invented claims" bar.

6. **One observation on Alkina Lodge — qualifier in verified_facts[5].**
   The claim text reads *"Guests typically see kangaroos at the window
   **most mornings**"*. The cited field is `description`. The substring
   the fact-check matched is `"kangaroos at the window"`. The
   "**most mornings**" qualifier may or may not be in the full
   description text — fact-check's substring match would accept the
   claim as long as "kangaroos at the window" is present, regardless
   of whether "most mornings" is also literal in the description.
   Worth Matt checking against the actual full description value
   when reading claim-by-claim.

7. **The model surfaced the Timboon region inconsistency itself**
   (research_needed item 4 in Timboon's output) without the brief
   asking it to. This is the prompt's grounding-rule discipline
   working: the model treats the data shape as authoritative but
   flags inconsistencies for the writer rather than papering over
   them.

8. **No CLAUDE.md banned phrases observed across the five.** None of
   the angles, framings, or research_needed items contain:
   "as much as possible", "try to", "when you can ", "we recommend",
   "likely", "probably", "perhaps they", "one imagines", "it stands
   to reason". Spot-check only — Matt's claim-by-claim read is the
   authoritative check.

9. **Atomic-claims rule held on all five pitches.** Total atomic
   facts across the five: 8 + 13 + 7 + 10 + 8 = 46 entries. Zero
   aggregations. The atomic rule (introduced v2, stable across all
   subsequent versions) continues to be the most reliable
   architectural mechanism in this pipeline.

10. **Confidence spread is sensible.** General-slot pitches land at
    75/90 (ceiling). New-producer pitches range 60–65/90 based on
    the +5 differential from `independence_confirmed`. Both
    new-producer pitches without `independence_confirmed=true`
    (Tram Museum, Apostle Whey) land at exactly 60. The single one
    with that flag set (Alkina) lands at 65. The confidence function
    is producing differentiated, interpretable scores.

11. **No corruption like the Morris v4 anomaly.** All five headlines
    are real, grounded English. No `</antml...>` markup leakage, no
    bail tokens. Five-for-five clean generations — consistent with
    the reproduction check (Case A: sampling glitch was a one-off).

---

## Pipeline metadata

| Listing | Slot | Phase 1 | Confidence | Runtime | Bail | Fact-check |
|---|---|---|---|---|---|---|
| black-gate-distillery-mendooran | general | n/a | 75/90 | 22.8s | null | passed |
| timboon-distillery | general | n/a | 75/90 | 25.6s | null | passed |
| melbourne-tram-museum | new_producer | n/a | 60/90 | 26.2s | null | passed |
| apostle-whey-cheese | new_producer | n/a | 60/90 | 29.0s | null | passed |
| alkina-lodge | new_producer | n/a | 65/90 | 24.5s | null | passed |

All five report `prompt_version: phase2-v4-2026-05-22`, model
`claude-opus-4-7`. Total LLM time: 128.1 seconds. Total atomic facts
across all pitches: 46. Total research_needed items across all pitches:
36.

---

## Editorial reading checklist

Matt's authoritative review. Each row below is one verified_facts
entry; the right column is the source field and the value substring
the fact-check function matched (or, for structured fields, the
literal value). For Matt to compare against the actual listing record
field-by-field.

### Black Gate Distillery Mendooran

1. *"Black Gate produces small-batch whisky and rum"* → `description` matches `"Small-batch whisky and rum, made in Mendooran — a wheat-belt town far enough from anywhere that th…"`
2. *"The distillery is located in Mendooran, described as a wheat-belt town"* → `description` (same substring)
3. *"Black Gate has been distilling since 2009, considered early in Australian whisky terms"* → `founded_year` = `"2009"`
4. *"The distillery is owner-operated"* → `is_owner_operator` = `true`
5. *"Black Gate is an independent operator"* → `independence_confirmed` = `true`
6. *"Located at 72 Forrest Road, Mendooran NSW"* → `address` = `"72 Forrest Road, Mendooran NSW 2842, Australia"`
7. *"The venue is visitable as an experiential visit"* → `visit_type` = `"experiential"`
8. *"The distillery is trail-suitable, fitting a detour through the ranges"* → `trail_suitable` = `true`

### Timboon Railway Shed Distillery

1. *"The distillery has been operating since 2007"* → `founded_year` = `"2007"`
2. *"It is family-run"* → `description` matches `"family-run distillery"`
3. *"It operates out of a restored railway shed"* → `description` matches `"restored railway shed"`
4. *"The distillery makes single malt whisky the slow way"* → `description` matches `"making single malt whisky the slow way"`
5. *"Maturation uses ex-fortified wine barrels"* → `description` matches `"ex-fortified wine barrels"`
6. *"Barrels are heavy-charred on site at the distillery's own cooperage"* → `description` matches `"heavy-charred on site at their own cooperage"`
7. *"Notable expressions include the Port Expression, Tom's Surrender and the peated SMOKY 1881"* → `description` matches `"The Port Expression, Tom's Surrender and peated SMOKY 1881 are all worth tasting."`
8. *"The district carries a history of illicit bush-stills that informs the distillery's sense of place"* → `description` matches `"The district's illicit bush-still history hangs over the place like a good story should."`
9. *"The distillery is owner-operated"* → `is_owner_operator` = `true`
10. *"Its independence has been confirmed"* → `independence_confirmed` = `true`
11. *"The venue is set up for an experiential visit"* → `visit_type` = `"experiential"`
12. *"It is located at 1 Bailey St, Timboon, Victoria"* → `address` = `"1 Bailey St, Timboon VIC 3268, Australia"`
13. *"The distillery is suitable for inclusion on a trail itinerary"* → `trail_suitable` = `true`

### Melbourne Tram Museum

1. *"The Melbourne Tram Museum is located in Hawthorn, Victoria"* → `suburb` = `"Hawthorn"`
2. *"The museum's street address is 8 Wallen Road"* → `street_address` = `"8 Wallen Road"`
3. *"The museum explores themes of transport and social history"* → `description` matches `"Melbourne Tram Museum in Hawthorn, VICm explores themes of transport, social history. Core activit…"` (note the `VICm` typo in the description — flag for data cleanup, see Data hygiene findings)
4. *"Core activities at the museum include exhibition, education, and conservation"* → `description` (same substring)
5. *"The venue is family-oriented and features interactive exhibits and immersive experiences"* → `description` (same substring)
6. *"The museum is categorised in the collection vertical and presents as a visitable attraction"* → `visit_type` = `"attraction"`
7. *"The museum is suitable for trail-based itineraries"* → `trail_suitable` = `true`

### Apostle Whey Cheese

1. *"Apostle Whey Cheese is a single-origin dairy farm run by Julian and Dianne at Cooriemungle on the Great Ocean Road"* → `description` matches `"Open every day of the year except Christmas Day, 8 to 5, at Julian and Dianne's single-origin dair…"`
2. *"The $3 tasting covers 13 cheeses and 2 gelato flavours"* → `description` matches `"Walk in for the $3 tasting — 13 cheeses and 2 gelato flavours — or share a platter at the farmgate…"`
3. *"The farmgate cafe serves platters, toasties, coffee, and milkshakes made from the cows' own milk"* → `description` matches `"share a platter at the farmgate cafe with toasties, coffee, milkshakes made from the cows' own mil…"`
4. *"Cheeses are named for the local coastline, including Loch Ard Gorgeous Camembert, The Grotto Washed Rind, and Bay of Martyrs Blue Vein"* → `description` matches `"The cheeses are named for the coastline: Loch Ard Gorgeous Camembert, The Grotto Washed Rind, Bay …"`
5. *"Visitors can watch the cows milked at 4pm every day"* → `description` matches `"Watch the cows milked at 4pm every day."`
6. *"Julian runs a 2-hour farm tour Mon-Fri for $55pp that visits the mooternity ward, the make room and the milking"* → `description` matches `"The 2-hour farm tour with Julian (Mon-Fri, $55pp) takes in the mooternity ward, the make room and …"`
7. *"Julian is described as a farmer-as-communicator who publishes a monthly video journal"* → `description` matches `"Julian is genuinely a farmer-as-communicator, with a monthly video journal that's worth a watch be…"`
8. *"The farm is open every day of the year except Christmas Day, 8 to 5"* → `description` matches `"Open every day of the year except Christmas Day, 8 to 5"`
9. *"The creamery is located at 9 Gallum Road, Cooriemungle VIC"* → `address` = `"9 Gallum Road, Cooriemungle, Cooriemungle VIC"` (note: "Cooriemungle" duplicated in the address — flag for data cleanup, see Data hygiene findings)
10. *"Apostle Whey Cheese is classed as a creamery"* → `sub_type` = `"creamery"`

### Alkina Lodge

1. *"Alkina Lodge comprises three private residences on the Great Ocean Road"* → `description` matches `"Three private residences on the Great Ocean Road, designed by Glenn Murcutt and Wendy Lewin to sit…"`
2. *"The residences were designed by Glenn Murcutt and Wendy Lewin"* → `description` (same substring)
3. *"The design intent is to sit lightly on the land"* → `description` (same substring)
4. *"Interiors feature stone floors, clean lines, and log fires"* → `description` (same substring; verify against the full description text)
5. *"Guests typically see kangaroos at the window most mornings"* → `description` (same substring; **verify the "most mornings" qualifier is actually in the description** — see observation #6)
6. *"The lodge is self-contained and the nearest shops are in Lorne, so guests should stock up before arrival"* → `description` (same substring)
7. *"Alkina Lodge is located at Wattle Hill on the Great Ocean Road in Victoria"* → `address` = `"35 Parkers Access Track Wattle Hill, Wattle Hill VIC"`
8. *"Alkina Lodge is categorised as a cottage-style stay"* → `sub_type` = `"cottage"`

---

## Data hygiene findings (non-blocking, surfaced for Candidate Review)

These are not Gate 1 blockers; they surfaced during the ceremony and
warrant separate fixes after Matt's claim-by-claim review.

1. **`apostle-whey-cheese.region` was NULL pre-ceremony.** Populated
   as `'Great Ocean Road'` (canonical region name per `05-regions.md`,
   matching the venue's location near Cobden, Victoria) before the
   ceremony began. This is a known instance of the regions-
   contamination bug documented in `05-regions.md` — a visitable
   listing that should have a region but didn't. Fixed to unblock the
   new_producer floor for Gate 1. Flagged for inclusion in the broader
   region audit.

2. **`timboon-distillery.region` shows `"Southern Highlands"`** in the
   record but the address (`1 Bailey St, Timboon VIC 3268`) is in
   south-west Victoria, not the Southern Highlands of NSW. The model
   itself caught this inconsistency and flagged it in Timboon's
   research_needed item 4. This is a wrong-value bug (not missing-value
   like Apostle Whey was) and per Matt's direction was deliberately
   not fixed during this ceremony. Flagged for the region audit.

3. **Description typo on `melbourne-tram-museum`.** The description
   text contains `"in Hawthorn, VICm"` (a typo for `"VIC."` or
   `"VIC,"`). The fact-check substring match still passed; the typo
   is visual only. Flagged for description cleanup pass.

4. **Address-duplication on `apostle-whey-cheese.address`.** The
   value reads `"9 Gallum Road, Cooriemungle, Cooriemungle VIC"` —
   the suburb name is duplicated. Likely a sync-pipeline artefact.
   Flagged for address cleanup pass.

5. **Multiple listings have null booleans where data exists.**
   - `melbourne-tram-museum`: `is_owner_operator`,
     `independence_confirmed`, `single_location` all null.
   - `apostle-whey-cheese`: `is_owner_operator`,
     `independence_confirmed`, `single_location` all null despite
     the description naming Julian and Dianne as the operators.
   - `alkina-lodge`: `is_owner_operator`, `single_location` null;
     `independence_confirmed=true` is the only populated boolean.
   These nulls cost confidence points (each
   `independence_confirmed=true` is +5; each missing structured
   signal removes a downstream check). Worth Humanator review to
   determine whether these can be lifted from text content or
   require operator confirmation.

6. **No `founded_year` on three of five listings.** Tram Museum,
   Apostle Whey, and Alkina all have `founded_year=null`. This
   tracks with their new-producer slot assignment but is also
   editorially valuable data that's missing for venues that almost
   certainly have known founding dates (Murcutt-designed lodges
   especially). Flagged for Candidate Review.
