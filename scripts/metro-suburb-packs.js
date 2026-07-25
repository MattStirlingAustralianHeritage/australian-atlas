/**
 * Metro suburb anchor packs for the gap crawler.
 *
 * WHY THIS EXISTS, SEPARATE FROM town-gap-packs.js:
 * town-gap-packs.js targets thin *regional* Atlas regions — whole towns the
 * state-wide sweeps never reach. This file targets the opposite blind spot: the
 * middle and outer suburbs of cities we already "cover".
 *
 * The ring audit (scripts/_suburb_ring_audit.mjs, 2026-07-25) measured Atlas
 * density per 100 km² across the 15 largest urban centres:
 *
 *     0–5km  (CBD/inner)  177.40
 *     5–15km (middle)      12.90
 *     15–30km (outer)       3.18
 *     30–55km (fringe)      0.45
 *
 * A 14× cliff at the 5km mark. Real venue density does fall with distance from
 * a CBD, but nowhere near that fast — Marrickville, Footscray, Sunnybank and
 * Fremantle are not 14× thinner than their CBDs, they are simply further than
 * the discovery sweeps reach. Cairns holds 75% of its listings inside 5km;
 * Brisbane has 81 listings beyond 15km for 2.7M people.
 *
 * ANCHOR CHOICE: every anchor below sits OUTSIDE the 5km inner ring of its city
 * (the ring the audit shows is already saturated), and is a suburb with a real,
 * independent trading strip — not a dormitory subdivision. These are the places
 * a good local would send you: Marrickville's breweries, Sunnybank's Asian food
 * courts, Footscray's markets, Fremantle's roasters, Norwood's parade.
 *
 * COORDINATES are suburb centres, machine-verified against Mapbox geocoding by
 * scripts/_verify_suburb_anchors.mjs — every anchor resolves to the named
 * suburb in the named state, within tolerance. Do not hand-edit a coordinate
 * without re-running that verifier.
 *
 * radiusKm defaults small (4–6km) because suburban strips are dense; a wide
 * bbox would blow the Overpass result cap on one strip and starve the next.
 */
export const SUBURB_PACKS = {
  // ── SYDNEY ────────────────────────────────────────────────────────
  // 666 listings for 5.5M people; only 152 beyond 15km.
  'sydney-inner-west': {
    name: 'Sydney — Inner West & West', state: 'NSW', regionLabel: 'Sydney',
    anchors: [
      { name: 'Marrickville', lat: -33.9114, lng: 151.1552, radiusKm: 4 },
      { name: 'Dulwich Hill', lat: -33.9040, lng: 151.1385, radiusKm: 4 },
      { name: 'Leichhardt', lat: -33.8836, lng: 151.1570, radiusKm: 4 },
      // Rozelle (-33.8615, 151.1710) deliberately omitted: it sits ~4km from the
      // GPO, inside the crawler's inner-ring exclusion, so almost every POI it
      // found would be discarded — a wasted Overpass call per run.
      { name: 'Five Dock', lat: -33.8687, lng: 151.1290, radiusKm: 4 },
      { name: 'Burwood', lat: -33.8770, lng: 151.1040, radiusKm: 4 },
      { name: 'Strathfield', lat: -33.8790, lng: 151.0940, radiusKm: 4 },
      { name: 'Ashfield', lat: -33.8890, lng: 151.1250, radiusKm: 4 },
    ],
  },
  'sydney-west': {
    name: 'Sydney — Greater West', state: 'NSW', regionLabel: 'Sydney',
    anchors: [
      { name: 'Parramatta', lat: -33.8150, lng: 151.0000, radiusKm: 5 },
      { name: 'Granville', lat: -33.8330, lng: 151.0100, radiusKm: 4 },
      { name: 'Auburn', lat: -33.8490, lng: 151.0330, radiusKm: 4 },
      { name: 'Blacktown', lat: -33.7710, lng: 150.9060, radiusKm: 5 },
      { name: 'Penrith', lat: -33.7510, lng: 150.6940, radiusKm: 6 },
      { name: 'Liverpool', lat: -33.9200, lng: 150.9230, radiusKm: 5 },
      { name: 'Cabramatta', lat: -33.8950, lng: 150.9350, radiusKm: 4 },
      { name: 'Fairfield', lat: -33.8710, lng: 150.9560, radiusKm: 4 },
      { name: 'Campbelltown', lat: -34.0650, lng: 150.8140, radiusKm: 6 },
      { name: 'Camden', lat: -34.0550, lng: 150.6970, radiusKm: 6 },
      { name: 'Richmond', lat: -33.6000, lng: 150.7510, radiusKm: 6 },
    ],
  },
  'sydney-north': {
    name: 'Sydney — North & Northern Beaches', state: 'NSW', regionLabel: 'Sydney',
    anchors: [
      { name: 'Chatswood', lat: -33.7970, lng: 151.1800, radiusKm: 4 },
      { name: 'Hornsby', lat: -33.7040, lng: 151.0990, radiusKm: 5 },
      { name: 'Manly', lat: -33.7969, lng: 151.2876, radiusKm: 4 },
      { name: 'Dee Why', lat: -33.7510, lng: 151.2960, radiusKm: 4 },
      { name: 'Mona Vale', lat: -33.6780, lng: 151.3020, radiusKm: 5 },
      { name: 'Ryde', lat: -33.8140, lng: 151.1050, radiusKm: 4 },
      { name: 'Epping', lat: -33.7730, lng: 151.0820, radiusKm: 4 },
      { name: 'Castle Hill', lat: -33.7320, lng: 151.0050, radiusKm: 5 },
      { name: 'Brookvale', lat: -33.7660, lng: 151.2710, radiusKm: 4 },
    ],
  },
  'sydney-south': {
    name: 'Sydney — South & Sutherland', state: 'NSW', regionLabel: 'Sydney',
    anchors: [
      { name: 'Cronulla', lat: -34.0550, lng: 151.1520, radiusKm: 4 },
      { name: 'Sutherland', lat: -34.0310, lng: 151.0580, radiusKm: 5 },
      { name: 'Hurstville', lat: -33.9670, lng: 151.1020, radiusKm: 4 },
      { name: 'Rockdale', lat: -33.9520, lng: 151.1370, radiusKm: 4 },
      { name: 'Bankstown', lat: -33.9180, lng: 151.0350, radiusKm: 5 },
      { name: 'Brighton-Le-Sands', lat: -33.9600, lng: 151.1520, radiusKm: 4 },
    ],
  },

  // ── MELBOURNE ─────────────────────────────────────────────────────
  'melbourne-north': {
    name: 'Melbourne — North', state: 'VIC', regionLabel: 'Melbourne',
    anchors: [
      { name: 'Preston', lat: -37.7420, lng: 145.0060, radiusKm: 4 },
      { name: 'Coburg', lat: -37.7440, lng: 144.9660, radiusKm: 4 },
      { name: 'Thornbury', lat: -37.7570, lng: 145.0000, radiusKm: 3.5 },
      { name: 'Northcote', lat: -37.7700, lng: 145.0000, radiusKm: 3.5 },
      { name: 'Reservoir', lat: -37.7170, lng: 145.0050, radiusKm: 4 },
      { name: 'Essendon', lat: -37.7510, lng: 144.9080, radiusKm: 4 },
      { name: 'Moonee Ponds', lat: -37.7650, lng: 144.9200, radiusKm: 3.5 },
      { name: 'Greensborough', lat: -37.7040, lng: 145.1030, radiusKm: 5 },
      { name: 'Eltham', lat: -37.7150, lng: 145.1470, radiusKm: 5 },
      { name: 'Sunbury', lat: -37.5790, lng: 144.7280, radiusKm: 6 },
    ],
  },
  'melbourne-west': {
    name: 'Melbourne — West', state: 'VIC', regionLabel: 'Melbourne',
    anchors: [
      { name: 'Footscray', lat: -37.8000, lng: 144.9000, radiusKm: 4 },
      { name: 'Yarraville', lat: -37.8160, lng: 144.8930, radiusKm: 3.5 },
      { name: 'Williamstown', lat: -37.8600, lng: 144.8940, radiusKm: 4 },
      { name: 'Seddon', lat: -37.8070, lng: 144.8920, radiusKm: 3 },
      { name: 'Sunshine', lat: -37.7880, lng: 144.8320, radiusKm: 4 },
      { name: 'Altona', lat: -37.8680, lng: 144.8300, radiusKm: 4 },
      { name: 'Werribee', lat: -37.9000, lng: 144.6600, radiusKm: 6 },
      { name: 'Point Cook', lat: -37.9150, lng: 144.7540, radiusKm: 5 },
    ],
  },
  'melbourne-east': {
    name: 'Melbourne — East', state: 'VIC', regionLabel: 'Melbourne',
    anchors: [
      { name: 'Box Hill', lat: -37.8190, lng: 145.1230, radiusKm: 4 },
      { name: 'Camberwell', lat: -37.8420, lng: 145.0580, radiusKm: 4 },
      { name: 'Hawthorn', lat: -37.8220, lng: 145.0280, radiusKm: 3.5 },
      { name: 'Kew', lat: -37.8060, lng: 145.0300, radiusKm: 3.5 },
      { name: 'Doncaster', lat: -37.7870, lng: 145.1250, radiusKm: 4 },
      { name: 'Ringwood', lat: -37.8140, lng: 145.2290, radiusKm: 5 },
      { name: 'Croydon', lat: -37.7960, lng: 145.2810, radiusKm: 5 },
      { name: 'Lilydale', lat: -37.7560, lng: 145.3490, radiusKm: 5 },
      { name: 'Balwyn', lat: -37.8090, lng: 145.0790, radiusKm: 3.5 },
    ],
  },
  'melbourne-south-east': {
    name: 'Melbourne — South East', state: 'VIC', regionLabel: 'Melbourne',
    anchors: [
      { name: 'Dandenong', lat: -37.9870, lng: 145.2150, radiusKm: 5 },
      { name: 'Springvale', lat: -37.9500, lng: 145.1520, radiusKm: 4 },
      { name: 'Oakleigh', lat: -37.9000, lng: 145.0890, radiusKm: 4 },
      { name: 'Cheltenham', lat: -37.9660, lng: 145.0560, radiusKm: 4 },
      { name: 'Mentone', lat: -37.9830, lng: 145.0640, radiusKm: 3.5 },
      { name: 'Brighton', lat: -37.9070, lng: 145.0000, radiusKm: 4 },
      { name: 'Frankston', lat: -38.1440, lng: 145.1220, radiusKm: 5 },
      { name: 'Berwick', lat: -38.0330, lng: 145.3470, radiusKm: 5 },
      { name: 'Mornington', lat: -38.2230, lng: 145.0380, radiusKm: 5 },
    ],
  },

  // ── BRISBANE ──────────────────────────────────────────────────────
  // Only 81 listings beyond 15km for a metro of 2.7M.
  'brisbane-south': {
    name: 'Brisbane — South', state: 'QLD', regionLabel: 'Brisbane',
    anchors: [
      { name: 'Sunnybank', lat: -27.5760, lng: 153.0570, radiusKm: 4 },
      { name: 'Mount Gravatt', lat: -27.5390, lng: 153.0790, radiusKm: 4 },
      { name: 'Coorparoo', lat: -27.4970, lng: 153.0560, radiusKm: 3.5 },
      { name: 'Camp Hill', lat: -27.4960, lng: 153.0700, radiusKm: 3.5 },
      { name: 'Annerley', lat: -27.5100, lng: 153.0290, radiusKm: 3.5 },
      { name: 'Moorooka', lat: -27.5310, lng: 153.0270, radiusKm: 3.5 },
      { name: 'Sherwood', lat: -27.5290, lng: 152.9800, radiusKm: 4 },
      { name: 'Springwood', lat: -27.6120, lng: 153.1300, radiusKm: 5 },
      { name: 'Logan Central', lat: -27.6390, lng: 153.1080, radiusKm: 5 },
    ],
  },
  'brisbane-west-north': {
    name: 'Brisbane — West & North', state: 'QLD', regionLabel: 'Brisbane',
    anchors: [
      { name: 'Indooroopilly', lat: -27.4990, lng: 152.9730, radiusKm: 4 },
      { name: 'Toowong', lat: -27.4850, lng: 152.9910, radiusKm: 3.5 },
      { name: 'Ashgrove', lat: -27.4450, lng: 152.9910, radiusKm: 3.5 },
      { name: 'The Gap', lat: -27.4430, lng: 152.9370, radiusKm: 4 },
      { name: 'Chermside', lat: -27.3860, lng: 153.0330, radiusKm: 4 },
      { name: 'Nundah', lat: -27.4020, lng: 153.0600, radiusKm: 3.5 },
      { name: 'Sandgate', lat: -27.3200, lng: 153.0700, radiusKm: 4 },
      { name: 'Samford', lat: -27.3700, lng: 152.8850, radiusKm: 5 },
      { name: 'Ipswich', lat: -27.6140, lng: 152.7590, radiusKm: 6 },
    ],
  },
  'brisbane-bayside': {
    name: 'Brisbane — Bayside & Redlands', state: 'QLD', regionLabel: 'Brisbane',
    anchors: [
      { name: 'Wynnum', lat: -27.4430, lng: 153.1720, radiusKm: 4 },
      { name: 'Manly', lat: -27.4560, lng: 153.1870, radiusKm: 3.5 },
      { name: 'Cleveland', lat: -27.5270, lng: 153.2650, radiusKm: 5 },
      { name: 'Capalaba', lat: -27.5270, lng: 153.1930, radiusKm: 4 },
      { name: 'Redcliffe', lat: -27.2300, lng: 153.1100, radiusKm: 5 },
      { name: 'Bulimba', lat: -27.4510, lng: 153.0570, radiusKm: 3.5 },
    ],
  },

  // ── PERTH ─────────────────────────────────────────────────────────
  'perth-inner-ring': {
    name: 'Perth — Middle Ring', state: 'WA', regionLabel: 'Perth',
    anchors: [
      { name: 'Leederville', lat: -31.9360, lng: 115.8410, radiusKm: 3.5 },
      { name: 'Mount Lawley', lat: -31.9330, lng: 115.8720, radiusKm: 3.5 },
      { name: 'Maylands', lat: -31.9370, lng: 115.8930, radiusKm: 3.5 },
      { name: 'Victoria Park', lat: -31.9750, lng: 115.8940, radiusKm: 3.5 },
      { name: 'Subiaco', lat: -31.9490, lng: 115.8260, radiusKm: 3.5 },
      { name: 'Bayswater', lat: -31.9190, lng: 115.9130, radiusKm: 3.5 },
      { name: 'Bassendean', lat: -31.9070, lng: 115.9450, radiusKm: 3.5 },
    ],
  },
  'perth-outer': {
    name: 'Perth — Outer & Coast', state: 'WA', regionLabel: 'Perth',
    anchors: [
      { name: 'Fremantle', lat: -32.0570, lng: 115.7440, radiusKm: 4 },
      { name: 'Claremont', lat: -31.9820, lng: 115.7810, radiusKm: 3.5 },
      { name: 'Cottesloe', lat: -31.9950, lng: 115.7550, radiusKm: 3.5 },
      { name: 'Scarborough', lat: -31.8940, lng: 115.7580, radiusKm: 4 },
      { name: 'Hillarys', lat: -31.8080, lng: 115.7390, radiusKm: 4 },
      { name: 'Joondalup', lat: -31.7440, lng: 115.7660, radiusKm: 5 },
      { name: 'Midland', lat: -31.8890, lng: 116.0100, radiusKm: 4 },
      { name: 'Guildford', lat: -31.8990, lng: 115.9730, radiusKm: 3.5 },
      { name: 'Armadale', lat: -32.1480, lng: 116.0160, radiusKm: 5 },
      { name: 'Cannington', lat: -32.0170, lng: 115.9350, radiusKm: 4 },
      { name: 'Rockingham', lat: -32.2770, lng: 115.7290, radiusKm: 5 },
    ],
  },

  // ── ADELAIDE ──────────────────────────────────────────────────────
  'adelaide-middle': {
    name: 'Adelaide — Middle Ring', state: 'SA', regionLabel: 'Adelaide',
    anchors: [
      { name: 'Norwood', lat: -34.9210, lng: 138.6300, radiusKm: 3.5 },
      { name: 'Unley', lat: -34.9500, lng: 138.6070, radiusKm: 3.5 },
      { name: 'Prospect', lat: -34.8850, lng: 138.5940, radiusKm: 3.5 },
      { name: 'Magill', lat: -34.9040, lng: 138.6720, radiusKm: 3.5 },
      { name: 'Burnside', lat: -34.9370, lng: 138.6510, radiusKm: 3.5 },
      { name: 'Mitcham', lat: -34.9800, lng: 138.6110, radiusKm: 3.5 },
      { name: 'Henley Beach', lat: -34.9200, lng: 138.4930, radiusKm: 3.5 },
    ],
  },
  'adelaide-outer': {
    name: 'Adelaide — Outer', state: 'SA', regionLabel: 'Adelaide',
    anchors: [
      { name: 'Port Adelaide', lat: -34.8460, lng: 138.5060, radiusKm: 4 },
      { name: 'Semaphore', lat: -34.8390, lng: 138.4830, radiusKm: 3.5 },
      { name: 'Glenelg', lat: -34.9800, lng: 138.5150, radiusKm: 4 },
      { name: 'Marion', lat: -35.0130, lng: 138.5540, radiusKm: 4 },
      { name: 'Blackwood', lat: -35.0210, lng: 138.6150, radiusKm: 4 },
      { name: 'Modbury', lat: -34.8300, lng: 138.6850, radiusKm: 4 },
      { name: 'Salisbury', lat: -34.7600, lng: 138.6400, radiusKm: 5 },
      { name: 'Elizabeth', lat: -34.7180, lng: 138.6710, radiusKm: 5 },
      { name: 'Gawler', lat: -34.5970, lng: 138.7460, radiusKm: 5 },
    ],
  },

  // ── SMALLER CAPITALS ──────────────────────────────────────────────
  // Highest inner-share skew in the audit: Cairns 75%, Darwin 64%, Hobart 62%.
  'hobart-suburbs': {
    name: 'Hobart — Suburbs & Eastern Shore', state: 'TAS', regionLabel: 'Hobart',
    anchors: [
      { name: 'Kingston', lat: -42.9770, lng: 147.3080, radiusKm: 4 },
      { name: 'Glenorchy', lat: -42.8330, lng: 147.2740, radiusKm: 4 },
      { name: 'Moonah', lat: -42.8560, lng: 147.2960, radiusKm: 3 },
      { name: 'New Town', lat: -42.8590, lng: 147.3060, radiusKm: 3 },
      { name: 'Bellerive', lat: -42.8760, lng: 147.3720, radiusKm: 3.5 },
      { name: 'Lindisfarne', lat: -42.8420, lng: 147.3620, radiusKm: 3.5 },
      { name: 'Sorell', lat: -42.7830, lng: 147.5590, radiusKm: 5 },
    ],
  },
  'canberra-suburbs': {
    name: 'Canberra — Town Centres', state: 'ACT', regionLabel: 'Canberra',
    anchors: [
      { name: 'Dickson', lat: -35.2500, lng: 149.1390, radiusKm: 3 },
      { name: 'Kingston', lat: -35.3170, lng: 149.1440, radiusKm: 3 },
      { name: 'Belconnen', lat: -35.2380, lng: 149.0660, radiusKm: 4 },
      { name: 'Woden', lat: -35.3440, lng: 149.0870, radiusKm: 4 },
      { name: 'Tuggeranong', lat: -35.4160, lng: 149.0680, radiusKm: 5 },
      { name: 'Gungahlin', lat: -35.1840, lng: 149.1330, radiusKm: 4 },
      { name: 'Fyshwick', lat: -35.3320, lng: 149.1620, radiusKm: 3 },
    ],
  },
  // Queanbeyan is functionally a Canberra suburb but legally a NSW town, and the
  // crawler stamps pack.state onto every anchor — so it needs its own pack or
  // every venue here would be filed under ACT and fail the state check.
  'queanbeyan': {
    name: 'Queanbeyan & Jerrabomberra', state: 'NSW', regionLabel: 'Queanbeyan',
    anchors: [
      { name: 'Queanbeyan', lat: -35.3540, lng: 149.2320, radiusKm: 5 },
    ],
  },
  'darwin-suburbs': {
    name: 'Darwin — Suburbs & Palmerston', state: 'NT', regionLabel: 'Darwin',
    anchors: [
      { name: 'Parap', lat: -12.4290, lng: 130.8410, radiusKm: 3 },
      { name: 'Nightcliff', lat: -12.3830, lng: 130.8520, radiusKm: 3.5 },
      { name: 'Fannie Bay', lat: -12.4210, lng: 130.8380, radiusKm: 3 },
      { name: 'Casuarina', lat: -12.3770, lng: 130.8790, radiusKm: 3.5 },
      { name: 'Palmerston', lat: -12.4860, lng: 130.9830, radiusKm: 5 },
      { name: 'Humpty Doo', lat: -12.5850, lng: 131.1300, radiusKm: 6 },
    ],
  },

  // ── LARGE REGIONAL CITIES ─────────────────────────────────────────
  'newcastle-suburbs': {
    name: 'Newcastle & Lake Macquarie', state: 'NSW', regionLabel: 'Newcastle',
    anchors: [
      { name: 'Hamilton', lat: -32.9210, lng: 151.7480, radiusKm: 3 },
      { name: 'Merewether', lat: -32.9450, lng: 151.7420, radiusKm: 3 },
      { name: 'Mayfield', lat: -32.8960, lng: 151.7330, radiusKm: 3.5 },
      { name: 'Lambton', lat: -32.9160, lng: 151.7040, radiusKm: 3.5 },
      { name: 'Charlestown', lat: -32.9640, lng: 151.6960, radiusKm: 4 },
      { name: 'Warners Bay', lat: -32.9700, lng: 151.6490, radiusKm: 4 },
      { name: 'Maitland', lat: -32.7330, lng: 151.5580, radiusKm: 5 },
      { name: 'Raymond Terrace', lat: -32.7600, lng: 151.7440, radiusKm: 5 },
    ],
  },
  'wollongong-illawarra': {
    name: 'Wollongong & Illawarra', state: 'NSW', regionLabel: 'Illawarra',
    anchors: [
      { name: 'Thirroul', lat: -34.3140, lng: 150.9200, radiusKm: 3.5 },
      { name: 'Austinmer', lat: -34.3060, lng: 150.9330, radiusKm: 3 },
      { name: 'Bulli', lat: -34.3350, lng: 150.9160, radiusKm: 3 },
      { name: 'Corrimal', lat: -34.3760, lng: 150.9040, radiusKm: 3.5 },
      { name: 'Fairy Meadow', lat: -34.3930, lng: 150.8930, radiusKm: 3 },
      { name: 'Dapto', lat: -34.4990, lng: 150.7930, radiusKm: 4 },
      { name: 'Shellharbour', lat: -34.5810, lng: 150.8670, radiusKm: 4 },
      { name: 'Kiama', lat: -34.6710, lng: 150.8540, radiusKm: 4 },
    ],
  },
  'geelong-suburbs': {
    name: 'Geelong & Surf Coast', state: 'VIC', regionLabel: 'Geelong',
    anchors: [
      { name: 'Newtown', lat: -38.1520, lng: 144.3420, radiusKm: 3 },
      { name: 'Geelong West', lat: -38.1400, lng: 144.3450, radiusKm: 3 },
      { name: 'Belmont', lat: -38.1780, lng: 144.3410, radiusKm: 3.5 },
      { name: 'Torquay', lat: -38.3320, lng: 144.3200, radiusKm: 4 },
      { name: 'Lara', lat: -38.0250, lng: 144.4050, radiusKm: 4 },
    ],
  },
  'gold-coast-suburbs': {
    name: 'Gold Coast — Southern Beaches & Hinterland Edge', state: 'QLD', regionLabel: 'Gold Coast',
    anchors: [
      { name: 'Burleigh Heads', lat: -28.0900, lng: 153.4500, radiusKm: 3.5 },
      { name: 'Palm Beach', lat: -28.1160, lng: 153.4670, radiusKm: 3.5 },
      { name: 'Currumbin', lat: -28.1350, lng: 153.4870, radiusKm: 3.5 },
      { name: 'Miami', lat: -28.0680, lng: 153.4440, radiusKm: 3 },
      { name: 'Mermaid Beach', lat: -28.0430, lng: 153.4360, radiusKm: 3 },
      { name: 'Coolangatta', lat: -28.1680, lng: 153.5360, radiusKm: 4 },
      { name: 'Nerang', lat: -27.9910, lng: 153.3350, radiusKm: 4 },
      { name: 'Robina', lat: -28.0740, lng: 153.3900, radiusKm: 4 },
      { name: 'Mudgeeraba', lat: -28.0810, lng: 153.3630, radiusKm: 4 },
    ],
  },
  'sunshine-coast-suburbs': {
    name: 'Sunshine Coast — Beaches & Hinterland Towns', state: 'QLD', regionLabel: 'Sunshine Coast',
    anchors: [
      { name: 'Peregian Beach', lat: -26.4830, lng: 153.0980, radiusKm: 3.5 },
      { name: 'Coolum Beach', lat: -26.5320, lng: 153.0910, radiusKm: 3.5 },
      { name: 'Mooloolaba', lat: -26.6820, lng: 153.1200, radiusKm: 3.5 },
      { name: 'Buderim', lat: -26.6870, lng: 153.0570, radiusKm: 4 },
      { name: 'Caloundra', lat: -26.8010, lng: 153.1290, radiusKm: 4 },
      { name: 'Nambour', lat: -26.6270, lng: 152.9590, radiusKm: 4 },
      { name: 'Yandina', lat: -26.5620, lng: 152.9500, radiusKm: 4 },
    ],
  },
  'cairns-suburbs': {
    name: 'Cairns — Suburbs & Northern Beaches', state: 'QLD', regionLabel: 'Cairns',
    anchors: [
      { name: 'Edge Hill', lat: -16.8990, lng: 145.7480, radiusKm: 3 },
      { name: 'Redlynch', lat: -16.8850, lng: 145.6910, radiusKm: 3.5 },
      { name: 'Smithfield', lat: -16.8300, lng: 145.6870, radiusKm: 4 },
      { name: 'Palm Cove', lat: -16.7460, lng: 145.6690, radiusKm: 4 },
      { name: 'Gordonvale', lat: -17.0930, lng: 145.7860, radiusKm: 4 },
    ],
  },
  'townsville-suburbs': {
    name: 'Townsville — Suburbs', state: 'QLD', regionLabel: 'Townsville',
    anchors: [
      { name: 'Aitkenvale', lat: -19.2960, lng: 146.7690, radiusKm: 3.5 },
      { name: 'Kirwan', lat: -19.3110, lng: 146.7250, radiusKm: 4 },
      { name: 'Nelly Bay', lat: -19.1650, lng: 146.8500, radiusKm: 3.5 },
    ],
  },
}
