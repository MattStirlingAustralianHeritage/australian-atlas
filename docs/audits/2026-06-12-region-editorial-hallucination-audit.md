# Region editorial — hallucinated venue audit (2026-06-12)

**Scope.** All 86 rows in `regions`: `generated_intro` (52 populated), `long_description` (46), `description` (72). `generated_itinerary` is NULL for every region — nothing to audit there. In every region proposed for cleanup below, `generated_intro` and `long_description` are **byte-identical**, so each deletion applies to both columns. The region page renders `long_description || generated_intro` truncated to the first 250 words; sentences marked **VISIBLE** are inside that window today, the rest are in the stored copy but currently cut off by the truncation (still worth cleaning — the truncation is a render-layer safety net, not a content fix).

**Method.** Read-only extraction of proper-noun phrases from all three fields, cross-referenced against all 6,888 `listings.name` values (exact + word-sequence containment, diacritic/possessive-normalised), with manual review of every flagged sentence and variant-name probes (`ilike`) for ~50 borderline names. Names that matched a listing under a variant (possessives, "Wines"/"Winery" suffixes, former names) were treated as grounded — e.g. Boag's Brewery→James Boag Brewery, Kingsford Homestead→Kingsford The Barossa, 919 Wines, Shaw + Smith, Diablo Distillery, Coolangatta Estate, Eldridge Estate, Bells at Killcare, Kilikanoon, Narkoojee, Rockcliffe, Lark Hill, Ravensworth, Little Dragon Ginger Beer, Cape Byron Spirits.

**Action requested.** Approve (or strike out) the sentence deletions below. Deletion only — no copy regenerated, per policy. On approval I'll generate the cleanup as full-text per-region UPDATEs with `LIKE` guards (the migration-160 pattern) plus before/after snapshots under `docs/audits/2026-06-12-pre-outreach/`, and nothing touches the DB until that migration is reviewed and run.

## Summary

- **84 sentence deletions** across **35 regions** (27 live, 8 draft), citing **111 hallucinated/ungrounded names**.
- **27 of 84** deleted sentences are inside the 250-word window actually rendered on /regions/[slug] today.

| Region | Status | Sentences to delete / total |
|---|---|---|
| adelaide-hills | live | 2 / 29 |
| alice-springs-red-centre | live | 2 / 27 |
| barossa-valley | live | 4 / 32 |
| bellarine-peninsula | live | 3 / 30 |
| blue-mountains | live | 3 / 30 |
| bruny-island | draft | 5 / 31 |
| byron-bay | live | 4 / 19 |
| canberra-district | live | 1 / 24 |
| central-coast | live | 3 / 21 |
| central-victoria | draft | 1 / 25 |
| cradle-country | live | 1 / 29 |
| darwin-top-end | live | 2 / 30 |
| daylesford | live | 1 / 24 |
| east-coast-tasmania | draft | 1 / 24 |
| flinders-ranges | draft | 2 / 23 |
| fremantle-swan-valley | draft | 1 / 27 |
| gippsland | live | 2 / 25 |
| gold-coast-hinterland | draft | 2 / 26 |
| grampians | live | 1 / 27 |
| great-ocean-road | live | 2 / 23 |
| great-southern | live | 1 / 28 |
| hunter-valley | live | 3 / 24 |
| kangaroo-island | live | 5 / 30 |
| launceston-tamar-valley | live | 1 / 22 |
| macedon-ranges | live | 2 / 23 |
| margaret-river | live | 3 / 27 |
| mclaren-vale | live | 1 / 29 |
| mornington-peninsula | live | 6 / 22 |
| noosa-hinterland | draft | 4 / 25 |
| northern-rivers | live | 6 / 25 |
| scenic-rim | live | 2 / 29 |
| shoalhaven | draft | 1 / 23 |
| south-coast-nsw | live | 3 / 25 |
| sunshine-coast-hinterland | live | 2 / 24 |
| yarra-valley | live | 1 / 29 |

---

## Proposed sentence deletions

### adelaide-hills — Adelaide Hills (live, intro = long_description)

**s8** — `Hills & Harvest Roasters` (invented venue, high confidence) · below the 250-word render cut

> This independence extends beyond alcohol production — Hills & Harvest Roasters sources directly from farmers, and accommodations like Buxton Contemporary Guesthouse offer something more personal than chain hospitality.

- Collateral in this sentence: Buxton Contemporary Guesthouse — ACTIVE listing

**s27** — `Adelaide Hills Vineyard Stay` (invented venue, high confidence) · below the 250-word render cut

> The presence of venues like Adelaide Hills Vineyard Stay suggests a tourism infrastructure that complements rather than overwhelms the agricultural base.


### alice-springs-red-centre — Alice Springs & Red Centre (live, intro = long_description)

**s4** — `Arafura Gallery` (invented venue, high confidence) · **VISIBLE on /regions page**

> At Papunya Tula Artists, canvases emerge bearing the dot paintings that revolutionised contemporary Indigenous art in the 1970s, while the Arafura Gallery represents artists from across the central desert region.

- Note: likely a mangle of the real Araluen Arts Centre
- Collateral in this sentence: Papunya Tula Artists — ACTIVE listing

**s14** — `Arafura` (invented venue, high confidence) · below the 250-word render cut

> Mornings might begin with the Telegraph Station's heritage walk before the heat builds, followed by hours spent at Arafura or Papunya Tula watching artists work on canvases that will eventually sell for tens of thousands of dollars.

- Note: secondary reference to the invented gallery
- Collateral in this sentence: Papunya Tula — ACTIVE listing
- Collateral in this sentence: Telegraph Station heritage walk (real place)


### barossa-valley — Barossa Valley (live, intro = long_description)

**s5** — `Tanunda Stone Cottage`, `Angaston Vineyard Guesthouse` (invented venue, high confidence) · **VISIBLE on /regions page**

> The presence of places like Tanunda Stone Cottage and the Angaston Vineyard Guesthouse reflects how the region's accommodation has evolved beyond generic wine tourism—these are properties that understand the valley's particular rhythms, offering stays that align with harvest schedules and vintage releases rather than arbitrary peak seasons.

**s13** — `Wattle Farm Cottages`, `Lyndoch Hill B&B` (invented venue, high confidence) · below the 250-word render cut

> Winter, from June through August, offers a different appeal: pruning season quiet, when places like Wattle Farm Cottages and Lyndoch Hill B&B provide access to a valley focused on maintenance rather than performance.

- Note: a real-world Lyndoch Hill estate exists but no DB listing; "B&B" variant looks invented

**s19** — `Nuriootpa Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> Accommodation like Kingsford Homestead or the Nuriootpa Farm Stay provides the flexibility to extend visits when vintage timing proves unpredictable.

- Collateral in this sentence: Kingsford Homestead — grounded: real listing "Kingsford The Barossa" (its former name)

**s30** — `Eden Valley Glamping`, `Barossa Boutique Hotel` (invented venue, high confidence) · below the 250-word render cut

> Yet places like Eden Valley Glamping and the Barossa Boutique Hotel suggest evolution rather than preservation, offering contemporary interpretations of valley hospitality without abandoning its fundamental character.


### bellarine-peninsula — Bellarine Peninsula (live, intro = long_description)

**s8** — `Bellarine Blend Co` (invented venue, high confidence) · **VISIBLE on /regions page**

> The coffee culture reflects this pragmatism too: Bellarine Blend Co roasts for the local market rather than chasing Melbourne trends, while venues like Drysdale Corner Cafe serve farmers and weekenders with equal regard.

- Collateral in this sentence: Drysdale Corner Cafe — HIDDEN listing (gate-reviewed); extra reason to drop the sentence

**s16** — `Geelong Grain Coffee` (invented venue, high confidence) · below the 250-word render cut

> A thoughtful visit might begin at Geelong Grain Coffee in nearby Geelong before heading south, understanding that the peninsula's pleasures unfold slowly.

**s29** — `Queenscliff Pier Cafe` (invented venue, high confidence) · below the 250-word render cut

> The venues that thrive here—from Queenscliff Pier Cafe's honest seafood to the thoughtful viticulture at Scotchmans Hill—understand that the peninsula's appeal lies not in grand gestures but in doing familiar things exceptionally well, with the confidence that comes from knowing your place in a larger landscape.

- Collateral in this sentence: Scotchmans Hill — ACTIVE listing


### blue-mountains — Blue Mountains (live, intro = long_description)

**s4** — `Leura Garden Guesthouse` (invented venue, high confidence) · **VISIBLE on /regions page**

> The Old Leura Dairy exemplifies the transformation of utilitarian buildings into places of quiet sophistication, while Leura Garden Guesthouse speaks to a tradition of mountain hospitality that predates the current wave of boutique accommodation.

- Collateral in this sentence: The Old Leura Dairy — ACTIVE listing

**s7** — `Blackheath Heritage Cottage` (invented venue, high confidence) · **VISIBLE on /regions page**

> Here, venues like Blackheath Heritage Cottage offer accommodation that feels integral to place rather than imposed upon it.

**s21** — `Mount Wilson Garden Cottage` (invented venue, high confidence) · below the 250-word render cut

> Even accommodation providers like Spicers Sangoma Retreat and Mount Wilson Garden Cottage understand that luxury here means integration with landscape rather than insulation from it.

- Collateral in this sentence: Spicers Sangoma Retreat — ACTIVE listing


### bruny-island — Bruny Island (draft, intro = long_description)

**s5** — `Bruny Island Long House`, `Adventure Bay Retreat`, `Bruny Island Oyster Farm Stay` (invented venue, high confidence) · **VISIBLE on /regions page**

> The accommodation here reflects this same sensibility: places like the Bruny Island Long House and Adventure Bay Retreat occupy their landscapes rather than dominating them, while the Bruny Island Oyster Farm Stay lets visitors wake to the sight of working lease lines stretching across morning-still water.

**s9** — `Great Bay Guesthouse`, `Lunawanna Off-Grid Cabin` (invented venue, high confidence) · below the 250-word render cut

> The tourist buses disappear after Easter, leaving the island to locals and the kind of visitors who understand that rain on a tin roof at Great Bay Guesthouse or the Lunawanna Off-Grid Cabin carries its own satisfaction.

**s17** — `Dennes Point B&B`, `Bruny Island Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> Evenings settle into the rhythm of places like Dennes Point B&B or the Bruny Island Farm Stay, where dinner conversations tend toward local weather patterns and the challenges of island living rather than travel itineraries.

**s22** — `Adventure Bay Retreat` (invented venue, high confidence) · below the 250-word render cut

> The cattle stations that provide accommodation through venues like the Adventure Bay Retreat operate as genuine farms where guests happen to stay, not lifestyle properties dressed up as agriculture.

**s25** — `Lunawanna Off-Grid Cabin`, `Bruny Island Long House` (invented venue, high confidence) · below the 250-word render cut

> The accommodation scattered across the island—from the sustainable approach of the Lunawanna Off-Grid Cabin to the heritage charm of properties like the Bruny Island Long House—reflects individual visions rather than market research.


### byron-bay — Byron Bay (live, intro = long_description)

**s4** — `The Byron Bean` (invented venue, high confidence) · **VISIBLE on /regions page**

> The coffee culture runs deep here too, with roasters like Doma Coffee and The Byron Bean supplying the network of independent cafes that punctuate the Pacific Highway from Mullumbimby to Suffolk Park.

- Note: "Doma Coffee" in the same sentence is a real-world Federal cafe but has no DB listing

**s9** — `Possum Creek Cottage`, `Myocum Ridge Farm Stay` (invented venue, high confidence) · **VISIBLE on /regions page**

> Mornings might begin at Barefoot Barista in Mullumbimby before driving the back roads to Possum Creek Cottage or Myocum Ridge Farm Stay, where the day unfolds without scheduled activities.

- Collateral in this sentence: Barefoot Barista — ACTIVE listing

**s10** — `Bangalow Farmhouse` (invented venue, high confidence) · below the 250-word render cut

> The region rewards slow exploration: following winding lanes that lead to places like Bangalow Farmhouse, stopping at roadside stalls, discovering that Aurum Modern Honey Mead operates from what looks like an ordinary suburban property.

- Collateral in this sentence: Aurum Modern Honey Mead — ACTIVE listing (already flagged for editorial review)

**s14** — `Suffolk Park Beach House`, `Broken Head Glamping` (invented venue, high confidence) · below the 250-word render cut

> The Suffolk Park Beach House or Broken Head Glamping exist because their owners wanted to create something specific to this place, not because market research identified an opportunity.


### canberra-district — Canberra District (live, intro = long_description)

**s16** — `Canberra Wine District B&B` (invented venue, high confidence) · below the 250-word render cut

> The accommodation at Canberra Wine District B&B signals something important about how people actually experience this region — they stay overnight.


### central-coast — Central Coast (live, intro = long_description)

**s7** — `Central Coast Coffee Lab`, `Gosford Bean Project` (invented venue, high confidence) · **VISIBLE on /regions page**

> Meanwhile, specialty coffee roasters like Central Coast Coffee Lab and the Gosford Bean Project have established themselves not as seaside novelties but as serious operations that happen to benefit from the slower pace and lower overheads of regional life.

**s11** — `Terrigal Brew Co` (invented venue, high confidence) · below the 250-word render cut

> Autumn and late winter offer the most honest version of the place, when Terrigal Brew Co draws a local crowd and the Bouddi Coastal Walk reveals why serious walkers make the drive north from Sydney.

- Collateral in this sentence: Bouddi Coastal Walk — ACTIVE listing

**s18** — `Central Coast Coffee Lab` (invented venue, high confidence) · below the 250-word render cut

> The presence of operations like Central Coast Coffee Lab—roasting serious single origins for a local market that has learned to appreciate them—suggests a maturation that has happened organically, driven by changing demographics and rising expectations rather than external investment.

- Note: second reference to the invented roaster


### central-victoria — Central Victoria (draft, intro = long_description)

**s5** — `Henslow`, `Carlo Mondavi`, `Elliott Stanton` (fabricated facts around a real listing, high confidence) · **VISIBLE on /regions page**

> In Henslow, Carlo Mondavi and Elliott Stanton have spent fifteen years perfecting their vermouths at Maidenii, working with local winemakers to create aperitifs that speak to place rather than imitation.

- Note: Maidenii (Vermouth) IS an active listing, but it is made in Harcourt by Gilles Lapalus & Shaun Byrne — the town and both founders here are fabricated (Carlo Mondavi is a Napa winemaker)


### cradle-country — Cradle Country (live, intro = long_description)

**s5** — `Cradle Mountain Glamping Pods` (invented venue, med confidence) · **VISIBLE on /regions page**

> The Cradle Mountain Glamping Pods reflect this tension beautifully—offering visitors a way to sleep within earshot of currawongs and Bennetts wallabies while maintaining the comfort expected by travellers who might otherwise choose the heritage rooms at Cradle Mountain Lodge.

- Collateral in this sentence: Cradle Mountain Lodge — ACTIVE listing


### darwin-top-end — Darwin & Top End (live, intro = long_description)

**s6** — `Darwin Brewery and Brewing Company`, `Territory Brewing` (invented venue, high confidence) · **VISIBLE on /regions page**

> The city's independent breweries — Darwin Brewery and Brewing Company, Territory Brewing — serve beer designed for heat, consumed in beer gardens where the conversation flows between Indigenous languages, accented English, and Bahasa Indonesia.

- Note: auto-match of "Brewing Company" to Akasha (Sydney) is spurious

**s14** — `Elbow Room`, `Beagle Bay` (invented venue, med confidence) · below the 250-word render cut

> Days begin early — dawn at Mindil Beach before the heat builds, coffee from small roasters like Elbow Room or Beagle Bay, then retreating to air-conditioned spaces during the brutal middle hours.

- Note: Beagle Bay is a Dampier Peninsula community, not a Darwin roaster
- Collateral in this sentence: Mindil Beach Sunset Market — ACTIVE listing


### daylesford — Daylesford & Hepburn Springs (live, intro = long_description)

**s13** — `Lost Trades Gallery`, `Books` (invented venue, med confidence) · below the 250-word render cut

> The real discovery happens wandering Vincent Street's independent shops—Lost Trades Gallery for seriously made objects, Books at Bendigo Street for first editions and local histories, and the numerous studios where potters and jewellers work with doors open to the street.

- Note: possible mangles of the real-world Lost Trades Fair (Kyneton); neither shop is in the DB


### east-coast-tasmania — East Coast Tasmania (draft, intro = long_description)

**s5** — `Freycinet Peninsula Farm Stay` (invented venue, high confidence) · **VISIBLE on /regions page**

> Further inland, Freycinet Peninsula Farm Stay operates from working farmland where guests stay in converted shearing quarters, waking to the sound of sheep rather than waves.


### flinders-ranges — Flinders Ranges (draft, intro = long_description)

**s4** — `Quorn Heritage Farmstead` (invented venue, high confidence) · **VISIBLE on /regions page**

> The region's small towns reveal its pastoral heritage: Quorn, once a railway junction town where the old Ghan line turned west toward Alice Springs, now serves visitors drawn to properties like Quorn Heritage Farmstead, where working station life continues alongside accommodation.

**s5** — `Wilpena Pound Eco-Lodge` (invented venue, high confidence) · **VISIBLE on /regions page**

> Further north, the natural amphitheatre of Wilpena Pound—known as Ikara to the Adnyamathanha people—anchors the Flinders Ranges National Park and supports enterprises like Wilpena Pound Eco-Lodge and Ikara Safari Camp.

- Note: real-world resort is "Wilpena Pound Resort" (not in DB)
- Collateral in this sentence: Wilpena Pound Lookout, Flinders Ranges National Park, Ikara Safari Camp — all ACTIVE listings; heavy collateral


### fremantle-swan-valley — Fremantle & Swan Valley (draft, intro = long_description)

**s5** — `Gertrude & Alice` (confabulated geography, high confidence) · **VISIBLE on /regions page**

> The cappuccino strip along South Terrace reflects this layered identity: Italian families who arrived in the 1950s established the coffee culture that craft roasters like Gertrude & Alice have since refined.

- Note: real Gertrude & Alice is a Bondi bookshop-cafe, not a Fremantle craft roaster


### gippsland — Gippsland (live, intro = long_description)

**s14** — `Gippsland Lakeside Retreat` (invented venue, high confidence) · below the 250-word render cut

> The Gippsland Lakes system invites hours of doing very little: watching pelicans work the shallows, following unmarked tracks to swimming spots, or simply sitting on the deck of somewhere like Gippsland Lakeside Retreat while the light changes.

**s23** — `Gippsland Wilsons Prom Eco Lodge` (invented venue, high confidence) · below the 250-word render cut

> Places like Gippsland Wilsons Prom Eco Lodge understand that luxury here means proximity to something rare rather than thread count or marble surfaces.


### gold-coast-hinterland — Gold Coast Hinterland (draft, intro = long_description)

**s4** — `Gold Coast Hinterland Treehouse` (invented venue, high confidence) · **VISIBLE on /regions page**

> The Mouses House and Gold Coast Hinterland Treehouse represent accommodation that works with the forest canopy rather than clearing it, while Binna Burra Lodge maintains its position as the gateway to Lamington National Park's walking tracks.

- Collateral in this sentence: The Mouses House, Binna Burra Lodge — ACTIVE listings

**s24** — `Gold Coast Hinterland Retreat` (invented venue, high confidence) · below the 250-word render cut

> Similarly, the boutique accommodation scattered through the region succeeds not just on comfort but on the promise of connection to place – the sound of lyrebirds at the Gold Coast Hinterland Retreat, the ancient Antarctic beech trees visible from Binna Burra Lodge.

- Collateral in this sentence: Binna Burra Lodge — ACTIVE listing


### grampians — Grampians (live, intro = long_description)

**s13** — `Grampians Eco Retreat`, `Grampians Wilderness Glamping` (invented venue, high confidence) · below the 250-word render cut

> But locals know that autumn and winter offer the region at its most compelling—fewer visitors on the walking tracks, clearer air for photography from lookouts like Boroka, and the kind of crisp mornings that make staying at places like Grampians Eco Retreat or Grampians Wilderness Glamping feel less like accommodation and more like temporary residence in genuinely wild country.


### great-ocean-road — Great Ocean Road (live, intro = long_description)

**s4** — `Apollo Bay Clifftop Cottage` (invented venue, high confidence) · **VISIBLE on /regions page**

> The accommodation scattered along this coast reflects a similar ethos—places like Alkina Lodge and the Apollo Bay Clifftop Cottage speak to travelers seeking something beyond the standard coastal motel experience.

- Collateral in this sentence: Alkina Lodge — ACTIVE listing

**s5** — `Wye River Coastal Cottage` (invented venue, high confidence) · **VISIBLE on /regions page**

> These properties, along with retreats like Wye River Coastal Cottage, suggest a region that has learned to host visitors without surrendering its character to them.


### great-southern — Great Southern (live, intro = long_description)

**s25** — `Stirling Range Homestead`, `Denmark River Cottage` (invented venue, high confidence) · below the 250-word render cut

> The accommodation reflects this practical character: Stirling Range Homestead offers farm-stay accommodation that connects visitors to the agricultural reality of the region, while Denmark River Cottage provides river-access lodging that feels integral to its landscape rather than imposed upon it.


### hunter-valley — Hunter Valley (live, intro = long_description)

**s11** — `Woolshed Cabin`, `Pokolbin Vineyard Cottage` (invented venue, high confidence) · below the 250-word render cut

> Winter offers the valley at its most contemplative—wood smoke from the accommodation properties like Woolshed Cabin and Pokolbin Vineyard Cottage, pruned vines standing in orderly lines, and cellar doors that actually have time for conversation.

**s12** — `Broke Fordwich Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> Spring brings the yellow of mustard flowers between the vines and the return of the hot air balloons that drift over properties like Broke Fordwich Farm Stay at sunrise.

**s16** — `Lovedale Glamping Estate`, `Broke Fordwich Guesthouse` (invented venue, high confidence) · below the 250-word render cut

> The accommodation options reflect this unhurried approach—places like Lovedale Glamping Estate and Broke Fordwich Guesthouse are designed for stays of several days rather than overnight stops.


### kangaroo-island — Kangaroo Island (live, intro = long_description)

**s8** — `Kangaroo Island Clifftop`, `Eco Lodge at Western River` (invented venue, high confidence) · **VISIBLE on /regions page**

> Properties like Kangaroo Island Clifftop and the Eco Lodge at Western River don't merely provide rooms; they offer immersion in landscapes where sunrise over Nepean Bay or the sound of waves at Stokes Bay becomes part of the experience.

- Note: auto-match of "Eco Lodge" to Lumera (Tasmania) is spurious

**s10** — `Penneshaw Farm Stay`, `Stokes Bay Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> Even simpler stays like Penneshaw Farm Stay or Stokes Bay Farm Stay understand that luxury here means space, silence, and the kind of darkness that reveals stars invisible from mainland cities.

**s15** — `Vivonne Bay Eco Lodge` (invented venue, high confidence) · below the 250-word render cut

> Spring transforms everything — the wildflowers emerge, the echidnas become active, and properties like Vivonne Bay Eco Lodge find themselves perfectly positioned for whale watching as southern rights begin their migration.

**s19** — `Western River Wilderness Camp` (invented venue, med confidence) · below the 250-word render cut

> This is when places like Western River Wilderness Camp make most sense — when the luxury lies not in thread counts but in the ability to sleep under stars that seem impossibly close.

**s27** — `Kingscote Boutique Hotel` (invented venue, high confidence) · below the 250-word render cut

> The Kangaroo Island Spirits distillery might be closed for a private wedding, False Cape might be harvesting when planned tastings were scheduled, accommodation at places like Kingscote Boutique Hotel might be booked solid during sheep sales in town.

- Collateral in this sentence: Kangaroo Island Spirits, False Cape Wines — ACTIVE listings


### launceston-tamar-valley — Launceston & Tamar Valley (live, intro = long_description)

**s8** — `Pipers River Vineyard` (misnamed real listing, high confidence) · below the 250-word render cut

> Now the valley hosts operations like Pipers River Vineyard, where Andrew Pirie's pioneering work with cool-climate varieties continues under new ownership, and smaller producers like Delamere Vineyard, where the Fenton family crafts sparkling wine using traditional Champagne methods.

- Note: misnaming of the real ACTIVE listing "Pipers Brook Vineyard" (Andrew Pirie attribution is accurate). Deletion proposed per policy; a one-word fix (River→Brook) would salvage the sentence if you prefer
- Collateral in this sentence: Delamere Vineyard — ACTIVE listing


### macedon-ranges — Macedon Ranges (live, intro = long_description)

**s12** — `Woodend Manor Guesthouse` (invented venue, high confidence) · below the 250-word render cut

> Snow occasionally dusts Mount Macedon, transforming venues like Lake House Daylesford into something approaching alpine luxury, while places such as Woodend Manor Guesthouse become refuges for those who understand that a fireplace and local wine constitute adequate entertainment.

- Collateral in this sentence: Lake House Daylesford — ACTIVE listing (note: it is in Daylesford, an odd inclusion for a Macedon page anyway)

**s15** — `Trentham Gardeners Retreat` (invented venue, high confidence) · below the 250-word render cut

> The Trentham Gardeners Retreat attracts visitors who appreciate that luxury sometimes means silence rather than service, while establishments like Coliban Valley Wines succeed because they understand their audience — people who know wine but don't need to prove it.

- Collateral in this sentence: Coliban Valley Wines — ACTIVE listing


### margaret-river — Margaret River (live, intro = long_description)

**s10** — `Cowaramup Farmstead B&B` (invented venue, high confidence) · below the 250-word render cut

> March through May offers the sweet spot: harvest activity animates the wineries, ocean temperatures remain warm enough for comfortable swimming, and accommodation like Cape Lodge and Cowaramup Farmstead B&B operates without the summer premium.

- Collateral in this sentence: Cape Lodge — ACTIVE listing

**s15** — `Boranup Forest Glamping` (invented venue, high confidence) · below the 250-word render cut

> The region's accommodation reflects this dual character: places like Boranup Forest Glamping offer proximity to natural attractions, while established properties understand that many guests prefer not to drive after a proper cellar door afternoon.

**s23** — `South West Coffee Co` (invented venue, med confidence) · below the 250-word render cut

> Even coffee roasters like South West Coffee Co source beans with the same attention to provenance that defines the wine industry, creating a consistency of approach that extends well beyond grape-based beverages.


### mclaren-vale — McLaren Vale (live, intro = long_description)

**s18** — `The McLaren Vale Wine Barn`, `McLaren Vale Cellar Cottage` (invented venue, high confidence) · below the 250-word render cut

> The McLaren Vale Wine Barn and McLaren Vale Cellar Cottage represent a newer development—accommodation that understands the region's appeal lies in slowing down rather than packing in experiences.


### mornington-peninsula — Mornington Peninsula (live, intro = long_description)

**s6** — `Peninsula Coffee Co` (invented venue, med confidence) · **VISIBLE on /regions page**

> Red Hill Brewery and Hop Hen Brewing represent a newer layer of artisanal production, while venues like Peninsula Coffee Co in Dromana indicate that quality-focused food culture extends beyond wine and into daily necessities.

- Collateral in this sentence: Red Hill Brewery, Hop Hen Brewing — ACTIVE listings

**s11** — `The Roasting Shed` (invented venue, med confidence) · below the 250-word render cut

> Winter strips away pretence—this is when you appreciate the Peninsula Hot Springs without queuing, when the coastal paths reveal their stark beauty, and when venues like The Roasting Shed in Red Hill serve their purpose as community gathering points rather than tourist destinations.

- Collateral in this sentence: Peninsula Hot Springs — ACTIVE listing

**s14** — `Peninsula Filter House` (invented venue, high confidence) · below the 250-word render cut

> A thoughtful visit might begin with coffee at Peninsula Filter House before driving the winding Red Hill roads, stopping at farm gates and cellar doors as inclination suggests rather than itinerary demands.

**s15** — `Red Hill Vineyard BnB` (invented venue, high confidence) · below the 250-word render cut

> The geography encourages this kind of meandering—you might find yourself at Eldridge Estate's vineyard restaurant for lunch, then walking the clifftop paths near Portsea in the afternoon, before settling into accommodation like the Red Hill Vineyard BnB where the evening vista extends across the region's rolling topography.

- Collateral in this sentence: Eldridge Estate — ACTIVE listing (possessive form broke the auto-match)

**s16** — `Main Ridge Glamping` (invented venue, high confidence) · below the 250-word render cut

> The Peninsula rewards those who resist the urge to tick boxes, who understand that places like Main Ridge Glamping exist not as novelty but as ways to engage more directly with the landscape that defines this region.

**s20** — `Mornington Peninsula Hot Springs Lodge`, `Flinders Farmhouse` (invented venue, high confidence) · below the 250-word render cut

> The presence of venues like Mornington Peninsula Hot Springs Lodge alongside working vineyards and coastal retreats like Flinders Farmhouse suggests a region comfortable with its contradictions.

- Note: "…Hot Springs Lodge" is an invented variant of the real listing "Peninsula Hot Springs"


### noosa-hinterland — Noosa Hinterland (draft, intro = long_description)

**s4** — `Eumundi Hills Retreat`, `Cooroy Mountain Glamping` (invented venue, high confidence) · **VISIBLE on /regions page**

> Places like Eumundi Hills Retreat and Cooroy Mountain Glamping emerged from this impulse, offering visitors the chance to wake to kookaburra calls rather than traffic.

**s5** — `Kin Kin Cottage` (invented venue, high confidence) · **VISIBLE on /regions page**

> The proliferation of farm stays, from intimate operations like Kin Kin Cottage to larger holdings around Pomona, reflects how many properties have evolved beyond pure agriculture into enterprises that welcome outsiders without sacrificing their rural integrity.

**s10** — `Noosa Hinterland Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> School holidays see a spike in bookings at places like Noosa Hinterland Farm Stay, but the region never feels overwhelmed—there's simply too much space and too many back roads for proper crowding.

**s18** — `Eumundi Hinterland Homestead` (invented venue, high confidence) · below the 250-word render cut

> Properties like Eumundi Hinterland Homestead occupy land that has been grazed for generations, and the region's emerging food culture grows directly from this agricultural foundation.


### northern-rivers — Northern Rivers (live, intro = long_description)

**s5** — `Bangalow Hinterland Guesthouse` (invented venue, high confidence) · **VISIBLE on /regions page**

> In Bangalow, where the Bangalow Hinterland Guesthouse occupies a restored 1920s home, antique shops line the main street and locals gather at weekend markets that predate Instagram by decades.

**s6** — `Federal Village Glamping` (invented venue, high confidence) · **VISIBLE on /regions page**

> Further west, Federal's single street houses Federal Village Glamping, testament to how even accommodation here embraces the unhurried pace.

**s7** — `Hinterland Roasting Co` (invented venue, high confidence) · **VISIBLE on /regions page**

> The region's coffee culture runs deeper than tourism demands—Hinterland Roasting Co sources beans from local farms while River House Coffee operates from a converted Lismore warehouse, serving regulars who measure quality by consistency rather than novelty.

- Collateral in this sentence: River House Coffee — HIDDEN listing (gate-reviewed); extra reason to drop the sentence

**s14** — `Byron Grain Cafe` (invented venue, high confidence) · below the 250-word render cut

> A thoughtful visit might begin with coffee at Byron Grain Cafe, where the baristas know their regular customers by order rather than name, then continue to the Saturday markets where second-generation stallholders sell produce their parents first hawked from roadside tables.

**s16** — `Kingscliff Surf Lodge` (invented venue, high confidence) · below the 250-word render cut

> At Kingscliff Surf Lodge, guests fall asleep to Pacific waves that have travelled uninterrupted from New Zealand, while at Lune de Sang, French-influenced hospitality meets Australian casualness in ways that work better than they should.

- Collateral in this sentence: Lune de Sang — HIDDEN listing (real Federal property, hidden at gate review); sentence would still name it publicly

**s20** — `Byron Hinterland Beans` (invented venue, high confidence) · below the 250-word render cut

> This is evident in venues like Byron Hinterland Beans, which roasts coffee for cafes throughout the region while maintaining the personal relationships that chains cannot replicate.


### scenic-rim — Scenic Rim (live, intro = long_description)

**s15** — `Scenic Rim Dairy` (invented venue, med confidence) · below the 250-word render cut

> Mornings often begin with farm gate purchases — raw milk from Scenic Rim Dairy or stone fruit from the orchards around Stanthorpe's spillover properties.

- Note: real-world dairies here are Scenic Rim 4Real Milk / Tommerup’s; this name is in neither the DB nor the real world as written

**s27** — `Scenic Rim Mountain Lodge`, `Scenic Rim Mountain Cottage` (invented venue, high confidence) · below the 250-word render cut

> Here, properties like Scenic Rim Mountain Lodge and Scenic Rim Mountain Cottage offer accommodation that reflects the region's agricultural heritage rather than imported notions of luxury.


### shoalhaven — Shoalhaven (draft, intro = long_description)

**s14** — `Tea Gardens` (confabulated geography, med confidence) · below the 250-word render cut

> Afternoons unfold around the simple pleasures—oysters pulled fresh from the Shoalhaven River, wine tasting at estates where the owners still pour the tastings, swims in the Tea Gardens' freshwater rock pools when the ocean gets too rough.

- Note: Tea Gardens is a Mid-North Coast town ~300km away, not a Shoalhaven swim spot


### south-coast-nsw — South Coast NSW (live, intro = long_description)

**s10** — `Big Swing Brewing` (invented venue, high confidence) · below the 250-word render cut

> Winter sees serious fishermen working the rock platforms around Montague Island while breweries like Bodalla's Big Swing Brewing offer proper refuge from coastal squalls.

- Collateral in this sentence: Montague Island — ACTIVE listing reference

**s13** — `Wharf Road Brewing` (invented venue, med confidence) · below the 250-word render cut

> A proper South Coast visit unfolds over long lunches at places like Wharf Road Brewing in Narooma, where the brewery overlooks the working harbor rather than a resort marina.

**s19** — `Dune Coffee Roasters` (invented venue, med confidence) · below the 250-word render cut

> The region's breweries, like Dune Coffee Roasters in Merimbula, emerged from local demand rather than tourist strategy.

- Note: sentence also calls a coffee roaster a brewery


### sunshine-coast-hinterland — Sunshine Coast Hinterland (live, intro = long_description)

**s4** — `Montville Mist Retreat` (invented venue, med confidence) · **VISIBLE on /regions page**

> Montville presents a more curated face to visitors, its Germanic architecture and manicured gardens reflecting decades of deliberate tourism development, yet family-run enterprises like the Montville Mist Retreat demonstrate how local operators have shaped this evolution rather than simply responding to it.

- Note: "Montville Mist" is a real-world spring-water brand; the retreat is not in the DB

**s8** — `Maleny Orchard Glamping` (invented venue, high confidence) · below the 250-word render cut

> This is when locals visit Kondalilla Falls and Booloumba Creek, when the swimming holes are bracingly cold but the walking conditions ideal, and when accommodation like Maleny Orchard Glamping offers its clearest mountain vistas without the summer humidity.

- Collateral in this sentence: Kondalilla Falls, Booloumba Creek — ACTIVE listings


### yarra-valley — Yarra Valley (live, intro = long_description)

**s11** — `Warburton Ranges Glamping`, `Healesville Farm Stay` (invented venue, high confidence) · below the 250-word render cut

> For those preferring canvas to stone, Warburton Ranges Glamping positions safari tents where the valley meets mountain ash forest, while places like Healesville Farm Stay let visitors participate in actual farm life rather than observe it from a distance.


---

## Real-world businesses name-dropped but NOT in the listings DB (no deletion proposed — your call)

These are verifiable real venues/institutions the generator name-dropped. They aren't hallucinations, but they also aren't grounded in DB records, and several promote non-network businesses on Atlas pages:

- **barossa-valley**: Seppelt, Gramp (historic cellar-door surnames — historical context, low risk)
- **central-west-nsw**: Racine, Lolli Redini (real Orange restaurants); Orange Farmers Market; Orange Food Week
- **clare-valley**: Jeffrey Grosset, Peter Barry, Kevin Mitchell, Stephanie Toole (real winemakers, all attached to grounded listings)
- **daylesford**: Hepburn Bathhouse (real institution, 3 mentions)
- **east-coast-tasmania**: Freycinet Marine Farm (real, famous oyster farm — candidate for actual listing?)
- **fremantle-swan-valley**: Sail & Anchor (real pub), Sandalford + Houghton + Pinelli (grounded via variant listings), Fremantle Doctor (weather, fine)
- **great-southern**: Rockcliffe (grounded via "Rockcliffe Winery")
- **launceston-tamar-valley**: Stillwater (grounded-ish via "Stillwater Seven"), Black Cow Bistro (real), Harvest Market (real), Princess Theatre (real), Seahorse World (real), La Provence (real 1950s vineyard — accurate history)
- **limestone-coast**: Wynns, Bowen, Majella (real Coonawarra families/brands)
- **mclaren-vale**: Fox Creek Wines (real winery, not in DB)
- **sunshine-coast-hinterland**: Maleny Dairies (real), Maleny Folk Festival (real, historic)
- **toowoomba-darling-downs**: Extracted Coffee (real Toowoomba roaster, not in DB)
- **alice-springs-red-centre**: Emu Run (real tour operator), Papunya Tula Artists (grounded listing)
- **central-coast**: Bells at Killcare (grounded listing — auto-matcher split the name)

## Mentions grounded only by HIDDEN listings

- **northern-rivers**: River House Coffee, Lune de Sang — both hidden at gate review; both sentences are already in the deletion list above.
- **bellarine-peninsula**: Drysdale Corner Cafe — hidden; sentence already in the deletion list.
- **adelaide** (description): "Central Market" matches hidden listing "Central Market Grind", but the copy plainly means the real Adelaide Central Market — no action.

## Factual wobbles on GROUNDED listings (FYI — no deletion proposed)

- **scenic-rim s7**: claims Scenic Rim Brewery "operates from Yatala" — the listing says Mount Alford. Yatala is where the XXXX-scale megabrewery is; mildly embarrassing.
- **canberra-district s4**: "Shaw Wines operates from the original 1999 plantings on the shores of Lake George" — Shaw's vineyard is at Murrumbateman; the Lake George shoreline winery is Lerida Estate. (Also the "Shaw Wines" listing row has suburb=Orange — possible data wobble worth a look.)
- **great-ocean-road s3**: "Great Ocean Road Brewing in Lorne" — the listing's suburb is South Geelong.
- **macedon-ranges s12**: cites Lake House (Daylesford) on the Macedon page — grounded but geographically odd.

## Regions audited clean (nothing invented found)

adelaide, broome-kimberley, bundaberg, cairns-tropical-north, capricorn, coral-coast, fleurieu-peninsula, fraser-coast, golden-outback, goulburn-valley, great-barrier-reef, hobart, hobart-city, melbourne, mildura-mallee, murray-river, murray-river-lakes-coorong, perth, phillip-island, riverland, snowy-mountains, southern-highlands, tamar-valley, tarkine-west-coast, yorke-peninsula — plus all regions with no editorial at all. (Their remaining extraction flags were geography, grape varieties, people, or Atlas self-references.) central-west-nsw, clare-valley, limestone-coast and toowoomba-darling-downs have no invented venues either — only the real-world name-drops listed above.
