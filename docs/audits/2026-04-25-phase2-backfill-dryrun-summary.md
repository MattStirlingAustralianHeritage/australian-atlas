# Phase 2 Backfill — Dry-Run Summary

**Date:** 2026-04-25
**Mode:** DRY-RUN (no DB writes)
**Trigger:** Manual invocation of `scripts/phase2-backfill.mjs` prior to Phase 2 apply run
**Duration:** 16.8s

## Pre-flight

| Metric | Value |
|---|---|
| Eligible listings (active + visitable=true + lat/lng not null) | **6509** |
| Listings that would match a live/draft region polygon | 3084 |
| Listings that would get NULL (projected quarantine) | **3425** |
| Non-visitable active listings (skipped per Edge Case 11) | 4 |
| Active listings missing lat or lng (ineligible) | 31 |
| Live/draft regions used in this run | 14 |

## Distribution by region

| Region | Slug | State | Status | Listings | Share |
|---|---|---|---|---|---|
| Melbourne | `melbourne` | VIC | live | 718 | 11.03% |
| Sydney | `sydney` | NSW | live | 462 | 7.10% |
| Perth | `perth` | WA | live | 407 | 6.25% |
| Adelaide | `adelaide` | SA | live | 372 | 5.72% |
| Brisbane | `brisbane` | QLD | live | 215 | 3.30% |
| Canberra District | `canberra-district` | ACT | live | 172 | 2.64% |
| Hobart & Southern Tasmania | `hobart` | TAS | live | 166 | 2.55% |
| Hobart City | `hobart-city` | TAS | live | 127 | 1.95% |
| Darwin & Top End | `darwin-top-end` | NT | live | 111 | 1.71% |
| Byron Bay | `byron-bay` | NSW | live | 102 | 1.57% |
| Hunter Valley | `hunter-valley` | NSW | live | 92 | 1.41% |
| Adelaide Hills | `adelaide-hills` | SA | live | 63 | 0.97% |
| Orange | `orange` | NSW | live | 42 | 0.65% |
| Mudgee | `mudgee` | NSW | live | 35 | 0.54% |

Regions ordered by listing count desc. Trigger logic sorts polygons by `ST_Area ASC, id ASC` (smallest first) so listings inside multiple overlapping polygons resolve to the smallest-area match. Example: a listing in the City of Hobart LGA is inside both Hobart City (small) and Hobart & Southern Tasmania (large) — it resolves to Hobart City per that ordering.

## Projected quarantine — NULL assignment breakdown by vertical

| Vertical | Listings with proposed_region = NULL |
|---|---|
| sba | 1225 |
| craft | 1125 |
| collection | 636 |
| rest | 161 |
| field | 158 |
| found | 40 |
| fine_grounds | 36 |
| corner | 36 |
| table | 8 |

### sba — 1225 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `mount-nathan-winery` | Mount Nathan Winery | -27.9986171 | 153.2603912 | Mount Nathan |
| `castle-rock-estate` | Castle Rock Estate | -34.6906711 | 117.9462656 | Porongurup |
| `bowen-estate` | Bowen Estate | -37.342429 | 140.845593 | Penola |
| `elysian-springs` | Elysian Springs | -34.7422429 | 139.0726037 | Mount Pleasant |
| `pindarie` | Pindarie | -34.5261099 | 138.8724014 | Gomersal |
| `hollick-wines` | Hollick Wines | -37.3549687 | 140.8428603 | Coonawarra |
| `tallagandra-hill-winery` | Tallagandra Hill Winery | -35.0498478 | 149.1693737 | Gundaroo |
| `sandhurst-ridge` | Sandhurst Ridge | -36.7149314 | 144.1519775 | Bendigo |
| `little-creatures-cider-geelong` | Little Creatures Cider | -38.164952 | 144.3617283 | Geelong |
| `wolf-lane-distillery` | Wolf Lane Distillery | -16.9219966 | 145.7779388 | Byron Bay |
| `mayford-winery` | Mayford Winery | -36.68798 | 146.9032 | Porepunkah |
| `reef-distillers` | Reef Distillers | -23.1596221 | 150.708752 | Hidden Valley |
| `hold-fast-distillery` | Hold Fast Distillery | -35.4394858 | 149.8001977 | Braidwood |
| `rusden-wines` | Rusden Wines | -34.5212211 | 138.9936218 | Vine Vale |
| `trentham-estate-winery-cellar-door-and-restaurant` | Trentham Estate - Winery, Cellar Door & Restaurant | -34.2303114 | 142.2461703 | Trentham Cliffs |
| `iron-hills-meadery` | Iron Hills Meadery | -28.1019139 | 153.4140166 | Burleigh Heads |
| `big-tree-distillery-door-tasting-room` | Big Tree Distillery Door Tasting Room | -37.2896044 | 144.6422243 | Newham |
| `pemberley-of-pemberton-book-in-for-a-wine-experience` | Pemberley of Pemberton | Book in for a Wine Experience | -34.3939908 | 116.0535295 | Eastbrook |
| `de-bortoli-riverina` | De Bortoli Riverina | -34.275694 | 146.143648 | Riverina |
| `wineglass-bay-brewing` | Wineglass Bay Brewing | -42.169703 | 148.3039545 | East Coast |

### craft — 1125 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `hoskings-jewellers-vic` | Hoskings Jewellers | -38.1750203 | 146.2609035 | — |
| `ballarat-custom-furniture-and-restoration` | Ballarat Custom Furniture and Restoration | -37.605405 | 143.781099 | — |
| `creative-play-and-art-centre-ballarat` | Creative Play & Art Centre Ballarat | -37.5426031 | 143.7926225 | — |
| `cairns-jewellery-boutique` | Cairns Jewellery Boutique | -16.9229938 | 145.7777907 | — |
| `nicole-viney-jewellery` | Nicole Viney Jewellery | -41.164552 | 146.233841 | Cradle Country |
| `green-studio` | Green Studio | -37.8792851 | 147.9907558 | — |
| `fletcher-print` | Fletcher Print | -37.5767778 | 143.8228069 | — |
| `bass-view-timber-creations` | Bass View Timber Creations | -40.996884 | 147.0926119 | — |
| `fleece-fibre-yarn` | Fleece, Fibre, Yarn | -41.3986712 | 147.0844794 | — |
| `weavery` | weavery | -26.7278919 | 153.018506 | — |
| `russell-street-studios` | Russell Street Studios | -41.4275641 | 147.1362378 | — |
| `woodsong-fine-furniture` | Woodsong Fine Furniture | -16.9233951 | 145.7738473 | — |
| `z-and-g-carpentry` | Z & G Carpentry | -37.338325 | 144.1401356 | — |
| `revive-timber-designs` | Revive Timber Designs | -26.4521 | 153.0165848 | — |
| `craftlandia` | Craftlandia | -37.3471209 | 144.1550343 | — |
| `clay-wollongong` | Clay Wollongong | -34.4203309 | 150.8939451 | — |
| `lake-cathie-pottery` | Lake Cathie Pottery | -31.5442011 | 152.8553421 | — |
| `gabbinbar` | Gabbinbar | -27.6096771 | 151.958405 | — |
| `smartprint-group` | Smartprint Group | -27.5695488 | 151.9512539 | — |
| `crystalline-pottery` | Crystalline Pottery | -31.577307 | 152.812014 | — |

### collection — 636 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `castlemaine-botanical-gardens` | Castlemaine Botanical Gardens | -37.055568 | 144.21246 | Central Victoria |
| `port-macquarie-regional-museum` | Port Macquarie Regional Museum | -31.4333 | 152.9082 | Port Macquarie |
| `logan-art-gallery` | Logan Art Gallery | -27.651753 | 153.110859 | Scenic Rim |
| `flecker-botanic-gardens` | Flecker Botanic Gardens | -16.899603 | 145.747702 | Cairns & Tropical North |
| `beechworth-historic-precinct` | Beechworth Historic Precinct | -36.3582 | 146.6882 | Beechworth |
| `illawarra-performing-arts-centre` | Illawarra Performing Arts Centre | -34.426486 | 150.898375 | Southern Highlands |
| `flinders-island-museum` | Flinders Island Museum | -40.119511 | 148.017005 | Whitemark |
| `whyalla-maritime-museum` | Whyalla Maritime Museum | -32.776976 | 137.532558 | Whyalla |
| `mbantua-gallery` | Mbantua Gallery | -23.6994 | 133.8811 | Alice Springs |
| `queen-victoria-museum-and-art-gallery` | Queen Victoria Museum and Art Gallery | -41.425499 | 147.139202 | Launceston & Tamar Valley |
| `emu-valley-rhododendron-garden` | Emu Valley Rhododendron Garden | -41.099282 | 145.907305 | Cradle Country |
| `greenough-historical-settlement` | Greenough Historical Settlement | -28.854427 | 114.654146 | Greenough |
| `ravenswood-heritage-centre` | Ravenswood Heritage Centre | -20.097937 | 146.886097 | Ravenswood |
| `bright-botanical-gardens` | Bright Botanical Gardens | -36.730731 | 146.983389 | Bright |
| `charters-towers-heritage-precinct` | Charters Towers Heritage Precinct | -20.080749 | 146.254908 | Charters Towers |
| `glen-innes-history-and-heritage-centre` | Glen Innes History & Heritage Centre | -29.733775 | 151.72516 | Glen Innes |
| `gilgandra-rural-museum` | Gilgandra Rural Museum | -31.828692 | 148.638487 | Gilgandra |
| `lark-quarry-trackways-conservation-park` | Lark Quarry Trackways Conservation Park | -22.99215 | 142.410501 | Winton |
| `lake-bolac-pioneer-museum` | Lake Bolac Pioneer Museum | -37.6952 | 142.892483 | Grampians |
| `tamworth-regional-botanic-garden` | Tamworth Regional Botanic Garden | -31.084842 | 150.924451 | Tamworth |

### rest — 161 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `cubby-and-co-at-mount-majura-vineyard` | Cubby and Co at Mount Majura Vineyard | -35.284464 | 139.501612 | Lime Kiln Rd, Australian Capital Territory |
| `closeburn-house` | Closeburn House | -33.579469 | 150.245603 | 2 Closeburn Dr |
| `cradle-mountain-lodge` | Cradle Mountain Lodge | -41.59502 | 145.927797 | Cradle Country |
| `the-boutique-hotel-blue-mountains` | The Boutique Hotel Blue Mountains | -33.640239 | 150.284789 | 194 Great Western Hwy |
| `cicada-lodge` | Cicada Lodge | -14.337299 | 132.424756 | Katherine |
| `empire-spa-retreat` | Empire Spa Retreat | -33.639694 | 115.02619 | Yallingup |
| `evans-hotel-bed-breakfast-bealiba` | Evans Hotel Bed & Breakfast Bealiba | -36.788524 | 143.550954 | 38 Main St |
| `oldbury-cottage-berrima` | Oldbury Cottage Berrima | -34.493806 | 150.332989 | 7 Oldbury St |
| `lune-de-sang` | Lune de Sang | -28.821641 | 153.418599 | Northern Rivers |
| `silky-oaks-lodge` | Silky Oaks Lodge | -16.460157 | 145.354794 | Cairns & Tropical North |
| `losari-retreat` | Losari Retreat | -33.917477 | 115.134303 | 498 Osmington Road, Margaret River |
| `glasshouse-mountains-ecolodge` | Glasshouse Mountains Ecolodge | -26.921236 | 152.940303 | 198 Barrs Road, Glass House Mountains |
| `broken-river-mountain-resort` | Broken River Mountain Resort | -21.159381 | 148.500873 | Eungella Dam Rd |
| `cicada-luxury-camping` | Cicada Luxury Camping | -34.670063 | 150.821196 | 127 Jerrara Rd |
| `qualia-hamilton-island` | Qualia Hamilton Island | -20.333024 | 148.946847 | Whitsundays |
| `harland-rise-chapel` | Harland Rise Chapel | -41.547071 | 147.269958 | 46 Dalness Road,  Evandale |
| `parcoola-retreats-riverside-escape` | Parcoola Retreats Riverside Escape | -34.14903 | 140.29506 | 14376 Goyder Hwy |
| `eco-beach-resort` | Eco Beach Resort | -16.025752 | 128.423664 | 323 Great Northern Highway, Broome |
| `sensom-bed-and-breakfast` | Sensom Bed and Breakfast | -30.229838 | 153.136636 | 235 The Mountain Way |
| `depot-beach-cabins` | Depot Beach Cabins | -35.628673 | 150.324206 | South Coast NSW |

### field — 158 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `mount-sonder-lookout` | Mount Sonder Lookout | -23.6333 | 132.3667 | Red Centre |
| `mount-kosciuszko-summit` | Mount Kosciuszko Summit | -36.4564 | 148.2632 | Snowy Mountains |
| `daintree-rainforest-boardwalk` | Daintree Rainforest Boardwalk | -16.25 | 145.4333 | Daintree |
| `kangaroo-island-coastal` | Kangaroo Island Coastal Walk | -35.95 | 137.1833 | Kangaroo Island |
| `talaroo-hot-springs` | Talaroo Hot Springs | -18.5833 | 143.95 | Gulf Savannah |
| `barron-falls-lookout` | Barron Falls Lookout | -16.85 | 145.6417 | Cairns & Surrounds |
| `drew-lookout` | Drew Lookout | -25.05 | 148.2167 | Central Queensland |
| `best-of-all-lookout-springbrook` | Best of All Lookout | -28.2333 | 153.2667 | Springbrook |
| `ebor-falls` | Ebor Falls | -30.4 | 152.35 | New England |
| `dead-horse-gap-walk` | Dead Horse Gap Walk | -36.5333 | 148.2833 | Snowy Mountains |
| `peterson-creek-wildlife-botanical-walking-track` | Peterson Creek – Wildlife & Botanical Walking Track | -17.269217 | 145.580372 | Yungaburra QLD 4884 |
| `castle-cove-lookout-gor` | Castle Cove Lookout | -38.6667 | 143.1 | Great Ocean Road |
| `katherine-gorge` | Katherine Gorge | -14.3167 | 132.4167 | Katherine |
| `twin-falls-kakadu` | Twin Falls Kakadu | -13.4167 | 132.5833 | Kakadu |
| `figure-eight-pools-royal` | Figure Eight Pools | -34.1833 | 151.0583 | Royal National Park |
| `pinnacle-walk-grampians` | The Pinnacle Walk | -37.1764 | 142.4278 | Grampians |
| `urimbirra-wildlife-park` | Urimbirra Wildlife Park | -35.519275 | 138.632693 | 10 Welch Road, Victor Harbor |
| `ningaloo-coast` | Ningaloo Coast | -22.6833 | 113.6833 | Gascoyne |
| `jewel-cave-wa` | Jewel Cave | -34.2667 | 115.0833 | Margaret River |
| `cania-gorge-qld` | Cania Gorge | -24.6667 | 150.95 | Bundaberg & Surrounds |

### found — 40 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `bottom-of-the-harbour-antiques` | Bottom of the Harbour Antiques | -28.868947 | 153.417721 | 46 Red Ln |
| `scottys-trading` | Scottys Trading | -28.008497 | 153.398334 | Gold Coast Hinterland |
| `vintage-traders-emporium` | Vintage Traders Emporium | -37.064942 | 146.104049 | 10 Crosbys Ln |
| `raleigh-secondhand-barn` | Raleigh Secondhand Barn | -30.464361 | 153.004704 | 116 Old Pacific Hwy |
| `the-shop-in-the-bush` | The Shop in the Bush | -41.294128 | 148.186148 | 25977 Tasman Hwy |
| `daylesford-antiques` | Daylesford Antiques | -37.3486 | 144.1529 | — |
| `bendigo-antiques` | Bendigo Antiques & Collectables | -36.758 | 144.28 | — |
| `red-cross-townsville` | Red Cross Townsville | -19.259 | 146.8169 | — |
| `salvos-bunbury` | Salvos Stores Bunbury | -33.3271 | 115.6414 | — |
| `ballarat-vintage-collectables-market` | Ballarat Vintage & Collectables Market | -37.561689 | 143.943342 | Daylesford & Hepburn Springs |
| `salvos-townsville` | Salvos Stores Townsville | -19.258 | 146.791 | — |
| `ballarat-antique-centre` | Ballarat Antique Centre | -37.5622 | 143.8503 | — |
| `anglicare-launceston` | Anglicare Op Shop Launceston | -41.4388 | 147.1369 | — |
| `victor-harbor-antiques` | Victor Harbor Antiques | -35.5516 | 138.615 | — |
| `goosey-goosey-gander-and-the-burra-remakery` | Goosey Goosey Gander and the Burra Remakery | -33.989448 | 139.081362 | 23 Commercial St |
| `brotherhood-ballarat` | Brotherhood of St Laurence Ballarat | -37.5622 | 143.8503 | — |
| `mill-markets-ballarat` | Mill Markets Ballarat | -37.5609 | 143.8699 | — |
| `toowoomba-lifeline-bookfest` | Toowoomba Lifeline Bookfest | -27.559 | 151.9505 | — |
| `vinnies-albury` | Vinnies Albury | -36.0737 | 146.9135 | — |
| `salvos-cairns` | Salvos Stores Cairns | -16.912816 | 145.763874 | Cairns & Tropical North |

### fine_grounds — 36 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `red-mud-coffee-roasters` | Red Mud Coffee Roasters | -26.770674 | 152.861222 | 43 McCarthy Road, Maleny |
| `drysdale-corner-cafe` | Drysdale Corner Cafe | -38.17 | 144.569 | Bellarine Peninsula |
| `gosford-waterfront-cafe` | Gosford Waterfront Cafe | -33.425 | 151.342 | Central Coast |
| `gorge-grounds-launceston` | Gorge Grounds | -41.4495 | 147.1235 | Launceston |
| `glass-house-espresso` | Glass House Espresso | -26.892 | 152.936 | Sunshine Coast |
| `yellow-bernard` | Yellow Bernard | -41.434141 | 147.139195 | Launceston & Tamar Valley |
| `horseshoe-bay-beans` | Horseshoe Bay Beans | -19.156 | 146.848 | Townsville |
| `harvest-coffee-launceston` | Harvest Coffee Launceston | -41.434 | 147.145 | Launceston |
| `zentvelds-coffee-farm-roastery` | Zentveld's Coffee Farm & Roastery | -28.707847 | 153.549386 | 193 Broken Head Rd |
| `crown-street-grind-wollongong` | Crown Street Grind Wollongong | -34.4255 | 150.894 | Wollongong |
| `tablelands-brew-room-cairns` | Tablelands Brew Room | -16.994 | 145.421 | Cairns |
| `queenscliff-pier-cafe` | Queenscliff Pier Cafe | -38.268 | 144.665 | Bellarine Peninsula |
| `ritual-coffee-roasters` | Ritual Coffee Roasters | -41.417219 | 147.141998 | 6/31a Churchill Park Dr |
| `noosa-coffee-roasters` | Noosa Coffee Roasters | -26.3944 | 153.0907 | Noosa |
| `six8-coffee-roasters` | Six8 Coffee Roasters | -34.84285 | 148.910852 | 92 Meehan St |
| `pioneer-coffee-roastery` | Pioneer Coffee Roastery | -26.556121 | 152.960589 | 1-41 Pioneer Road, Yandina QLD |
| `reef-espresso-cairns` | Reef Espresso | -16.92 | 145.779 | Cairns |
| `palmer-street-press` | Palmer Street Press | -19.26 | 146.8175 | Townsville |
| `b3-coffee` | b3 Coffee | -27.47632 | 153.24011 | 2/231 Main Rd |
| `bright-coffee-bar` | Bright Coffee Bar | -41.4388 | 147.137 | Launceston |

### corner — 36 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `providore-24` | Providore 24 | -40.760095 | 145.29639 | 24 Church St |
| `salt-house-living-noosa` | Salt House Living | -26.398363 | 153.091383 | Noosa Hinterland |
| `maleny-additions` | Maleny Additions | -26.758932 | 152.851228 | Shop 3, 25 Maple Street Maleny QLD |
| `red-kangaroo-books` | Red Kangaroo Books | -23.699332 | 133.883241 | 45 Todd Mall |
| `tribe-collectives` | Tribe Collectives | -41.176291 | 146.351379 | 148 William St, Devonport |
| `clunes-booktown-shop` | Clunes Booktown | -37.2942 | 143.787 | — |
| `page-turner-stationery-cairns` | Page Turner Stationery | -16.9186 | 145.7781 | — |
| `hideous-records` | Hideous Records | -27.217284 | 153.112085 | Shop 7 / 538 Oxley Avenue Redcliffe Qld |
| `eclectic-style` | Eclectic Style | -35.315164 | 150.436047 | Shop 10, Noosa Homemaker Centre, Thomas street, Noosaville, QLD |
| `daylesford-words` | Daylesford Words | -37.3486 | 144.153 | — |
| `music-farmers` | Music Farmers | -34.425481 | 150.892771 | 228 Keira St, Wollongong NSW |
| `homestead-store-alice-springs` | Homestead Store | -23.698 | 133.881 | — |
| `the-little-book-nook` | The Little Book Nook | -26.686906 | 152.958775 | 5/4-6 Little Main St |
| `bandicoot-toys-cairns` | Bandicoot Toys | -16.92 | 145.777 | — |
| `magnolia-books-toowoomba` | Magnolia Books | -27.5598 | 151.9539 | — |
| `cubby-house-toys-glenelg` | Cubby House Toys | -34.667094 | 137.877074 | — |
| `spencer-and-murphy-booksellers` | Spencer and Murphy Booksellers | -17.288466 | 145.635489 | 18A Eacham CL, Yungaburra, AU 4884 |
| `collections-concept-store` | Collections Concept Store | -38.155558 | 144.34528 | 2/315 Pakington Street Newtown, Victoria |
| `bad-habit-records` | Bad Habit Records | -26.627275 | 152.962046 | Visit us at 80 Howard Street, Nambour |
| `ever-after-the-romance-book-specialists` | Ever After- The Romance Book Specialists | -34.425089 | 150.896643 | Shop 15B, 110-114 Crown St, Wollongong |

### table — 8 NULL listings (top 20 shown)

| Slug | Name | Lat | Lng | Current region text |
|---|---|---|---|---|
| `the-bakery` | The Bakery | -23.700923 | 133.882216 | 4/11 Todd St |
| `montrachet` | Montrachet | -34.465063 | 150.431677 | Shop 1/30 King St |
| `cradle-coast-olives` | Cradle Coast Olives | -41.212419 | 146.170546 | 574 Castra Rd |
| `meelup-farmhouse` | Meelup Farmhouse | -33.579969 | 115.075557 | 54 Sheens Road, Naturaliste Western Australia |
| `wellington-point-farmhouse-restaurant-and-cafe` | Wellington Point Farmhouse Restaurant and Cafe | -27.503731 | 153.237672 | 2/623 Main Rd |
| `new-farm-bistro` | New Farm Bistro | -27.296135 | 152.961434 | 26 Gray Street, New Farm |
| `midden-by-mark-olive` | Midden by Mark Olive | -30.998369 | 152.902432 | Western Broadwalk Sydney Opera House Sydney |
| `mudbar-restaurant-launceston` | Mudbar Restaurant Launceston | -41.432919 | 147.132908 | 28 Seaport Boulevard, Launceston |


## Anomalies

### Regions attracting zero listings

*None. All regions attract at least one listing.*

### Regions attracting >25% of eligible listings

*None. No single region dominates the distribution.*

### Listings with lat/lng outside mainland Australia bounds (lat -45..-10, lng 112..154)

- `the-lord-howe-island-brewery` (sba) lat=-31.5249677 lng=159.0670065
- `silverkupe-studio-jewellery-and-workshops` (craft) lat=54.976072 lng=-1.5970422
- `norfolk-island-museum-kingston` (collection) lat=-29.0546 lng=167.9646

*Note: these are not necessarily wrong — Lord Howe Island (159°E), Norfolk Island, and Cocos (Keeling) Islands can legitimately fall outside the mainland bounding box. But any cluster here worth spot-checking for geocoding errors.*

## Interpretation

Read this alongside `2026-04-25-phase2-backfill-dryrun-changes.csv`. That CSV has one row per eligible listing with the proposed region assignment. Spot-check a handful — pick 10 listings where current `region` text doesn't match the proposed region name, confirm the proposed assignment is editorially correct.

**Questions this summary is designed to answer:**

1. **Is the distribution reasonable?** Eyeball the region counts against what you'd expect. Metro regions (Sydney, Melbourne, Brisbane, Adelaide, Perth) should dominate. Wine regions (Hunter Valley, Orange, Mudgee, Adelaide Hills, Byron Bay) should pull moderate counts. Composite tourism regions (Darwin & Top End, Hobart & Southern Tasmania) should pull smaller but non-zero counts.

2. **Is the projected quarantine batch size expected?** The 2026-04-25 SBA diagnostic predicted ~1,069 SBA listings would go to quarantine after the Hunter/Orange/Mudgee activation. Compare the NULL-per-vertical row for `sba` to that number.

3. **Are any regions attracting zero listings?** If yes, the polygon may be miss-scaled (e.g. pre-fix Perth was CBD-only and drew almost nothing).

4. **Are any regions attracting suspiciously many listings?** >25% flagged above. Indicates a polygon may be too broad.

5. **Spot-checks**: pick 10 listings from the CSV where `current_region_text` disagrees with `proposed_region_name` — is the proposed assignment editorially better?

If all four pass, trigger the apply run: `node scripts/phase2-backfill.mjs --apply`.

## Rollback (for apply run only)

```sql
UPDATE listings SET region_computed_id = NULL;
```

Safe to run; no downstream dependencies on `region_computed_id` yet (Phase 3 introduces them).
