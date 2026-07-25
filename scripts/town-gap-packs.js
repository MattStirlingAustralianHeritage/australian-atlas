/**
 * Region anchor packs for the town-by-town gap crawler.
 *
 * Each pack is a thin/under-covered Atlas region broken into its constituent
 * towns, with real town-centre coordinates. The crawler runs a tight OSM bbox
 * around each anchor, so it reaches the long-tail venues that whole-state sweeps
 * miss. Ordering roughly follows Atlas coverage (thinnest regions first).
 *
 * Coordinates are town centres (WGS84). Add packs freely — nothing here is
 * generated; every town is a real Australian locality.
 */
export const REGION_PACKS = {
  // ── SA ────────────────────────────────────────────────────────────
  'eyre-peninsula': {
    name: 'Eyre Peninsula', state: 'SA', regionLabel: 'Eyre Peninsula',
    anchors: [
      { name: 'Port Lincoln', lat: -34.7263, lng: 135.8606 },
      { name: 'Coffin Bay', lat: -34.6180, lng: 135.4700 },
      { name: 'Tumby Bay', lat: -34.3770, lng: 136.1020 },
      { name: 'Cummins', lat: -34.2670, lng: 135.7270 },
      { name: 'Streaky Bay', lat: -32.7950, lng: 134.2130 },
      { name: 'Ceduna', lat: -32.1260, lng: 133.6740 },
      { name: 'Cowell', lat: -33.6810, lng: 136.9170 },
      { name: 'Whyalla', lat: -33.0370, lng: 137.5640 },
      { name: 'Elliston', lat: -33.6510, lng: 134.8880 },
    ],
  },
  'kangaroo-island': {
    name: 'Kangaroo Island', state: 'SA', regionLabel: 'Kangaroo Island',
    anchors: [
      { name: 'Kingscote', lat: -35.6570, lng: 137.6380 },
      { name: 'Penneshaw', lat: -35.7230, lng: 137.9360 },
      { name: 'American River', lat: -35.7970, lng: 137.7720 },
      { name: 'Parndana', lat: -35.7880, lng: 137.2630 },
      { name: 'Vivonne Bay', lat: -35.9820, lng: 137.1760 },
    ],
  },
  'clare-valley': {
    name: 'Clare Valley', state: 'SA', regionLabel: 'Clare Valley',
    anchors: [
      { name: 'Clare', lat: -33.8336, lng: 138.6110 },
      { name: 'Auburn', lat: -34.0280, lng: 138.6850 },
      { name: 'Sevenhill', lat: -33.8980, lng: 138.6350 },
      { name: 'Mintaro', lat: -33.9430, lng: 138.7160 },
    ],
  },
  // ── NSW ───────────────────────────────────────────────────────────
  'sapphire-coast': {
    name: 'Sapphire Coast', state: 'NSW', regionLabel: 'Sapphire Coast',
    anchors: [
      { name: 'Merimbula', lat: -36.8930, lng: 149.9090 },
      { name: 'Bega', lat: -36.6740, lng: 149.8420 },
      { name: 'Eden', lat: -37.0640, lng: 149.9020 },
      { name: 'Pambula', lat: -36.9430, lng: 149.8790 },
      { name: 'Tathra', lat: -36.7290, lng: 149.9760 },
      { name: 'Bermagui', lat: -36.4190, lng: 150.0700 },
      { name: 'Cobargo', lat: -36.3880, lng: 149.8840 },
      { name: 'Candelo', lat: -36.7660, lng: 149.6940 },
    ],
  },
  'eurobodalla': {
    name: 'Eurobodalla', state: 'NSW', regionLabel: 'Eurobodalla',
    anchors: [
      { name: 'Batemans Bay', lat: -35.7080, lng: 150.1750 },
      { name: 'Moruya', lat: -35.9110, lng: 150.0830 },
      { name: 'Narooma', lat: -36.2170, lng: 150.1310 },
      { name: 'Tuross Head', lat: -36.0550, lng: 150.1320 },
      { name: 'Mogo', lat: -35.7880, lng: 150.1480 },
      { name: 'Central Tilba', lat: -36.3200, lng: 150.0930 },
    ],
  },
  'snowy-mountains': {
    name: 'Snowy Mountains', state: 'NSW', regionLabel: 'Snowy Mountains',
    anchors: [
      { name: 'Jindabyne', lat: -36.4160, lng: 148.6220 },
      { name: 'Cooma', lat: -36.2350, lng: 149.1260 },
      { name: 'Thredbo', lat: -36.5050, lng: 148.3040 },
      { name: 'Adaminaby', lat: -35.9960, lng: 148.7690 },
      { name: 'Berridale', lat: -36.3650, lng: 148.8360 },
    ],
  },
  'mudgee': {
    name: 'Mudgee Region', state: 'NSW', regionLabel: 'Mudgee',
    anchors: [
      { name: 'Mudgee', lat: -32.5944, lng: 149.5876 },
      { name: 'Gulgong', lat: -32.3620, lng: 149.5310 },
      { name: 'Rylstone', lat: -32.7990, lng: 149.9770 },
    ],
  },
  // ── VIC ───────────────────────────────────────────────────────────
  'mildura-mallee': {
    name: 'Mildura & the Mallee', state: 'VIC', regionLabel: 'Mildura & the Mallee',
    anchors: [
      { name: 'Mildura', lat: -34.1855, lng: 142.1625 },
      { name: 'Swan Hill', lat: -35.3380, lng: 143.5540 },
      { name: 'Robinvale', lat: -34.5830, lng: 142.7750 },
      { name: 'Ouyen', lat: -35.0700, lng: 142.3190 },
      { name: 'Red Cliffs', lat: -34.3070, lng: 142.1920 },
    ],
  },
  'bellarine-peninsula': {
    name: 'Bellarine Peninsula', state: 'VIC', regionLabel: 'Bellarine Peninsula',
    anchors: [
      { name: 'Queenscliff', lat: -38.2670, lng: 144.6620 },
      { name: 'Ocean Grove', lat: -38.2660, lng: 144.5220 },
      { name: 'Barwon Heads', lat: -38.2750, lng: 144.4890 },
      { name: 'Portarlington', lat: -38.1160, lng: 144.6530 },
      { name: 'Drysdale', lat: -38.1740, lng: 144.5670 },
      { name: 'Point Lonsdale', lat: -38.2880, lng: 144.6110 },
    ],
  },
  'phillip-island': {
    name: 'Phillip Island', state: 'VIC', regionLabel: 'Phillip Island',
    anchors: [
      { name: 'Cowes', lat: -38.4520, lng: 145.2380 },
      { name: 'Rhyll', lat: -38.4690, lng: 145.3020 },
      { name: 'San Remo', lat: -38.5230, lng: 145.3690 },
      { name: 'Newhaven', lat: -38.5100, lng: 145.3530 },
    ],
  },
  'macedon-ranges': {
    name: 'Macedon Ranges', state: 'VIC', regionLabel: 'Macedon Ranges',
    anchors: [
      { name: 'Kyneton', lat: -37.2450, lng: 144.4540 },
      { name: 'Woodend', lat: -37.3580, lng: 144.5270 },
      { name: 'Trentham', lat: -37.3900, lng: 144.3230 },
      { name: 'Gisborne', lat: -37.4890, lng: 144.5910 },
      { name: 'Malmsbury', lat: -37.1870, lng: 144.3830 },
    ],
  },
  // ── TAS ───────────────────────────────────────────────────────────
  'tarkine-west-coast': {
    name: 'Tarkine & West Coast', state: 'TAS', regionLabel: 'Tarkine & West Coast',
    anchors: [
      { name: 'Strahan', lat: -42.1530, lng: 145.3280 },
      { name: 'Queenstown', lat: -42.0810, lng: 145.5560 },
      { name: 'Zeehan', lat: -41.8840, lng: 145.3350 },
      { name: 'Rosebery', lat: -41.7750, lng: 145.5350 },
    ],
  },
  'east-coast-tasmania': {
    name: 'East Coast Tasmania', state: 'TAS', regionLabel: 'East Coast Tasmania',
    anchors: [
      { name: 'Bicheno', lat: -41.8770, lng: 148.3030 },
      { name: 'Swansea', lat: -42.1080, lng: 148.0730 },
      { name: 'St Helens', lat: -41.3180, lng: 148.2430 },
      { name: 'Coles Bay', lat: -42.1210, lng: 148.2840 },
      { name: 'Orford', lat: -42.5560, lng: 147.8740 },
      { name: 'Triabunna', lat: -42.5080, lng: 147.9130 },
    ],
  },
  // ── QLD ───────────────────────────────────────────────────────────
  'whitsundays': {
    name: 'Whitsundays', state: 'QLD', regionLabel: 'Whitsundays',
    anchors: [
      { name: 'Airlie Beach', lat: -20.2680, lng: 148.7180 },
      { name: 'Cannonvale', lat: -20.2760, lng: 148.6960 },
      { name: 'Proserpine', lat: -20.4010, lng: 148.5810 },
      { name: 'Bowen', lat: -20.0130, lng: 148.2450 },
    ],
  },
  'capricorn-coast': {
    name: 'Capricorn Coast', state: 'QLD', regionLabel: 'Capricorn Coast',
    anchors: [
      { name: 'Yeppoon', lat: -23.1320, lng: 150.7400 },
      { name: 'Emu Park', lat: -23.2580, lng: 150.8310 },
      { name: 'Rockhampton', lat: -23.3786, lng: 150.5100 },
    ],
  },
  'gold-coast-hinterland': {
    name: 'Gold Coast Hinterland', state: 'QLD', regionLabel: 'Gold Coast Hinterland',
    anchors: [
      { name: 'Tamborine Mountain', lat: -27.9640, lng: 153.1960 },
      { name: 'Canungra', lat: -28.0140, lng: 153.1640 },
      { name: 'Springbrook', lat: -28.2300, lng: 153.2710 },
      { name: 'Beechmont', lat: -28.1280, lng: 153.2010 },
    ],
  },
  'granite-belt': {
    name: 'Granite Belt', state: 'QLD', regionLabel: 'Granite Belt',
    anchors: [
      { name: 'Stanthorpe', lat: -28.6550, lng: 151.9360 },
      { name: 'Ballandean', lat: -28.7920, lng: 151.8360 },
      { name: 'Wallangarra', lat: -28.9230, lng: 151.9890 },
    ],
  },
  // ── NT ────────────────────────────────────────────────────────────
  'katherine': {
    name: 'Katherine & Surrounds', state: 'NT', regionLabel: 'Katherine & Surrounds',
    anchors: [
      { name: 'Katherine', lat: -14.4650, lng: 132.2640 },
      { name: 'Mataranka', lat: -14.9250, lng: 133.0700 },
    ],
  },
  // ── WA (thin coastal + outback + forests) ─────────────────────────
  'coral-coast': {
    name: "Australia's Coral Coast", state: 'WA', regionLabel: 'Coral Coast',
    anchors: [
      { name: 'Kalbarri', lat: -27.7100, lng: 114.1650 },
      { name: 'Geraldton', lat: -28.7774, lng: 114.6150 },
      { name: 'Dongara', lat: -29.2550, lng: 114.9330 },
      { name: 'Cervantes', lat: -30.5050, lng: 115.0650 },
      { name: 'Jurien Bay', lat: -30.3050, lng: 115.0400 },
    ],
  },
  'golden-outback': {
    name: "Australia's Golden Outback", state: 'WA', regionLabel: 'Golden Outback',
    anchors: [
      { name: 'Kalgoorlie', lat: -30.7490, lng: 121.4660 },
      { name: 'Coolgardie', lat: -30.9550, lng: 121.1640 },
      { name: 'Esperance', lat: -33.8614, lng: 121.8910 },
      { name: 'Norseman', lat: -32.1960, lng: 121.7780 },
    ],
  },
  'southern-forests-wa': {
    name: 'Southern Forests', state: 'WA', regionLabel: 'Southern Forests',
    anchors: [
      { name: 'Pemberton', lat: -34.4460, lng: 116.0370 },
      { name: 'Manjimup', lat: -34.2410, lng: 116.1460 },
      { name: 'Bridgetown', lat: -33.9610, lng: 116.1400 },
      { name: 'Nannup', lat: -33.9810, lng: 115.7660 },
    ],
  },
  // ── NSW (thin inland + rivers) ────────────────────────────────────
  'new-england': {
    name: 'New England North West', state: 'NSW', regionLabel: 'New England',
    anchors: [
      { name: 'Armidale', lat: -30.5120, lng: 151.6670 },
      { name: 'Tenterfield', lat: -29.0480, lng: 152.0200 },
      { name: 'Glen Innes', lat: -29.7350, lng: 151.7400 },
      { name: 'Inverell', lat: -29.7770, lng: 151.1120 },
    ],
  },
  'riverina': {
    name: 'Riverina', state: 'NSW', regionLabel: 'Riverina',
    anchors: [
      { name: 'Wagga Wagga', lat: -35.1082, lng: 147.3598 },
      { name: 'Griffith', lat: -34.2890, lng: 146.0400 },
      { name: 'Leeton', lat: -34.5600, lng: 146.4000 },
      { name: 'Junee', lat: -34.8680, lng: 147.5830 },
    ],
  },
  'northern-rivers': {
    name: 'Northern Rivers', state: 'NSW', regionLabel: 'Northern Rivers',
    anchors: [
      { name: 'Bangalow', lat: -28.6880, lng: 153.5230 },
      { name: 'Mullumbimby', lat: -28.5540, lng: 153.5000 },
      { name: 'Bellingen', lat: -30.4540, lng: 152.8990 },
      { name: 'Nimbin', lat: -28.5940, lng: 153.2220 },
      { name: 'Ballina', lat: -28.8650, lng: 153.5650 },
    ],
  },
  // ── VIC (thin west + valleys + the coast road) ────────────────────
  'grampians': {
    name: 'Grampians', state: 'VIC', regionLabel: 'Grampians',
    anchors: [
      { name: 'Halls Gap', lat: -37.1370, lng: 142.5200 },
      { name: 'Ararat', lat: -37.2840, lng: 142.9280 },
      { name: 'Stawell', lat: -37.0560, lng: 142.7800 },
      { name: 'Dunkeld', lat: -37.6520, lng: 142.3430 },
    ],
  },
  'goulburn-valley': {
    name: 'Goulburn Valley', state: 'VIC', regionLabel: 'Goulburn Valley',
    anchors: [
      { name: 'Nagambie', lat: -36.7890, lng: 145.1530 },
      { name: 'Shepparton', lat: -36.3833, lng: 145.3997 },
      { name: 'Euroa', lat: -36.7520, lng: 145.5710 },
    ],
  },
  'great-ocean-road': {
    name: 'Great Ocean Road', state: 'VIC', regionLabel: 'Great Ocean Road',
    anchors: [
      { name: 'Lorne', lat: -38.5400, lng: 143.9740 },
      { name: 'Apollo Bay', lat: -38.7560, lng: 143.6710 },
      { name: 'Port Campbell', lat: -38.6180, lng: 142.9980 },
      { name: 'Port Fairy', lat: -38.3860, lng: 142.2380 },
    ],
  },
  // ── QLD (thin hinterlands) ────────────────────────────────────────
  'scenic-rim': {
    name: 'Scenic Rim', state: 'QLD', regionLabel: 'Scenic Rim',
    anchors: [
      { name: 'Boonah', lat: -27.9990, lng: 152.6810 },
      { name: 'Rathdowney', lat: -28.2130, lng: 152.8660 },
      { name: 'Kalbar', lat: -27.9390, lng: 152.6220 },
    ],
  },
  'sunshine-coast-hinterland': {
    name: 'Sunshine Coast Hinterland', state: 'QLD', regionLabel: 'Sunshine Coast Hinterland',
    anchors: [
      { name: 'Maleny', lat: -26.7600, lng: 152.8470 },
      { name: 'Montville', lat: -26.6900, lng: 152.8880 },
      { name: 'Eumundi', lat: -26.4780, lng: 152.9510 },
      { name: 'Kenilworth', lat: -26.6050, lng: 152.7270 },
    ],
  },
  // ── SA + TAS (thin south) ─────────────────────────────────────────
  'limestone-coast': {
    name: 'Limestone Coast', state: 'SA', regionLabel: 'Limestone Coast',
    anchors: [
      { name: 'Mount Gambier', lat: -37.8284, lng: 140.7807 },
      { name: 'Robe', lat: -37.1630, lng: 139.7590 },
      { name: 'Penola', lat: -37.3750, lng: 140.8370 },
      { name: 'Naracoorte', lat: -36.9580, lng: 140.7390 },
      { name: 'Coonawarra', lat: -37.2920, lng: 140.8330 },
    ],
  },
  'huon-valley': {
    name: 'Huon Valley', state: 'TAS', regionLabel: 'Huon Valley',
    anchors: [
      { name: 'Huonville', lat: -43.0280, lng: 147.0500 },
      { name: 'Cygnet', lat: -43.1550, lng: 147.0730 },
      { name: 'Geeveston', lat: -43.1640, lng: 146.9250 },
      { name: 'Franklin', lat: -43.0870, lng: 147.0080 },
    ],
  },
}
