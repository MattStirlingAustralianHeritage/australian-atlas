# Way Atlas Backfill Brief -- 9 Listings for Editorial Re-Approval

Generated: 2026-05-25

Status of pipeline: Component 5 sync is live. Re-approvals via Candidate
Review will atomically rewrite way_meta and push to operators.

Approval flow:
1. Open /admin/candidates, filter to Way vertical
2. Find candidate by slug or name
3. Fill in or correct the 4A editorial classification panel per the
   suggested classification in this brief
4. Click Approve
5. Listing should appear at wayatlas.com.au/operators/<slug> within seconds

Total estimated editorial time: ~60-90 minutes for all 9.


===================================================================
1. Otway Eco Tours
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: otway-eco-tours)
Website: https://platypustours.net.au/

SUMMARY (from website)
Small-group platypus tours by canoe on Lake Elizabeth in the Great Otway
National Park, run out of Forrest, VIC. Groups capped at seven, with dawn
and dusk sessions. 95% sighting rate. Also runs rockpooling, Great Ocean
Walk, and glowworm tours. Licensed by Parks Victoria. The operator closes
mid-July to mid-September during platypus breeding season.

INDEPENDENCE CHECK
Status: PASS
Single independent operator. No group affiliation signals on website.
Family/small business presentation throughout.

GATE 4 RELEVANCE
POTENTIAL -- website mentions "indigenous history of the area" as part of
Great Ocean Walk tour content, but this appears to be incidental geographic
context rather than core cultural interpretation. Primary business is
wildlife (platypus) tours with no Aboriginal cultural content claims on
the main platypus tour pages. Check website wording before approving to
confirm no substantive cultural interpretation is being delivered.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: Great Ocean Road (429efcba-2867-4f77-ba91-42174d38021d)
  Rationale: Forrest is in the Otway hinterland, part of the Great Ocean Road region.
operating_regions: Great Ocean Road
departure_point: Forrest Brewing Company, 26 Grant Street, Forrest VIC
accreditations: ["eco_cert"]
  (Ecotourism certified per website; Parks Victoria licensed)
presence_type: seasonal
  (Closes mid-July to mid-September for platypus breeding season)
established_year: not stated
  (Website says "twenty-five years" which implies ~1999-2001, but no exact year given. Portal description says the same. Leave blank or enter 2000 as approximate.)
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above. The atomic
write will create way_meta and push to operators table.

NOTES
- Strong character listing. Wildlife specialist with genuine conservation
  ethic (closes for breeding season). Featured by Australian Geographic,
  BBC, Ray Mears.
- operating_season_months: suggest [1,2,3,4,5,6,10,11,12] to reflect the
  mid-July to mid-September closure.
- Website URL in portal points to /environment subpage; homepage is
  https://platypustours.net.au/ -- may want to update to homepage.


===================================================================
2. Margaret River Discovery Co
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: margaret-river-discovery-co)
Website: https://margaretriverdiscovery.com.au/

SUMMARY (from website)
Sean Blocksidge runs small-group wine and adventure tours out of a single
Land Rover Discovery, capped at six guests. Flagship tour combines
Margaret River canoeing, Wilyabrup Cliffs walking (Cape to Cape section),
and a single-winery lunch at Fraser Gallop Estate. Described as WA Guide
of the Year. Bronze at Australian Tourism Awards. Books out weeks ahead.

INDEPENDENCE CHECK
Status: PASS
Single-operator, single-vehicle business. No group affiliation whatsoever.
About as independent as it gets.

GATE 4 RELEVANCE
Not applicable -- website mentions "Aboriginal and European history of the
region" as incidental tour narration. No claims of interpreting Aboriginal
sacred sites, ceremony, or traditional knowledge. Core business is wine,
walking, and wildlife.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: Margaret River (184a15f9-a7b5-4096-b263-4643a1f2375e)
operating_regions: Margaret River
departure_point: Margaret River (exact pickup point not published; implied region-based collection)
accreditations: ["eco_cert"]
  (Ecotourism Certified per website. Emissions Reduction Commitment also mentioned.)
presence_type: year_round
established_year: not stated
  (Website says "eighteen years" which implies ~2006-2008. Portal description says the same. No exact year published.)
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above.

NOTES
- Very strong character listing. Single-operator, single-vehicle, capped
  at six. Pure Way Atlas material.
- sub_type is guided_walk_day which fits the Cape to Cape day walk element,
  though the tours are more hybrid (canoe + walk + wine). The primary_type
  could also be four_wheel_drive_expedition given the Land Rover is central.
  Matt's call on which primary_type best fits.
- secondary_types could include: ["four_wheel_drive_expedition"] if primary
  is guided_walk_day, or vice versa.


===================================================================
3. Untamed Escapes
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: untamed-escapes)
Website: https://untamedescapes.com.au/

SUMMARY (from website)
Hassie and Jo built this from Coodlie Park Farm Retreat (purchased 1998)
through Australian Wildlife Adventures (2016) to the Untamed Escapes
rebrand (October 2021). Family-owned multi-region touring company
anchored on the Eyre Peninsula. Multi-day small-group tours across SA,
WA, and NT with a conservation and regenerative travel focus. 20+ years
working with Greening Australia. Cultural components are delivered by
Aboriginal partner operators on their own Country.

INDEPENDENCE CHECK
Status: PASS
Family-owned and operated. "An Australian family owned and operated
company" stated on about page. No corporate parent or franchise signals.
TripADeal mentioned as a distribution partner (sub-contracting), not an
owner.

GATE 4 RELEVANCE
POTENTIAL -- the operator runs a "1-Day Port Lincoln / Galinyala Cultural
Tour" described as exploring Aboriginal heritage of the Eyre Peninsula.
However, the portal description explicitly states "cultural tours are
delivered by Aboriginal partner operators on their own country -- Maba Idi
on Barngarla, Koomal Dreaming on Wadandi-Bibbulman, Maruku Arts at Uluru."
This is a partnership model where Aboriginal operators deliver their own
cultural content. Untamed Escapes holds ROC (Respecting Our Culture)
certification, which is the accreditation for working with Aboriginal
communities. The operator is NOT themselves interpreting Aboriginal
culture -- they facilitate access to Aboriginal-led experiences.

Recommendation: operator_type = independent (not aboriginal_partnership).
The aboriginal_partnership type implies the operator IS a partnership
between Aboriginal and non-Aboriginal parties. Untamed Escapes is a
non-Aboriginal operator that partners WITH Aboriginal operators for
specific tour components. ROC accreditation supports this reading.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: (NO MATCH -- Eyre Peninsula region does not exist in regions table)
  Matt: consider creating an Eyre Peninsula region, or use Adelaide as a fallback.
  Port Lincoln is 660km from Adelaide so Adelaide is a poor geographic match.
  Set to NULL for now.
operating_regions: Eyre Peninsula, Flinders Ranges, Adelaide Hills, Kangaroo Island, Margaret River, Nullarbor, Red Centre
  (Multi-region operator -- tours span SA, WA, and NT)
departure_point: Adelaide, Perth, Port Lincoln (multiple departure points)
accreditations: ["eco_cert", "roc", "climate_action"]
  (Advanced Ecotourism, ROC Certified, Climate Action Innovator)
presence_type: year_round
  (Tours available year-round with seasonal variation in specific itineraries)
established_year: 2004
  (Hassie and Jo started touring operations in 2004 per portal description.
  About page says Untamed Escapes brand launched October 2021 but the
  business continuity is from 2004.)
operator_legal_name: not stated
  (Formerly "Nullarbor Traveller" per portal description, though about
  page doesn't mention this name -- references "Australian Wildlife
  Adventures" as the 2016 brand.)
multiple_departure_points: true

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above. Note the
primary_region gap -- no Eyre Peninsula region exists. Either create one
or leave primary_region_id NULL.

NOTES
- Strong conservation story. Regenerative travel positioning with genuine
  substance (Greening Australia partnership, volunteer hours on tour).
- sub_type is four_wheel_drive_expedition. Multi-day bus touring might not
  be a perfect fit but is the closest primary_type in the Way taxonomy.
- The multiple_departure_points flag should be TRUE -- they depart from
  Adelaide, Perth, Port Lincoln, and other locations depending on tour.
- Portal listing has state: null and suburb: null -- may want to set
  state to "SA" as the anchor state.
- The listing description mentions "Nullarbor Traveller" as the previous
  name but the about page calls the predecessor "Australian Wildlife
  Adventures" (2016). Minor discrepancy -- both may be correct at
  different stages. Matt may want to verify.


===================================================================
4. Calypso Star Charters
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: calypso-star-charters)
Website: https://sharkcagediving.com.au/

SUMMARY (from website + web search)
Shark cage diving with great white sharks and sea lion snorkelling out of
Port Lincoln, SA. Founded 1990 by Rolf Czabayski; purchased by Ron Forster
in 2006. Only one-day operator in Australia permitted to use natural fish
berley. Tours run to Neptune Islands Marine Park (Ron and Valerie Taylor
Marine Park), three hours each way. Also runs sea lion snorkel tours to
Hopkins/Langton/Blythe Islands.

INDEPENDENCE CHECK
Status: PASS
Locally owned single-vessel charter operation. No group affiliation
signals. Green Travel Guide lists as independent operator.

GATE 4 RELEVANCE
Not applicable -- no cultural content claims on website. Marine wildlife
operator.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: (NO MATCH -- Eyre Peninsula region does not exist in regions table)
  Same gap as Untamed Escapes. Port Lincoln is on the Eyre Peninsula.
  Set to NULL unless an Eyre Peninsula region is created.
operating_regions: Eyre Peninsula (Port Lincoln, Neptune Islands, Spencer Gulf)
departure_point: 3/10 South Quay Boulevard, Port Lincoln SA
accreditations: ["eco_cert", "climate_action"]
  (Advanced Ecotourism, Climate Action Leader per Green Travel Guide)
presence_type: weather_dependent
  (3-hour ocean crossing to Neptune Islands. Operations are inherently
  weather-dependent. The portal listing says "permanent" but
  weather_dependent is more accurate for a deep-sea charter.)
established_year: 1990
operator_legal_name: Calypso Star Charters Pty Ltd (per ZoomInfo listing)

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above. Note the
primary_region gap.

NOTES
- Website is thin -- homepage and subpages returned minimal content via
  fetch. May be a JavaScript-heavy or image-based site. The portal
  description is richer than the website text.
- Website URL in portal is https://sharkcagediving.com.au/environment
  (a subpage). Homepage is https://sharkcagediving.com.au/ -- may want
  to update.
- Ownership change: Rolf Czabayski founded 1990, Ron Forster purchased
  2006. Current ownership is Ron Forster per web search. Emma Forster
  (daughter) appears in Wikipedia as associated with the business.
- sub_type dive_operator is correct. secondary_types could include
  ["specialist_natural_history"] given the wildlife focus.


===================================================================
5. Cape Byron Kayaks
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: cape-byron-kayaks)
Website: https://www.capebyronkayaks.com/

SUMMARY (from website)
Byron Bay's first dolphin kayak operator, running since 1995 from Clarkes
Beach. Sit-on-top kayak tours in the Cape Byron Marine Park to find
resident bottlenose dolphins, with sea turtles and migrating humpbacks in
season. Non-motorised, solar-powered beach office. Licensed by Cape Byron
Conservation Area Trust, Byron Shire Council, NSW Maritime, and Cape Byron
Marine Park.

INDEPENDENCE CHECK
Status: PASS
Independent local operator licensed through multiple government bodies.
No group affiliation signals. Single-location, single-activity operation.

GATE 4 RELEVANCE
POTENTIAL -- about page references "sites of cultural significance to
Aboriginal people" and "aboriginal history" as part of tour learning
experiences. This is peripheral educational narration in a marine wildlife
context, not a dedicated cultural interpretation program. Arakwal
(Bundjalung Nation) acknowledgement statement on homepage.

Recommendation: Not applicable for Gate 4 purposes. The cultural
references are incidental geographic/historical context, not structured
Aboriginal cultural interpretation.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: Byron Bay (d5d8e24f-78cf-4c8a-9266-94f140f3d8c2)
operating_regions: Byron Bay
departure_point: Opposite 62 Lawson Street, Byron Bay (Clarkes Beach)
accreditations: ["eco_cert"]
  (Eco Certified, EcoStar. NSW Regional Tourism Awards Bronze.)
presence_type: year_round
  (Operates year-round with seasonal timing adjustments. Summer = early
  morning. Winter = later morning. Some weather dependence implied.)
established_year: 1995
  (Website says "Since 1995". Portal description says 1996. Website is
  likely authoritative -- use 1995.)
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above.

NOTES
- Clean listing. Single-activity marine wildlife operator with strong
  eco credentials.
- Website URL in portal is https://www.capebyronkayaks.com/sustainability/
  (a subpage). Homepage is https://www.capebyronkayaks.com/ -- may want
  to update.
- Portal description says "first operator to do so in Byron Bay" and
  "Ecotourism Australia Advanced Eco Certified" -- website confirms Eco
  Certified but "Advanced" level not explicitly stated on the pages
  fetched. The EcoStar badge may indicate Advanced tier.


===================================================================
6. Cape to Cape Explorer Tours
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: cape-to-cape-explorer-tours)
Website: https://capetocapetours.com.au/

SUMMARY (from website)
Gene Hardy founded Cape to Cape Explorer Tours in 2010 as Margaret River's
dedicated Cape to Cape Track hiking operator. Multi-day guided and
self-guided itineraries from 5-8 days on the 132km coastal trail between
Cape Naturaliste and Cape Leeuwin. In-house catering and accommodation at
Surfpoint Resort. Full team of named track guides. Also runs Bibbulmun
Track adventures.

INDEPENDENCE CHECK
Status: PASS
Founder-led single-focus operation. Gene Hardy as Managing Director with
a named team of guides. No group or franchise signals. Owns/operates
accommodation (Surfpoint Resort) as part of the integrated experience.

GATE 4 RELEVANCE
Not applicable -- website expresses "deep respect for nature and the
indigenous Wadandi people as the traditional custodians of the region" and
guides share knowledge that includes Wadandi acknowledgement, but this is
cultural respect/acknowledgement in the context of a hiking operation, not
structured Aboriginal cultural interpretation. No Aboriginal cultural
tours, no ceremony access, no traditional knowledge programs.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: Margaret River (184a15f9-a7b5-4096-b263-4643a1f2375e)
  Rationale: The Cape to Cape Track runs through the Margaret River/
  Leeuwin-Naturaliste region.
operating_regions: Margaret River
departure_point: 1/24 Auger Way West, Margaret River WA
  (Office address. Surfpoint Resort is the accommodation hub.)
accreditations: ["eco_cert"]
  (Eco Star accredited. WA Tourism Awards gold 2017, 2018; bronze 2019,
  2021. 2025 Sir David Brand Young Award.)
presence_type: year_round
established_year: 2010
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above.

NOTES
- Very strong listing. Award-winning, founder-led, dedicated single-trail
  operator. High character.
- secondary_types could include ["guided_walk_day"] since they also run
  day walk options alongside the multi-day signature.
- Portal description mentions 2025 Sir David Brand Award -- website
  confirms this is the "Local Tourism Legend and Sir David Brand Young
  Awards" from 2025 WA Tourism Awards.


===================================================================
7. Cape Tribulation Horse Rides
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: cape-tribulation-horse-rides)
Website: https://www.capetribhorserides.com.au/

SUMMARY (from website)
Gerry and Jackie run two 90-minute horse rides daily (10am and 1:30pm)
from their Cape Tribulation Road property. Walking pace only, suitable for
beginners. Route goes from rainforest down to Myall Beach. Horses live
unfenced on the property. On Eastern Kuku Yalanji Country at the
confluence of Daintree Rainforest and Great Barrier Reef (two UNESCO World
Heritage sites).

INDEPENDENCE CHECK
Status: PASS
Owner-operators Gerry and Jackie. No group affiliation signals. "Cape Trib
Camping" referenced as an associated booking partner (likely co-located
camping ground) but no corporate parent.

GATE 4 RELEVANCE
APPLICABLE -- website states guides "share stories of Country, native
plants and animals, and the deep cultural history of the Daintree." The
phrase "deep cultural history" and "stories of Country" indicates some
level of cultural interpretation beyond mere geographic narration. Operates
on Eastern Kuku Yalanji Country.

However: the depth of cultural authority is unclear from the website. The
guides (Gerry and Jackie) do not appear to be Aboriginal. The "stories of
Country" language could range from genuine traditional knowledge shared
with permission to general natural history narrated through a cultural
lens.

Recommendation: Flag for editorial review. Matt should assess whether the
cultural content claimed on the website rises to Gate 4 threshold. If it's
general nature narration branded as "cultural," operator_type = independent
is appropriate. If they are genuinely interpreting Kuku Yalanji cultural
knowledge, Gate 4 requires documented Traditional Owner involvement.

SUGGESTED CLASSIFICATION
operator_type: independent
  (Pending Matt's Gate 4 assessment. If cultural content is substantive,
  may need aboriginal_partnership or hold for verification.)
primary_region: Cairns & Tropical North (2f404040-9f49-4a2f-a36b-190dce079f6e)
operating_regions: Cairns & Tropical North (Cape Tribulation / Daintree)
departure_point: 3812 Cape Tribulation Road, Cape Tribulation QLD 4873
accreditations: none stated
presence_type: year_round
  (2 rides daily, year-round. Some weather dependence implied but daily
  schedule suggests year_round as primary type.)
established_year: not stated
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Hold -- flag for editorial review. The "stories of Country" and "deep
cultural history" language on the website needs Matt's assessment against
Gate 4 criteria before approving. If he determines it's incidental nature
narration, approve as independent. If it's substantive cultural
interpretation, hold for Kuku Yalanji Traditional Owner verification.

NOTES
- The listing name in the portal is "CAPE TRIBULATION HORSE RIDES"
  (all caps). May want to normalise to title case on re-approval:
  "Cape Tribulation Horse Rides" or "Cape Trib Horse Rides".
- Website is simple and authentic. Small family operation. The horse
  welfare story (unfenced, not rushed) is genuine Way Atlas character.
- No accreditations found -- this is notable for a tourism operator
  on World Heritage land. Not disqualifying but unusual.


===================================================================
8. iSail Whitsundays
===================================================================

URL: (not yet on Way Atlas -- pending re-approval)
Admin: https://www.australianatlas.com.au/admin/candidates (filter: isail-whitsundays)
Website: https://isailwhitsundays.com/

SUMMARY (from website)
Luke (competitive sailor since age 9) and Isabelle (German, met Luke on
a 2006 sailing tour) launched iSail Whitsundays in July 2007 with yacht
Iceberg. Now runs four vessels -- Blizzard (Beneteau monohull, 3-4
nights), two Fontaine Pajot Bahia catamarans (Entice and On Ice, 2
nights), and Whitehaven Dreamer. 10 passengers maximum per tour. 9
departures per week, 12 months a year. Small-group multi-day sailing
through the Whitsunday Islands with snorkelling, paddleboards, and sea
scooter.

INDEPENDENCE CHECK
Status: PASS
Family-owned company. Luke and Isabelle purchased vessels independently.
No corporate parent mentioned. "Family owned company" stated on about page.

Minor note: image URLs on the website reference "thetravelshop.com" domain,
which appears to be a booking/reseller platform rather than a corporate
parent. Not an independence concern.

GATE 4 RELEVANCE
Not applicable -- acknowledgement of Ngaro People of the Whitsunday Islands
and mainland tribes. No cultural interpretation claims. Marine sailing
operator.

SUGGESTED CLASSIFICATION
operator_type: independent
primary_region: (NO MATCH -- no Whitsundays region in regions table)
  Townsville (8312dae6) is the nearest existing region but is a poor
  geographic match (Airlie Beach is 270km south of Townsville). Set to
  NULL unless a Whitsundays region is created.
operating_regions: Whitsunday Islands
departure_point: Airlie Beach, QLD
accreditations: none stated
  (No accreditations found on website or about page.)
presence_type: year_round
  (9 departures per week, 12 months a year -- explicitly stated.)
established_year: 2007
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
No way_meta row exists for this listing.

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review with the classification above. Note the
primary_region gap -- no Whitsundays region exists.

NOTES
- Clean listing. Family-owned sailing charter with genuine character
  (Luke's competitive sailing background, Isabelle's origin story).
- The portal has the name as "ISail Whitsundays" (capital I, capital S)
  but the website uses "iSail Whitsundays" (lowercase i). May want to
  normalise to the website's version on re-approval.
- Four vessels, 10-pax max, multi-day format. This is premium small-group
  sailing, not a day-trip cattle boat. Strong Way Atlas fit.
- secondary_types could include ["dive_operator"] given the snorkelling
  component, though snorkelling is probably incidental to the sailing.


===================================================================
9. Dolphin Wild Island Cruises (RE-APPROVAL CORRECTION)
===================================================================

URL: https://wayatlas.com.au/operators/dolphin-wild-island-cruises
Admin: https://www.australianatlas.com.au/admin/candidates (filter: dolphin-wild-island-cruises)
Website: https://www.dolphinwild.com.au/

SUMMARY (from website + portal description)
David Boon and Hayley Creamer have run Dolphin Wild out of Newport Marina
on Brisbane's Redcliffe Peninsula for over 30 years on the catamaran
Supercat. Day trip to Mulgumpin (Moreton Island) for guided snorkel through
the Tangalooma Wrecks (15 deliberately scuttled hulls) and beach time. Also
runs sunset cruises and private charters. The vessel doubles as a Master 45
commercial maritime training platform for Sea School International.
Quandamooka Country.

INDEPENDENCE CHECK
Status: PASS
Owner-operators for 30+ years. No group affiliation signals. The Sea
School International connection is a dual-use of the vessel, not a
corporate parent.

GATE 4 RELEVANCE
Not applicable -- Quandamooka Country acknowledgement only. No claims of
interpreting Aboriginal cultural content. Marine wildlife and snorkelling
operator.

CURRENT CLASSIFICATION (INCORRECT)
operator_type: cultural_content_non_indigenous  <-- WRONG
  This renders as "Cultural Operator" on Way Atlas. Dolphin Wild is a
  standard independent sailing/snorkelling charter operator, not a cultural
  content provider.

CORRECTED CLASSIFICATION
operator_type: independent
primary_region: Brisbane (361cd83c-0c7a-4725-b7d5-b4982ee0ec07)
  (Already set correctly in existing way_meta)
operating_regions: Brisbane (Moreton Bay, Moreton Island / Mulgumpin)
  (Already set correctly)
departure_point: Newport Marina, Redcliffe Peninsula, Brisbane
  (Currently NULL in way_meta -- should be filled)
accreditations: ["eco_cert"]
  (Already set correctly in existing way_meta)
presence_type: year_round
  (Already set correctly)
established_year: 1994
  (Already set correctly -- ~1994 based on "over 30 years")
operator_legal_name: not stated

WHAT'S CURRENTLY IN WAY_META
listing_id: 1cef59bd-bac1-4354-a8ab-b47c44476a87
primary_type: sailing_charter
secondary_types: ["dive_operator"]
operator_type: cultural_content_non_indigenous  <-- needs correction to "independent"
operator_legal_name: null
aboriginal_community: null
presence_type: year_round
operating_season_months: []
primary_region_id: 361cd83c (Brisbane)
operating_region_ids: [361cd83c (Brisbane)]
departure_point_name: null  <-- should be "Newport Marina, Redcliffe Peninsula"
multiple_departure_points: false
contact_email: null
contact_name: null
booking_url: null
established_year: 1994
accreditations: ["eco_cert"]
claim_status: null
cultural_authority_verified: false

WHAT MATT NEEDS TO DO
Re-approve via Candidate Review to correct:
1. operator_type: cultural_content_non_indigenous --> independent
2. departure_point_name: null --> Newport Marina, Redcliffe Peninsula
The re-approval will overwrite way_meta and push corrected data to the
operators table, fixing the "Cultural Operator" label on wayatlas.com.au.

NOTES
- The incorrect cultural_content_non_indigenous classification may have
  been a data entry error during initial classification, or the
  Quandamooka Country reference in the description was misinterpreted as
  cultural content delivery.
- This listing already exists in the Way Atlas operators table (pushed
  during Component 7 Path A backfill with source_id 74b26a39). The
  re-approval will update the existing operators row via upsert.
- secondary_types ["dive_operator"] is reasonable for the Tangalooma
  Wrecks snorkel component.


===================================================================
REGION GAPS IDENTIFIED
===================================================================

Two regions are missing from the portal regions table that affect these
listings:

1. EYRE PENINSULA (SA) -- affects Calypso Star Charters (#4) and
   Untamed Escapes (#3). Port Lincoln is the hub. No existing region
   covers this area (Adelaide is 660km away).

2. WHITSUNDAYS (QLD) -- affects iSail Whitsundays (#8). Airlie Beach
   is the gateway. Townsville is the nearest existing region but is
   270km north.

Matt: consider creating these regions before or alongside the
re-approvals, or approve with primary_region_id = NULL and backfill
later.


===================================================================
COMPLETION CHECKLIST
===================================================================

[ ] 1. Otway Eco Tours
[ ] 2. Margaret River Discovery Co
[ ] 3. Untamed Escapes
[ ] 4. Calypso Star Charters
[ ] 5. Cape Byron Kayaks
[ ] 6. Cape to Cape Explorer Tours
[ ] 7. Cape Tribulation Horse Rides
[ ] 8. iSail Whitsundays
[ ] 9. Dolphin Wild Island Cruises (re-approval to correct classification)

After all 9 complete, verify Way Atlas catalogue:
[ ] Visit wayatlas.com.au -- confirm catalogue density looks healthy
[ ] Spot-check 3 random listings render correctly
[ ] Query operators table -- confirm 16 published rows total (7 existing + 9 re-approvals)
