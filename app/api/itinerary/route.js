import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'

/** Generate an anonymous session id from user-agent + date (no PII) */
function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

/** Fire-and-forget trail log — must never break itinerary generation */
function logTrail(request, { promptText, regionDetected, verticalsIncluded, daysGenerated }) {
  try {
    const sb = getSupabaseAdmin()
    sb.from('trail_logs').insert({
      prompt_text: promptText,
      region_detected: regionDetected || null,
      verticals_included: verticalsIncluded || [],
      days_generated: daysGenerated || 0,
      session_id: getSessionId(request),
    }).then(() => {}).catch(() => {})
  } catch { /* silent */ }
}

// Map natural-language category hints to vertical keys
const CATEGORY_KEYWORDS = {
  sba: ['wine', 'winery', 'wineries', 'vineyard', 'vineyards', 'brewery', 'breweries', 'distillery', 'distilleries', 'cellar door', 'gin', 'whisky', 'cider', 'craft beer', 'natural wine', 'spirits', 'drink', 'drinks', 'small batch', 'tasting'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'espresso'],
  rest: ['accommodation', 'stay', 'stays', 'hotel', 'hotels', 'glamping', 'farmstay', 'cottage', 'boutique stay', 'bnb', 'b&b', 'bed and breakfast', 'sleep'],
  collection: ['art', 'gallery', 'galleries', 'museum', 'museums', 'heritage', 'cultural', 'exhibition'],
  craft: ['maker', 'makers', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery'],
  field: ['nature', 'hiking', 'waterfall', 'swimming hole', 'lookout', 'walking', 'outdoor', 'national park'],
  corner: ['shop', 'shops', 'bookshop', 'record store', 'homewares', 'indie'],
  found: ['vintage', 'op shop', 'antique', 'antiques', 'secondhand', 'thrift', 'retro'],
  table: ['food', 'bakery', 'farm gate', 'providore', 'cheese', 'olive oil', 'produce', 'sourdough'],
}

// Geographic anchors: center coordinates + bounding radius for all known regions/cities.
// This is the ONLY source of geographic filtering — no text-matching on listing.region.
// radiusDeg is in degrees (~111km per degree latitude).
const GEO_ANCHORS = {
  // Wine/food regions
  'Barossa':                { lat: -34.56, lng: 138.95, r: 0.35 },
  'Yarra Valley':           { lat: -37.73, lng: 145.51, r: 0.35 },
  'Mornington Peninsula':   { lat: -38.37, lng: 145.03, r: 0.30 },
  'Blue Mountains':         { lat: -33.72, lng: 150.31, r: 0.35 },
  'Byron':                  { lat: -28.64, lng: 153.61, r: 0.30 },
  'Adelaide Hills':         { lat: -35.02, lng: 138.72, r: 0.35 },
  'Hunter Valley':          { lat: -32.75, lng: 151.28, r: 0.40 },
  'Margaret River':         { lat: -33.95, lng: 115.07, r: 0.40 },
  'Daylesford':             { lat: -37.35, lng: 144.15, r: 0.25 },
  'Macedon Ranges':         { lat: -37.35, lng: 144.55, r: 0.30 },
  'Dandenong Ranges':       { lat: -37.85, lng: 145.35, r: 0.20 },
  'Goldfields':             { lat: -37.05, lng: 144.28, r: 0.50 },
  'Bellarine':              { lat: -38.25, lng: 144.55, r: 0.25 },
  'Gippsland':              { lat: -38.05, lng: 146.00, r: 0.80 },
  'Southern Highlands':     { lat: -34.50, lng: 150.45, r: 0.35 },
  'Central Coast':          { lat: -33.30, lng: 151.35, r: 0.35 },
  'Sunshine Coast':         { lat: -26.65, lng: 153.05, r: 0.35 },
  'Gold Coast':             { lat: -28.00, lng: 153.40, r: 0.35 },
  'Noosa':                  { lat: -26.39, lng: 153.09, r: 0.25 },
  'Kangaroo Island':        { lat: -35.80, lng: 137.20, r: 0.45 },
  'McLaren Vale':           { lat: -35.22, lng: 138.55, r: 0.25 },
  'Clare Valley':           { lat: -33.83, lng: 138.60, r: 0.35 },
  'Great Ocean Road':       { lat: -38.68, lng: 143.55, r: 0.60 },
  'Grampians':              { lat: -37.15, lng: 142.45, r: 0.50 },
  'Bruny Island':           { lat: -43.30, lng: 147.33, r: 0.25 },
  'Cradle Mountain':        { lat: -41.65, lng: 145.95, r: 0.30 },
  'South Coast':            { lat: -35.10, lng: 150.60, r: 0.50 },
  'North Coast':            { lat: -29.50, lng: 153.30, r: 0.50 },
  'Mid North Coast':        { lat: -31.20, lng: 152.75, r: 0.50 },
  'Shoalhaven':             { lat: -34.88, lng: 150.60, r: 0.35 },
  'Tamar Valley':           { lat: -41.30, lng: 147.05, r: 0.30 },
  'Riverland':              { lat: -34.18, lng: 140.75, r: 0.45 },
  'Limestone Coast':        { lat: -37.05, lng: 140.80, r: 0.50 },
  'Scenic Rim':             { lat: -28.10, lng: 152.80, r: 0.35 },
  'Flinders Ranges':        { lat: -32.00, lng: 138.60, r: 0.60 },
  // Cities — slightly larger radius to capture metro + fringe
  'Melbourne':              { lat: -37.81, lng: 144.96, r: 0.45 },
  'Sydney':                 { lat: -33.87, lng: 151.21, r: 0.45 },
  'Brisbane':               { lat: -27.47, lng: 153.03, r: 0.45 },
  'Adelaide':               { lat: -34.93, lng: 138.60, r: 0.40 },
  'Perth':                  { lat: -31.95, lng: 115.86, r: 0.45 },
  'Hobart':                 { lat: -42.88, lng: 147.33, r: 0.40 },
  'Darwin':                 { lat: -12.46, lng: 130.84, r: 0.40 },
  'Fremantle':              { lat: -32.05, lng: 115.75, r: 0.25 },
  'Bendigo':                { lat: -36.76, lng: 144.28, r: 0.30 },
  'Ballarat':               { lat: -37.56, lng: 143.85, r: 0.30 },
  'Orange':                 { lat: -33.28, lng: 149.10, r: 0.35 },
  'Mudgee':                 { lat: -32.60, lng: 149.59, r: 0.30 },
  'Beechworth':             { lat: -36.36, lng: 146.69, r: 0.25 },
  'Bright':                 { lat: -36.73, lng: 146.96, r: 0.25 },
  'Healesville':            { lat: -37.65, lng: 145.52, r: 0.25 },
  'Red Hill':               { lat: -38.37, lng: 145.03, r: 0.20 },
  'Hepburn':                { lat: -37.32, lng: 144.14, r: 0.20 },
  'Launceston':             { lat: -41.45, lng: 147.14, r: 0.30 },
  'Canberra':               { lat: -35.28, lng: 149.13, r: 0.35 },
  // Additional regions referenced by CITY_TO_REGION
  'Bellarine Peninsula':    { lat: -38.25, lng: 144.55, r: 0.25 },
  'Far North Queensland':   { lat: -16.92, lng: 145.77, r: 0.80 },
  'Top End':                { lat: -12.46, lng: 130.84, r: 1.20 },
  'North Queensland':       { lat: -19.25, lng: 146.80, r: 0.80 },
  'Darling Downs':          { lat: -27.56, lng: 151.95, r: 0.60 },
  'Central Queensland':     { lat: -23.38, lng: 150.51, r: 0.80 },
  'ACT':                    { lat: -35.28, lng: 149.13, r: 0.35 },
  'North East Victoria':    { lat: -36.36, lng: 146.69, r: 0.60 },
  'Riverina':               { lat: -35.12, lng: 147.37, r: 0.80 },
  'Northern Rivers':        { lat: -28.81, lng: 153.28, r: 0.50 },
  'Murray River':           { lat: -35.75, lng: 144.25, r: 0.80 },
  'Goulburn Valley':        { lat: -36.38, lng: 145.40, r: 0.50 },
  'New England':            { lat: -30.50, lng: 151.65, r: 0.60 },
  'Central West NSW':       { lat: -32.25, lng: 148.60, r: 0.80 },
  'Eurobodalla':            { lat: -35.71, lng: 150.18, r: 0.35 },
  'Sapphire Coast':         { lat: -36.89, lng: 149.91, r: 0.40 },
  'Wimmera':                { lat: -36.72, lng: 142.20, r: 0.60 },
  'West Gippsland':         { lat: -38.13, lng: 145.95, r: 0.40 },
  'Surf Coast':             { lat: -38.33, lng: 144.32, r: 0.25 },
  'Western Victoria':       { lat: -37.83, lng: 142.02, r: 0.60 },
  'North West Tasmania':    { lat: -41.18, lng: 145.87, r: 0.50 },
  'Red Centre':             { lat: -23.70, lng: 133.87, r: 1.50 },
  'Kimberley':              { lat: -17.96, lng: 122.24, r: 1.50 },
}

// State bounding boxes for directional queries ("eastern victoria", "north queensland")
const STATE_BOUNDS = {
  VIC: { latMin: -39.2, latMax: -34.0, lngMin: 140.9, lngMax: 150.0 },
  NSW: { latMin: -37.5, latMax: -28.2, lngMin: 140.9, lngMax: 153.7 },
  QLD: { latMin: -29.2, latMax: -10.7, lngMin: 138.0, lngMax: 153.6 },
  SA:  { latMin: -38.1, latMax: -26.0, lngMin: 129.0, lngMax: 141.0 },
  WA:  { latMin: -35.1, latMax: -13.7, lngMin: 112.9, lngMax: 129.0 },
  TAS: { latMin: -43.7, latMax: -39.5, lngMin: 143.8, lngMax: 148.5 },
  ACT: { latMin: -35.9, latMax: -35.1, lngMin: 148.7, lngMax: 149.4 },
  NT:  { latMin: -26.0, latMax: -10.9, lngMin: 129.0, lngMax: 138.0 },
}

// Region keyword detection — maps natural-language phrases to GEO_ANCHOR keys or state codes
const REGION_KEYWORDS = {
  'barossa': 'Barossa', 'yarra valley': 'Yarra Valley', 'mornington': 'Mornington Peninsula',
  'mornington peninsula': 'Mornington Peninsula', 'blue mountains': 'Blue Mountains',
  'byron': 'Byron', 'byron bay': 'Byron', 'adelaide hills': 'Adelaide Hills',
  'hunter valley': 'Hunter Valley', 'margaret river': 'Margaret River',
  'daylesford': 'Daylesford', 'macedon': 'Macedon Ranges', 'macedon ranges': 'Macedon Ranges',
  'dandenong': 'Dandenong Ranges', 'goldfields': 'Goldfields', 'bellarine': 'Bellarine',
  'gippsland': 'Gippsland', 'southern highlands': 'Southern Highlands',
  'central coast': 'Central Coast', 'sunshine coast': 'Sunshine Coast',
  'gold coast': 'Gold Coast', 'noosa': 'Noosa', 'kangaroo island': 'Kangaroo Island',
  'tasmania': 'TAS', 'melbourne': 'Melbourne', 'sydney': 'Sydney', 'brisbane': 'Brisbane',
  'adelaide': 'Adelaide', 'perth': 'Perth', 'hobart': 'Hobart', 'canberra': 'Canberra',
  'darwin': 'Darwin', 'fremantle': 'Fremantle', 'bendigo': 'Bendigo', 'ballarat': 'Ballarat',
  'orange': 'Orange', 'mudgee': 'Mudgee', 'mclaren vale': 'McLaren Vale',
  'clare valley': 'Clare Valley', 'great ocean road': 'Great Ocean Road',
  'grampians': 'Grampians', 'beechworth': 'Beechworth', 'bright': 'Bright',
  'healesville': 'Healesville', 'red hill': 'Red Hill', 'hepburn': 'Hepburn',
  'launceston': 'Launceston', 'cradle mountain': 'Cradle Mountain',
  'bruny island': 'Bruny Island', 'south coast': 'South Coast',
  'north coast': 'North Coast', 'mid north coast': 'Mid North Coast',
  'shoalhaven': 'Shoalhaven', 'tamar valley': 'Tamar Valley', 'tamar': 'Tamar Valley',
  'riverland': 'Riverland', 'limestone coast': 'Limestone Coast',
  'scenic rim': 'Scenic Rim', 'flinders ranges': 'Flinders Ranges', 'flinders': 'Flinders Ranges',
  // Regions that exist in GEO_ANCHORS but were previously unreachable by keyword
  'northern rivers': 'Northern Rivers', 'bellarine': 'Bellarine Peninsula', 'bellarine peninsula': 'Bellarine Peninsula',
  'far north queensland': 'Far North Queensland', 'fnq': 'Far North Queensland',
  'top end': 'Top End', 'north queensland': 'North Queensland',
  'darling downs': 'Darling Downs', 'central queensland': 'Central Queensland',
  'north east victoria': 'North East Victoria', 'northeast victoria': 'North East Victoria',
  'riverina': 'Riverina', 'murray river': 'Murray River', 'murray': 'Murray River',
  'goulburn valley': 'Goulburn Valley', 'new england': 'New England',
  'central west nsw': 'Central West NSW', 'central west': 'Central West NSW',
  'eurobodalla': 'Eurobodalla', 'sapphire coast': 'Sapphire Coast',
  'wimmera': 'Wimmera', 'west gippsland': 'West Gippsland',
  'surf coast': 'Surf Coast', 'western victoria': 'Western Victoria',
  'north west tasmania': 'North West Tasmania', 'northwest tasmania': 'North West Tasmania',
  'red centre': 'Red Centre', 'kimberley': 'Kimberley',
  // Additional natural language variants
  'illawarra': 'Southern Highlands', 'south coast nsw': 'Shoalhaven',
  'whitsundays': 'Central Queensland', 'atherton tablelands': 'Far North Queensland',
  'daintree': 'Far North Queensland', 'tweed': 'Northern Rivers',
  'mullumbimby': 'Northern Rivers', 'bangalow': 'Northern Rivers',
}

// City-to-region mapping: maps common Australian cities/towns to their nearest
// covered Atlas region. Checked BEFORE REGION_KEYWORDS so that e.g. "Geelong"
// resolves to Bellarine Peninsula rather than failing or matching a broad area.
const CITY_TO_REGION = {
  'geelong':        { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Geelong' },
  'ballarat':       { region: 'Goldfields', label: 'Showing results for Goldfields near Ballarat' },
  'bendigo':        { region: 'Goldfields', label: 'Showing results for Goldfields near Bendigo' },
  'newcastle':      { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Newcastle' },
  'wollongong':     { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Wollongong' },
  'cairns':         { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Cairns' },
  'darwin':         { region: 'Top End', label: 'Showing results for Top End near Darwin' },
  'townsville':     { region: 'North Queensland', label: 'Showing results for North Queensland near Townsville' },
  'toowoomba':      { region: 'Darling Downs', label: 'Showing results for Darling Downs near Toowoomba' },
  'rockhampton':    { region: 'Central Queensland', label: 'Showing results for Central Queensland near Rockhampton' },
  'canberra':       { region: 'ACT', label: 'Showing results for ACT near Canberra' },
  'albury':         { region: 'North East Victoria', label: 'Showing results for North East Victoria near Albury' },
  'wagga wagga':    { region: 'Riverina', label: 'Showing results for Riverina near Wagga Wagga' },
  'bunbury':        { region: 'Margaret River', label: 'Showing results for Margaret River near Bunbury' },
  'geraldton':      { region: 'WA', label: 'Showing results for Western Australia near Geraldton' },
  'bathurst':       { region: 'Orange', label: 'Showing results for Orange near Bathurst' },
  'tamworth':       { region: 'New England', label: 'Showing results for New England near Tamworth' },
  'dubbo':          { region: 'Central West NSW', label: 'Showing results for Central West NSW near Dubbo' },
  'lismore':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Lismore' },
  'coffs harbour':  { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Coffs Harbour' },
  'port macquarie': { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Port Macquarie' },
  'mildura':        { region: 'Murray River', label: 'Showing results for Murray River near Mildura' },
  'shepparton':     { region: 'Goulburn Valley', label: 'Showing results for Goulburn Valley near Shepparton' },
  'warrnambool':    { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Warrnambool' },
  'mount gambier':  { region: 'Limestone Coast', label: 'Showing results for Limestone Coast near Mount Gambier' },
  'burnie':         { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Burnie' },
  'devonport':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Devonport' },
  'alice springs':  { region: 'Red Centre', label: 'Showing results for Red Centre near Alice Springs' },
  'broome':         { region: 'Kimberley', label: 'Showing results for Kimberley near Broome' },
  'mandurah':       { region: 'Perth', label: 'Showing results for Perth near Mandurah' },
  'gosford':        { region: 'Central Coast', label: 'Showing results for Central Coast near Gosford' },
  'wangaratta':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Wangaratta' },
  'echuca':         { region: 'Murray River', label: 'Showing results for Murray River near Echuca' },
  'swan hill':      { region: 'Murray River', label: 'Showing results for Murray River near Swan Hill' },
  'armidale':       { region: 'New England', label: 'Showing results for New England near Armidale' },
  'nowra':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Nowra' },
  'batemans bay':   { region: 'Eurobodalla', label: 'Showing results for Eurobodalla near Batemans Bay' },
  'ulladulla':      { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Ulladulla' },
  'merimbula':      { region: 'Sapphire Coast', label: 'Showing results for Sapphire Coast near Merimbula' },
  'horsham':        { region: 'Wimmera', label: 'Showing results for Wimmera near Horsham' },
  'sale':           { region: 'Gippsland', label: 'Showing results for Gippsland near Sale' },
  'traralgon':      { region: 'Gippsland', label: 'Showing results for Gippsland near Traralgon' },
  'warragul':       { region: 'West Gippsland', label: 'Showing results for West Gippsland near Warragul' },
  'torquay':        { region: 'Surf Coast', label: 'Showing results for Surf Coast near Torquay' },
  'lorne':          { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Lorne' },
  'apollo bay':     { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Apollo Bay' },
  'port fairy':     { region: 'Western Victoria', label: 'Showing results for Western Victoria near Port Fairy' },
  'hamilton':       { region: 'Western Victoria', label: 'Showing results for Western Victoria near Hamilton' },
  'colac':          { region: 'Western Victoria', label: 'Showing results for Western Victoria near Colac' },
  'castlemaine':    { region: 'Goldfields', label: 'Showing results for Goldfields near Castlemaine' },
  // Additional cities for broader coverage
  'wodonga':        { region: 'North East Victoria', label: 'Showing results for North East Victoria near Wodonga' },
  'maitland':       { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Maitland' },
  'cessnock':       { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Cessnock' },
  'katoomba':       { region: 'Blue Mountains', label: 'Showing results for Blue Mountains near Katoomba' },
  'leura':          { region: 'Blue Mountains', label: 'Showing results for Blue Mountains near Leura' },
  'victor harbor':  { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Victor Harbor' },
  'goolwa':         { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Goolwa' },
  'port douglas':   { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Port Douglas' },
  'mission beach':  { region: 'North Queensland', label: 'Showing results for North Queensland near Mission Beach' },
  'gladstone':      { region: 'Central Queensland', label: 'Showing results for Central Queensland near Gladstone' },
  'mackay':         { region: 'Central Queensland', label: 'Showing results for Central Queensland near Mackay' },
  'caloundra':      { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast near Caloundra' },
  'maroochydore':   { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast near Maroochydore' },
  'coolangatta':    { region: 'Gold Coast', label: 'Showing results for Gold Coast near Coolangatta' },
  'warwick':        { region: 'Darling Downs', label: 'Showing results for Darling Downs near Warwick' },
  'grafton':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Grafton' },
  'kempsey':        { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Kempsey' },
  'orange':         { region: 'Orange', label: 'Showing results for Orange region' },
  'mudgee':         { region: 'Central West NSW', label: 'Showing results for Central West NSW near Mudgee' },
  'benalla':        { region: 'North East Victoria', label: 'Showing results for North East Victoria near Benalla' },
  'seymour':        { region: 'Goulburn Valley', label: 'Showing results for Goulburn Valley near Seymour' },
  'korumburra':     { region: 'West Gippsland', label: 'Showing results for West Gippsland near Korumburra' },
  'bairnsdale':     { region: 'Gippsland', label: 'Showing results for Gippsland near Bairnsdale' },
  'lakes entrance':  { region: 'Gippsland', label: 'Showing results for Gippsland near Lakes Entrance' },
  'margaret river': { region: 'Margaret River', label: 'Showing results for Margaret River region' },
  'dunsborough':    { region: 'Margaret River', label: 'Showing results for Margaret River near Dunsborough' },
  'busselton':      { region: 'Margaret River', label: 'Showing results for Margaret River near Busselton' },
  'kalgoorlie':     { region: 'WA', label: 'Showing results for Western Australia near Kalgoorlie' },
  'albany':         { region: 'WA', label: 'Showing results for Western Australia near Albany' },
  // Extended city-to-region coverage (task #2)
  'berry':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Berry' },
  'kiama':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Kiama' },
  'bowral':         { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Bowral' },
  'moss vale':      { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Moss Vale' },
  'mittagong':      { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Mittagong' },
  'thirroul':       { region: 'Southern Highlands', label: 'Showing results for Illawarra near Thirroul' },
  'mullumbimby':    { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Mullumbimby' },
  'bangalow':       { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Bangalow' },
  'ballina':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Ballina' },
  'lennox head':    { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Lennox Head' },
  'murwillumbah':   { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Murwillumbah' },
  'bellingen':      { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Bellingen' },
  'sawtell':        { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Sawtell' },
  'yamba':          { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Yamba' },
  'drouin':         { region: 'West Gippsland', label: 'Showing results for West Gippsland near Drouin' },
  'phillip island':  { region: 'West Gippsland', label: 'Showing results for West Gippsland near Phillip Island' },
  'inverloch':      { region: 'West Gippsland', label: 'Showing results for West Gippsland near Inverloch' },
  'paynesville':    { region: 'Gippsland', label: 'Showing results for Gippsland near Paynesville' },
  'mallacoota':     { region: 'Gippsland', label: 'Showing results for Gippsland near Mallacoota' },
  'anglesea':       { region: 'Surf Coast', label: 'Showing results for Surf Coast near Anglesea' },
  'aireys inlet':   { region: 'Surf Coast', label: 'Showing results for Surf Coast near Aireys Inlet' },
  'drysdale':       { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Drysdale' },
  'queenscliff':    { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Queenscliff' },
  'portarlington':  { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Portarlington' },
  'kyneton':        { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Kyneton' },
  'woodend':        { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Woodend' },
  'gisborne':       { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Gisborne' },
  'daylesford':     { region: 'Daylesford', label: 'Showing results for Daylesford region' },
  'hepburn springs': { region: 'Hepburn', label: 'Showing results for Hepburn Springs region' },
  'trentham':       { region: 'Hepburn', label: 'Showing results for Hepburn near Trentham' },
  'yackandandah':   { region: 'North East Victoria', label: 'Showing results for North East Victoria near Yackandandah' },
  'rutherglen':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Rutherglen' },
  'myrtleford':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Myrtleford' },
  'tanunda':        { region: 'Barossa', label: 'Showing results for Barossa Valley near Tanunda' },
  'nuriootpa':      { region: 'Barossa', label: 'Showing results for Barossa Valley near Nuriootpa' },
  'angaston':       { region: 'Barossa', label: 'Showing results for Barossa Valley near Angaston' },
  'stirling':       { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Stirling' },
  'hahndorf':       { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Hahndorf' },
  'mt barker':      { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Mt Barker' },
  'mclaren vale':   { region: 'McLaren Vale', label: 'Showing results for McLaren Vale region' },
  'willunga':       { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Willunga' },
  'huonville':      { region: 'Hobart', label: 'Showing results for Hobart near Huonville' },
  'richmond':       { region: 'Hobart', label: 'Showing results for Hobart near Richmond' },
  'cygnet':         { region: 'Hobart', label: 'Showing results for Hobart near Cygnet' },
  'sheffield':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Sheffield' },
  'deloraine':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Deloraine' },
  'maleny':         { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast Hinterland near Maleny' },
  'montville':      { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast Hinterland near Montville' },
  'eumundi':        { region: 'Noosa', label: 'Showing results for Noosa near Eumundi' },
  'kuranda':        { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Kuranda' },
  'yungaburra':     { region: 'Far North Queensland', label: 'Showing results for Atherton Tablelands near Yungaburra' },
  'tamborine mountain': { region: 'Gold Coast', label: 'Showing results for Gold Coast Hinterland near Tamborine Mountain' },
}

// State name variants for directional parsing
const STATE_NAMES = {
  'victoria': 'VIC', 'vic': 'VIC',
  'new south wales': 'NSW', 'nsw': 'NSW',
  'queensland': 'QLD', 'qld': 'QLD',
  'south australia': 'SA', 'sa': 'SA',
  'western australia': 'WA', 'wa': 'WA',
  'tasmania': 'TAS', 'tas': 'TAS', 'tassie': 'TAS',
  'northern territory': 'NT', 'nt': 'NT',
  'act': 'ACT', 'canberra': 'ACT',
}

/**
 * Resolve a parsed region label into a geographic bounding box.
 * Returns { latMin, latMax, lngMin, lngMax, label } or null if unresolvable.
 */
function resolveGeoBounds(regionLabel, rawQuery) {
  if (!regionLabel && !rawQuery) return null

  // 1. Check GEO_ANCHORS for an exact named region
  if (regionLabel && GEO_ANCHORS[regionLabel]) {
    const a = GEO_ANCHORS[regionLabel]
    return {
      latMin: a.lat - a.r, latMax: a.lat + a.r,
      lngMin: a.lng - a.r, lngMax: a.lng + a.r,
      label: regionLabel,
    }
  }

  // 2. Check if regionLabel is a state code → full state bounds
  if (regionLabel && STATE_BOUNDS[regionLabel]) {
    return { ...STATE_BOUNDS[regionLabel], label: regionLabel }
  }

  return null
}

/**
 * Parse directional state references from the raw query.
 * e.g. "eastern victoria" → VIC eastern half bounding box
 * e.g. "north queensland" → QLD northern third
 */
function parseDirectionalRegion(rawQuery) {
  const q = rawQuery.toLowerCase().trim()

  const DIRECTIONS = [
    { patterns: ['eastern', 'east'], side: 'east' },
    { patterns: ['western', 'west'], side: 'west' },
    { patterns: ['northern', 'north'], side: 'north' },
    { patterns: ['southern', 'south'], side: 'south' },
    { patterns: ['central', 'central'], side: 'central' },
  ]

  // Sort state names by length (longest first) to match "south australia" before "south"
  const stateEntries = Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)

  for (const { patterns, side } of DIRECTIONS) {
    for (const dir of patterns) {
      for (const [stateName, stateCode] of stateEntries) {
        // Match "eastern victoria", "east victoria", "east vic"
        const phrase1 = `${dir} ${stateName}`
        const phrase2 = `${stateName} ${dir}` // "victoria east" less common but handle it
        if (q.includes(phrase1) || q.includes(phrase2)) {
          const bounds = STATE_BOUNDS[stateCode]
          if (!bounds) continue

          const latMid = (bounds.latMin + bounds.latMax) / 2
          const lngMid = (bounds.lngMin + bounds.lngMax) / 2
          const latThird = (bounds.latMax - bounds.latMin) / 3
          const lngThird = (bounds.lngMax - bounds.lngMin) / 3

          let box
          switch (side) {
            case 'east':
              box = { latMin: bounds.latMin, latMax: bounds.latMax, lngMin: lngMid, lngMax: bounds.lngMax }
              break
            case 'west':
              box = { latMin: bounds.latMin, latMax: bounds.latMax, lngMin: bounds.lngMin, lngMax: lngMid }
              break
            case 'north':
              // For southern hemisphere: "north" means less negative latitude (higher latMax)
              box = { latMin: latMid, latMax: bounds.latMax, lngMin: bounds.lngMin, lngMax: bounds.lngMax }
              break
            case 'south':
              box = { latMin: bounds.latMin, latMax: latMid, lngMin: bounds.lngMin, lngMax: bounds.lngMax }
              break
            case 'central':
              box = {
                latMin: bounds.latMin + latThird, latMax: bounds.latMax - latThird,
                lngMin: bounds.lngMin + lngThird, lngMax: bounds.lngMax - lngThird,
              }
              break
          }

          const label = `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${stateCode}`
          return { ...box, label, state: stateCode }
        }
      }
    }
  }

  return null
}

/**
 * Apply geographic bounding box filter to a Supabase query.
 * This is the single point of geographic filtering — used by all query paths.
 */
function applyGeoFilter(query, geoBounds) {
  if (!geoBounds) return query
  return query
    .gte('lat', geoBounds.latMin)
    .lte('lat', geoBounds.latMax)
    .gte('lng', geoBounds.lngMin)
    .lte('lng', geoBounds.lngMax)
}

// Word-number to digit conversion
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10,
}

// Duration extraction from query
const DURATION_PATTERNS = [
  { pattern: /(\d+)\s*nights?/i, extract: m => ({ nights: parseInt(m[1]) }) },
  { pattern: /(\d+)\s*days?/i, extract: m => ({ days: parseInt(m[1]) }) },
  { pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*nights?\b/i, extract: m => ({ nights: WORD_NUMBERS[m[1].toLowerCase()] }) },
  { pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*days?\b/i, extract: m => ({ days: WORD_NUMBERS[m[1].toLowerCase()] }) },
  { pattern: /weekend/i, extract: () => ({ days: 2 }) },
  { pattern: /long\s*weekend/i, extract: () => ({ days: 3 }) },
  { pattern: /day\s*trip/i, extract: () => ({ days: 1 }) },
  { pattern: /overnight/i, extract: () => ({ nights: 1 }) },
]

function parseItineraryQuery(rawQuery) {
  const q = rawQuery.toLowerCase().trim()
  let region = null
  let geoBounds = null
  let city_note = null
  let verticals = []
  let duration = { days: 1 }

  // 1. Try directional state phrases first ("eastern victoria", "north queensland")
  //    These are more specific than REGION_KEYWORDS and should take priority
  const directional = parseDirectionalRegion(q)
  if (directional) {
    geoBounds = directional
    region = directional.label
  }

  // 2. Try CITY_TO_REGION mapping — redirects cities to their nearest covered region
  if (!geoBounds) {
    const cityEntries = Object.entries(CITY_TO_REGION).sort((a, b) => b[0].length - a[0].length)
    for (const [cityName, mapping] of cityEntries) {
      const re = new RegExp(`\\b${cityName.replace(/\s+/g, '\\s+')}\\b`)
      if (re.test(q)) {
        region = mapping.region
        city_note = mapping.label
        geoBounds = resolveGeoBounds(mapping.region, q)
        break
      }
    }
  }

  // 3. Try known region keywords (longest match first)
  if (!geoBounds) {
    const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
    for (const [kw, regionValue] of regionEntries) {
      if (q.includes(kw)) {
        region = regionValue
        break
      }
    }

    // Resolve the matched region to coordinates
    if (region) {
      geoBounds = resolveGeoBounds(region, q)
    }
  }

  // 4. Last resort: check for bare state names not caught by REGION_KEYWORDS
  if (!geoBounds && !region) {
    const stateEntries = Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)
    for (const [name, code] of stateEntries) {
      // Only match if it's a word boundary (avoid "orange" matching "or" etc.)
      const re = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`)
      if (re.test(q)) {
        region = code
        geoBounds = resolveGeoBounds(code, q)
        break
      }
    }
  }

  // Extract category/vertical hints with preference weighting.
  // Classify each detected vertical based on surrounding context signals:
  //   primary   — the thing they came for (anchors every day)
  //   secondary — "also include..." / explicit supporting interests (1-2 per day)
  //   soft      — "if possible" / "maybe" / hedged (only where it naturally fits)
  const preferences = { primary: [], secondary: [], soft: [] }

  const softCtx = [
    /if\s+(?:there(?:'?s)?|you\s+can|possible)/i,
    /maybe\s+(?:some|a\s+few)/i,
    /wouldn'?t\s+mind/i,
  ]
  const secondaryCtx = [
    /also\s+(?:include|add|visit|see|check)/i,
    /throw\s+in/i,
    /plus\s+(?:some|a\s+few)/i,
  ]

  for (const [vKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      const kwIdx = q.indexOf(kw)
      if (kwIdx === -1) continue
      if (!verticals.includes(vKey)) verticals.push(vKey)

      // Classify weight from surrounding context (60 chars lookback)
      const before = q.slice(Math.max(0, kwIdx - 60), kwIdx)
      const around = q.slice(Math.max(0, kwIdx - 60), kwIdx + kw.length + 30)

      if (softCtx.some(p => p.test(around))) {
        if (!preferences.soft.includes(vKey)) preferences.soft.push(vKey)
      } else if (secondaryCtx.some(p => p.test(before))) {
        if (!preferences.secondary.includes(vKey)) preferences.secondary.push(vKey)
      } else {
        if (!preferences.primary.includes(vKey)) preferences.primary.push(vKey)
      }
      break
    }
  }

  // If no explicit primary was found, promote the first detected vertical
  if (preferences.primary.length === 0 && verticals.length > 0) {
    preferences.primary.push(verticals[0])
    preferences.secondary = preferences.secondary.filter(v => v !== verticals[0])
    preferences.soft = preferences.soft.filter(v => v !== verticals[0])
  }
  // Dedupe across tiers — higher tier wins
  preferences.secondary = preferences.secondary.filter(v => !preferences.primary.includes(v))
  preferences.soft = preferences.soft.filter(v => !preferences.primary.includes(v) && !preferences.secondary.includes(v))

  // Extract duration
  for (const { pattern, extract } of DURATION_PATTERNS) {
    const match = q.match(pattern)
    if (match) {
      const d = extract(match)
      if (d.nights) duration = { days: d.nights + 1 }
      else if (d.days) duration = { days: d.days }
      break
    }
  }

  return { region, geoBounds, verticals, duration, city_note, preferences }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Activity-to-vertical mapping — shared between candidate selection and recommendation weighting
const ACTIVITY_TO_VERTICAL = {
  wine_tasting: 'sba', craft_beer: 'sba', distillery_tours: 'sba',
  coffee: 'fine_grounds',
  hiking: 'field', swimming: 'field', lookouts: 'field', national_parks: 'field',
  galleries: 'collection', museums: 'collection', heritage: 'collection',
  makers_studios: 'craft', ceramics: 'craft', woodwork: 'craft',
  farm_gate: 'table', markets: 'table', bakeries: 'table', providores: 'table',
  boutique_stays: 'rest', glamping: 'rest', farm_stays: 'rest',
  bookshops: 'corner', record_stores: 'corner', homewares: 'corner',
  vintage: 'found', op_shops: 'found', antiques: 'found',
}

// Readable labels for activities (for LLM prompt)
const ACTIVITY_LABELS = {
  wine_tasting: 'Wine tasting', craft_beer: 'Craft beer', distillery_tours: 'Distillery tours',
  coffee: 'Specialty coffee',
  hiking: 'Hiking & walks', swimming: 'Swimming holes', lookouts: 'Lookouts', national_parks: 'National parks',
  galleries: 'Galleries', museums: 'Museums', heritage: 'Heritage sites',
  makers_studios: 'Makers & studios', ceramics: 'Ceramics & pottery', woodwork: 'Woodwork',
  farm_gate: 'Farm gates', markets: 'Markets', bakeries: 'Bakeries', providores: 'Providores',
  boutique_stays: 'Boutique stays', glamping: 'Glamping', farm_stays: 'Farm stays',
  bookshops: 'Bookshops', record_stores: 'Record stores', homewares: 'Homewares',
  vintage: 'Vintage', op_shops: 'Op shops', antiques: 'Antiques',
}

// Chronological day ordering: the ideal sequence for stops within a single day.
// Coffee/food first, nature and culture through the day, browsing and craft in
// the afternoon, tastings and drinks in the evening, accommodation last.
const VERTICAL_ORDER = [
  'fine_grounds', // coffee first thing
  'table',        // farm gates, bakeries, providores — morning food stops
  'field',        // nature, hiking, lookouts — active mid-morning
  'collection',   // galleries, museums, heritage — midday culture
  'craft',        // makers, studios — afternoon browsing
  'corner',       // bookshops, homewares — afternoon shopping
  'found',        // vintage, op shops — late afternoon
  'sba',          // wine, brewery, distillery — evening tastings
  'rest',         // accommodation — end of day
]

// Group type → vertical weighting adjustments
const GROUP_VERTICAL_WEIGHTS = {
  family: { boost: ['field', 'table', 'collection'], deprioritise: [] },
  friends: { boost: ['sba', 'table', 'found'], deprioritise: [] },
  solo: { boost: [], deprioritise: [] },
  couple: { boost: [], deprioritise: [] },
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  // Question flow params
  const accommodation = searchParams.get('accommodation') // 'need' | 'sorted' | 'daytrip'
  const transport = searchParams.get('transport')           // 'driving' | 'public' | 'walking'
  const group = searchParams.get('group')                   // 'family' | 'friends' | 'solo' | 'couple'
  const pace = searchParams.get('pace')                     // 'packed' | 'relaxed'

  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: 'Query parameter "q" is required (min 3 characters)' }, { status: 400 })
  }

  try {
    const { region, geoBounds, verticals, duration, city_note, preferences } = parseItineraryQuery(q)

    // Pace overrides stops-per-day target
    const stopsPerDay = pace === 'packed' ? 6 : pace === 'relaxed' ? 3 : 4

    console.log('[itinerary] Parsed query:', {
      region,
      geoBounds: geoBounds ? `${geoBounds.label || 'custom'} (${geoBounds.latMin.toFixed(2)}–${geoBounds.latMax.toFixed(2)}, ${geoBounds.lngMin.toFixed(2)}–${geoBounds.lngMax.toFixed(2)})` : 'NONE',
      verticals, duration, preferences,
      flow: { accommodation, transport, group, pace, stopsPerDay },
    })

    // STEP 1: Region must be detected. If the user's query names a place we can't
    // resolve, return an honest error rather than silently serving random venues.
    if (!geoBounds) {
      console.warn('[itinerary] No geographic anchor resolved from query:', q)

      // Suggest well-covered regions the user might mean
      const topRegions = ['Melbourne', 'Sydney', 'Barossa', 'Hobart', 'Blue Mountains', 'Mornington Peninsula', 'Byron', 'Adelaide Hills']
      const suggestedTrails = topRegions.slice(0, 3).map(r => ({
        query: `Day trip to ${r}`,
        region: r,
      }))

      return NextResponse.json({
        error: 'no_region',
        message: `We couldn't identify a specific region in your request. Try naming a place — like "Barossa Valley", "Hobart", or "Eastern Victoria".`,
        query: q,
        region: null,
        suggested_trails: suggestedTrails,
      }, { status: 200 })
    }

    // Fetch user preferences if authenticated
    let userInterests = null
    let isAuthenticated = false
    try {
      const { createAuthServerClient } = await import('@/lib/supabase/auth-clients')
      const authSb = await createAuthServerClient()
      const { data: { user } } = await authSb.auth.getUser()
      if (user) {
        isAuthenticated = true
        const adminSb = getSupabaseAdmin()
        const { data: profile } = await adminSb
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .single()
        if (profile?.interests && Object.keys(profile.interests).length > 0) {
          userInterests = profile.interests
        }
      }
    } catch {
      // Auth not available or no preferences — that's fine, continue without
    }

    // Derive preferred verticals from user interests
    const preferredVerticals = new Set()
    const preferenceLabels = []
    if (userInterests?.verticals) {
      userInterests.verticals.forEach(v => preferredVerticals.add(v))
    }
    if (userInterests?.activities) {
      userInterests.activities.forEach(a => {
        if (ACTIVITY_TO_VERTICAL[a]) preferredVerticals.add(ACTIVITY_TO_VERTICAL[a])
        if (ACTIVITY_LABELS[a]) preferenceLabels.push(ACTIVITY_LABELS[a])
      })
    }

    // Apply group-type vertical weighting
    const groupWeights = GROUP_VERTICAL_WEIGHTS[group] || { boost: [], deprioritise: [] }

    // Merge: query verticals + user preference verticals (query takes priority)
    const effectiveVerticals = verticals.length > 0
      ? verticals
      : preferredVerticals.size > 0
        ? [...preferredVerticals]
        : []

    // Transport mode → tighter geo bounds for walking/cycling
    let effectiveGeoBounds = geoBounds
    if (transport === 'walking') {
      // Constrain to ~5km radius from center
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      effectiveGeoBounds = {
        ...geoBounds,
        latMin: centerLat - 0.045, latMax: centerLat + 0.045,
        lngMin: centerLng - 0.055, lngMax: centerLng + 0.055,
      }
    } else if (transport === 'public') {
      // Slightly tighter — ~15km radius (town center focused)
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      const latRange = (geoBounds.latMax - geoBounds.latMin) * 0.5
      const lngRange = (geoBounds.lngMax - geoBounds.lngMin) * 0.5
      effectiveGeoBounds = {
        ...geoBounds,
        latMin: centerLat - Math.min(latRange, 0.14),
        latMax: centerLat + Math.min(latRange, 0.14),
        lngMin: centerLng - Math.min(lngRange, 0.17),
        lngMax: centerLng + Math.min(lngRange, 0.17),
      }
    }

    // Query candidate venues from master listings
    const sb = getSupabaseAdmin()
    const LISTING_COLS = 'id, name, vertical, lat, lng, region, state, description, hero_image_url, slug, source_id, is_claimed, is_featured, editors_pick'

    // Helper: build a base query with status + coordinate filters + geo bounds
    function baseQuery() {
      let q = sb
        .from('listings')
        .select(LISTING_COLS)
        .eq('status', 'active')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
      return applyGeoFilter(q, effectiveGeoBounds)
    }

    // Accommodation handling: exclude rest from candidates if daytrip
    const includeRest = accommodation !== 'daytrip'

    let query = baseQuery()

    // For single-day trips with specific verticals, filter tightly
    if (effectiveVerticals.length > 0 && duration.days <= 1) {
      const allVerticals = includeRest
        ? [...new Set([...effectiveVerticals, 'rest'])]
        : [...new Set(effectiveVerticals)].filter(v => v !== 'rest')
      query = query.in('vertical', allVerticals)
    }

    query = query.limit(80)

    let candidates
    let error

    // For multi-day trips with focus verticals, fetch focus venues first then supplement
    if (effectiveVerticals.length > 0 && duration.days > 1) {
      const focusVerticals = includeRest
        ? [...new Set([...effectiveVerticals, 'rest'])]
        : [...new Set(effectiveVerticals)].filter(v => v !== 'rest')
      let focusQuery = baseQuery().in('vertical', focusVerticals)

      const { data: focusData, error: focusErr } = await focusQuery.limit(50)
      if (focusErr) {
        error = focusErr
      } else {
        const focusIds = new Set((focusData || []).map(v => v.id))

        // Second: fetch supplementary venues from other verticals (same geo bounds)
        const { data: suppData } = await query
        const suppVenues = (suppData || []).filter(v => !focusIds.has(v.id))

        // Combine: focus venues first, then supplements (cap total)
        candidates = [...(focusData || []), ...suppVenues].slice(0, 80)
      }
    } else {
      const result = await query
      candidates = result.data
      error = result.error
    }

    if (error) {
      console.error('[itinerary] DB query error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 })
    }

    // If we got very few results with vertical filtering on a day trip, retry without vertical filter
    // but KEEP the geo bounds — never return venues outside the requested geography
    if (effectiveVerticals.length > 0 && duration.days <= 1 && (!candidates || candidates.length < 4)) {
      const broadQuery = baseQuery()
      const { data: broadCandidates } = await broadQuery.limit(80)
      if (broadCandidates && broadCandidates.length >= 4) {
        candidates.length = 0
        candidates.push(...broadCandidates)
      }
    }

    // Sort candidates: boost claimed/featured venues, preferred verticals, and group-appropriate verticals
    candidates.sort((a, b) => {
      const aScore = (a.is_claimed ? 3 : 0) + (a.editors_pick ? 2 : 0) + (a.is_featured ? 1 : 0)
        + (preferredVerticals.has(a.vertical) ? 2 : 0)
        + (groupWeights.boost.includes(a.vertical) ? 1 : 0)
        - (groupWeights.deprioritise.includes(a.vertical) ? 1 : 0)
      const bScore = (b.is_claimed ? 3 : 0) + (b.editors_pick ? 2 : 0) + (b.is_featured ? 1 : 0)
        + (preferredVerticals.has(b.vertical) ? 2 : 0)
        + (groupWeights.boost.includes(b.vertical) ? 1 : 0)
        - (groupWeights.deprioritise.includes(b.vertical) ? 1 : 0)
      return bScore - aScore
    })

    if (!candidates || candidates.length < 4) {
      // Find nearby regions with better coverage to suggest alternatives
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      const nearbyRegions = []

      for (const [name, anchor] of Object.entries(GEO_ANCHORS)) {
        if (name === region || name === geoBounds?.label) continue
        const dist = Math.sqrt(Math.pow(anchor.lat - centerLat, 2) + Math.pow(anchor.lng - centerLng, 2))
        if (dist < 2.5) { // ~275km radius
          nearbyRegions.push({ name, dist })
        }
      }
      nearbyRegions.sort((a, b) => a.dist - b.dist)

      // Check which nearby regions have decent coverage
      const suggestedAlternatives = []
      for (const nr of nearbyRegions.slice(0, 8)) {
        const nrAnchor = GEO_ANCHORS[nr.name]
        if (!nrAnchor) continue
        const { count } = await sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .not('lat', 'is', null)
          .gte('lat', nrAnchor.lat - nrAnchor.r)
          .lte('lat', nrAnchor.lat + nrAnchor.r)
          .gte('lng', nrAnchor.lng - nrAnchor.r)
          .lte('lng', nrAnchor.lng + nrAnchor.r)
        if (count >= 5) {
          suggestedAlternatives.push({ region: nr.name, listing_count: count })
          if (suggestedAlternatives.length >= 3) break
        }
      }

      // Build suggested trail queries
      const suggestedTrails = suggestedAlternatives.map(alt => ({
        query: `${duration.days > 1 ? duration.days + ' day' : 'Day'} trip to ${alt.region}`,
        region: alt.region,
        listing_count: alt.listing_count,
      }))

      // Log thin coverage to candidates queue for acquisition prioritisation
      try {
        await sb.from('listing_candidates').upsert({
          name: `[Coverage gap] ${region || geoBounds?.label}`,
          region: region || geoBounds?.label,
          vertical: effectiveVerticals[0] || null,
          source: 'coverage_gap',
          source_detail: `Trail query "${q}" returned only ${candidates?.length || 0} venues. Region needs more listings.`,
          confidence: 0.1,
          status: 'pending',
        }, { onConflict: 'name,region', ignoreDuplicates: true }).catch(() => {})
      } catch { /* non-blocking */ }

      return NextResponse.json({
        error: 'insufficient_venues',
        message: `We found ${candidates?.length || 0} verified listing${(candidates?.length || 0) !== 1 ? 's' : ''} in ${region || geoBounds?.label || 'this area'} — not quite enough to build a full trail yet. ${suggestedAlternatives.length > 0 ? 'These nearby regions have stronger coverage:' : 'Try a larger city or popular region like Melbourne, Barossa, or Blue Mountains.'}`,
        venue_count: candidates?.length || 0,
        region: region || null,
        region_label: geoBounds?.label || region || null,
        suggested_alternatives: suggestedAlternatives,
        suggested_trails: suggestedTrails,
      }, { status: 200 })
    }

    // Prepare venue data for Claude — more candidates for multi-day trips
    const maxVenues = duration.days > 1 ? 50 : 30
    const venueData = candidates.slice(0, maxVenues).map(v => ({
      id: v.id,
      name: v.name,
      vertical: v.vertical,
      vertical_label: VERTICAL_LABELS[v.vertical] || v.vertical,
      lat: v.lat,
      lng: v.lng,
      region: v.region,
      state: v.state,
      description: v.description ? v.description.slice(0, 200) : null,
      slug: v.slug,
      source_id: v.source_id || null,
      hero_image_url: v.hero_image_url || null,
      is_claimed: v.is_claimed || false,
      is_featured: v.is_featured || false,
      editors_pick: v.editors_pick || false,
    }))

    const candidateIds = new Set(venueData.map(v => v.id))

    // Build the Anthropic API call
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Build accommodation instruction for LLM
    let accommodationInstruction = ''
    if (accommodation === 'sorted') {
      accommodationInstruction = `\nACCOMMODATION: The user has their own accommodation sorted. Do NOT include overnight stays as itinerary stops. Set "overnight" to null for all days. If you see "rest" vertical venues in the candidate list, you may mention them as optional suggestions in notes but do not make them stops.`
    } else if (accommodation === 'daytrip') {
      accommodationInstruction = `\nACCOMMODATION: This is a day trip — no overnight stays needed. Set "overnight" to null.`
    } else if (accommodation === 'need' || duration.days > 1) {
      accommodationInstruction = `\nACCOMMODATION: The user needs accommodation. REQUIRED for multi-day trips:
- Include a "rest" vertical venue as the overnight stop at the END of each day (except the last day if it's a drive-home day)
- The accommodation MUST be in or near that day's geographic cluster — never across the state
- If no "rest" venue exists near a day's stops, note the general area to stay in that day's label
- Accommodation is non-negotiable when nights are specified — every night needs a place to stay`
    }

    // Build transport instruction
    let transportInstruction = ''
    if (transport === 'public') {
      transportInstruction = `\nTRANSPORT: The user is using public transport. Prefer venues in or near town centres. If a venue requires driving, mention this in the note (e.g. "you'll need a taxi for this one"). Keep stops geographically tight.`
    } else if (transport === 'walking') {
      transportInstruction = `\nTRANSPORT: The user is walking or cycling. Only include venues within easy walking/cycling distance of each other. All stops should be very close together geographically. Flag any venue that would require other transport.`
    } else {
      transportInstruction = `\nTRANSPORT: The user is driving. Plan a geographically coherent road trip:
- Day 1 stops should cluster around a logical starting point
- Each subsequent day should progress in a sensible direction — no jumping back and forth across the map
- The overall trail must have a clear arc: start point → journey → end point
- Do not include stops that require significant backtracking
- Sort stops within each day by proximity to minimise drive time between them`
    }

    // Build group instruction
    let groupInstruction = ''
    if (group === 'family') {
      groupInstruction = `\nGROUP: Family with kids. Avoid scheduling three alcohol-focused stops in a row. Weight toward nature, food, cultural experiences, and venues with family-friendly appeal. Mix in breaks and lunch stops.`
    } else if (group === 'friends') {
      groupInstruction = `\nGROUP: Group of friends. Weight toward social, shared experiences — tastings, markets, lively venues. Food and drink stops work well.`
    } else if (group === 'couple') {
      groupInstruction = `\nGROUP: Couple. Use preferences as the primary signal. No special constraints.`
    }

    // Build pace instruction
    const paceInstruction = pace === 'packed'
      ? `\nPACE: Packed schedule — aim for ${stopsPerDay} stops per day. Tight scheduling, minimal downtime.`
      : pace === 'relaxed'
      ? `\nPACE: Relaxed pace — aim for ${stopsPerDay} stops per day. Include breathing room between stops. Suggest a coffee break or long lunch. Keep it unhurried.`
      : `\nPACE: Moderate pace — aim for ${stopsPerDay} stops per day.`

    // Build user preferences section for LLM
    let preferencesPrompt = ''
    if (userInterests) {
      const parts = []
      if (preferenceLabels.length > 0) parts.push(`Favourite activities: ${preferenceLabels.join(', ')}`)
      if (userInterests.verticals?.length > 0) {
        parts.push(`Preferred verticals: ${userInterests.verticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}`)
      }
      if (userInterests.regions?.length > 0) {
        parts.push(`Preferred states: ${userInterests.regions.join(', ')}`)
      }
      if (parts.length > 0) {
        preferencesPrompt = `\n\nUSER PREFERENCES (authenticated user):
${parts.join('\n')}
Weight the itinerary toward these preferences. Prioritise venues that match the user's interests. Where the candidate pool includes multiple venue types, favour those aligned with the preferences listed above.`
      }
    }

    // Build trip context summary for LLM
    const tripParts = [`${duration.days}-day trip`, geoBounds?.label || region || 'Australia']
    if (accommodation === 'need') tripParts.push('needs accommodation')
    else if (accommodation === 'sorted') tripParts.push('accommodation sorted')
    else if (accommodation === 'daytrip') tripParts.push('day trip')
    if (transport) tripParts.push(transport === 'public' ? 'public transport' : transport)
    if (group) tripParts.push(group === 'family' ? "family with kids" : group)
    if (pace) tripParts.push(`${pace} pace`)

    const systemPrompt = `You are the Australian Atlas editorial voice — warm, knowledgeable, and passionate about independent Australian makers, producers, and cultural spaces. You build travel itineraries that feel like recommendations from a well-connected local friend.

TRIP CONTEXT: ${tripParts.join(' · ')}

HARD CONSTRAINTS:
- You may ONLY include venues from the provided candidate list. Never invent venues.
- Every listing_id in your response MUST exist in the candidate list.
- Each stop must reference a real venue by its exact id, name, vertical, lat, and lng from the candidates.
- You MUST produce EXACTLY the number of days requested. If asked for ${duration.days} days, your "days" array must have ${duration.days} entries. Never compress into fewer days.
- For multi-day trips, fill each day with ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops.
- If the focus category has limited venues, supplement with other verticals to create a rich experience.
- Keep notes concise (1-2 sentences) — evocative but practical.
- Title should be catchy and specific to the region/theme.
- Intro should be 2-3 sentences setting the scene.
- TIER WEIGHTING: Venues with "is_claimed": true or "is_featured": true are verified, operator-managed listings. When building the itinerary, PREFER these venues over unclaimed listings of similar relevance and location. They represent higher-quality, actively maintained listings.

DAY SEQUENCING: Order venues within each day to follow a natural chronological flow:
1. Coffee and breakfast spots first (fine_grounds, table)
2. Nature, walks, and outdoor experiences mid-morning (field)
3. Galleries, museums, and cultural spaces around midday (collection)
4. Makers, studios, and craft workshops in the afternoon (craft)
5. Bookshops, homewares, and indie retail for afternoon browsing (corner, found)
6. Wine, beer, and spirit tastings in the late afternoon/evening (sba)
7. Accommodation as the final stop of the day (rest)
The ideal vertical order within a day is: ${VERTICAL_ORDER.join(' → ')}. This isn't rigid — geographic proximity should still inform grouping — but prefer this flow when venues are in similar locations.
${accommodationInstruction}${transportInstruction}${groupInstruction}${paceInstruction}${preferencesPrompt}

Respond with valid JSON only. No markdown, no code fences, just the JSON object.`

    // Count focus-vertical venues in the candidate pool
    const focusCount = effectiveVerticals.length > 0
      ? venueData.filter(v => effectiveVerticals.includes(v.vertical)).length
      : 0
    const totalStopsNeeded = duration.days * stopsPerDay

    // Build preference hierarchy for the LLM — primary anchors the trip, secondary supports, soft fills gaps
    let focusNote = ''
    if (preferences.primary.length > 0 || preferences.secondary.length > 0 || preferences.soft.length > 0) {
      const parts = []

      if (preferences.primary.length > 0) {
        const primaryLabels = preferences.primary.map(v => VERTICAL_LABELS[v] || v).join(', ')
        const primaryCount = venueData.filter(v => preferences.primary.includes(v.vertical)).length
        parts.push(`PRIMARY INTEREST (must anchor every day): ${primaryLabels}
At least 60% of all stops MUST be from the primary vertical(s): ${preferences.primary.join(', ')}. Every day must contain at least one primary-interest stop. This is what the user came for — it dominates the itinerary.${primaryCount < totalStopsNeeded ? `\nNOTE: Only ${primaryCount} primary-interest venues available. Use ALL of them. Fill remaining slots with complementary verticals. Acknowledge in the intro that ${primaryLabels} coverage is still growing in this area.` : ''}`)
      }

      if (preferences.secondary.length > 0) {
        const secondaryLabels = preferences.secondary.map(v => VERTICAL_LABELS[v] || v).join(', ')
        parts.push(`SECONDARY INTERESTS (supporting, 1-2 per day max): ${secondaryLabels}
These complement the primary interest. Include where they fit geographically but never let them outweigh the primary stops.`)
      }

      if (preferences.soft.length > 0) {
        const softLabels = preferences.soft.map(v => VERTICAL_LABELS[v] || v).join(', ')
        parts.push(`SOFT PREFERENCES (low priority, max 1-2 across entire trip): ${softLabels}
Include only where they genuinely fit the route without displacing primary or secondary stops. Even if there are hundreds of venues in this category, it was a casual "if possible" request — it must NOT dominate the itinerary.`)
      }

      focusNote = '\n\nPREFERENCE HIERARCHY:\n' + parts.join('\n\n')
      focusNote += '\n\nCRITICAL: Never let the size of a category\'s dataset influence its share of stops. A soft preference with 200 available venues gets FEWER stops than a primary interest with 10 venues.'
    } else if (effectiveVerticals.length > 0) {
      focusNote = `\nThe user is interested in: ${effectiveVerticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}.
VENUE TYPE PRIORITY: At least 60% of all stops MUST be from these verticals.
Supplementary stops should complement the theme, not dominate it.`
    }

    const userPrompt = `Build a ${duration.days}-day itinerary for this request: "${q}"
${focusNote}
IMPORTANT: You MUST produce exactly ${duration.days} day(s) with ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops each. Do not compress into fewer days.

Here are the candidate venues (JSON array). You MUST only use venues from this list:
${JSON.stringify(venueData, null, 2)}

Return this exact JSON structure:
{
  "title": "string — catchy itinerary title",
  "intro": "string — 2-3 sentence editorial intro. If focus venues are limited, acknowledge this warmly.",
  "days": [
    {
      "day_number": 1,
      "label": "string — e.g. 'Morning in the Barossa'",
      "stops": [
        {
          "listing_id": "number — must match a candidate id",
          "venue_name": "string",
          "vertical": "string",
          "lat": "number",
          "lng": "number",
          "note": "string — 1-2 sentence editorial note"
        }
      ],
      "overnight": null or {
        "listing_id": "number",
        "venue_name": "string",
        "vertical": "rest",
        "lat": "number",
        "lng": "number",
        "note": "string"
      }
    }
  ]
}

Aim for ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops per day. Make it flow geographically. Favour the requested vertical(s) heavily. You MUST have exactly ${duration.days} entries in the "days" array.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse JSON from response (strip any accidental markdown fences)
    let rawText = textBlock.text.trim()
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let itinerary
    try {
      itinerary = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[itinerary] JSON parse error:', parseErr.message, 'Raw:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse itinerary response' }, { status: 500 })
    }

    // Validate & strip: remove any stops whose listing_id doesn't exist in candidates.
    // The LLM is instructed to only use candidate venues, but occasionally hallucinates.
    let strippedCount = 0
    const enrichedDays = (itinerary.days || []).map(day => {
      const enrichedStops = (day.stops || []).reduce((acc, stop) => {
        const candidate = venueData.find(v => String(v.id) === String(stop.listing_id))
        if (!candidate) {
          console.warn(`[itinerary] STRIPPED hallucinated stop: listing_id ${stop.listing_id} ("${stop.venue_name}") not in candidate pool`)
          strippedCount++
          return acc // skip this stop entirely
        }
        acc.push({
          ...stop,
          slug: candidate.slug || null,
          source_id: candidate.source_id || null,
          hero_image_url: candidate.hero_image_url || null,
          region: candidate.region || null,
        })
        return acc
      }, [])

      let enrichedOvernight = day.overnight
      if (enrichedOvernight?.listing_id) {
        const candidate = venueData.find(v => String(v.id) === String(enrichedOvernight.listing_id))
        if (!candidate) {
          console.warn(`[itinerary] STRIPPED hallucinated overnight: listing_id ${enrichedOvernight.listing_id} ("${enrichedOvernight.venue_name}") not in candidate pool`)
          strippedCount++
          enrichedOvernight = null // remove invalid overnight
        } else {
          enrichedOvernight = {
            ...enrichedOvernight,
            slug: candidate.slug || null,
            source_id: candidate.source_id || null,
            hero_image_url: candidate.hero_image_url || null,
            region: candidate.region || null,
          }
        }
      }

      return { ...day, stops: enrichedStops, overnight: enrichedOvernight }
    })
    // Remove any days that ended up completely empty after stripping
    .filter(day => (day.stops?.length || 0) > 0 || day.overnight)

    if (strippedCount > 0) {
      console.warn(`[itinerary] Stripped ${strippedCount} hallucinated venue(s) from LLM output`)
    }

    // Build recommendations from unused candidates, constrained by geographic proximity
    const usedIds = new Set()
    const usedCoords = []
    for (const day of enrichedDays) {
      for (const stop of (day.stops || [])) {
        if (stop.listing_id) usedIds.add(stop.listing_id)
        if (stop.lat && stop.lng) usedCoords.push({ lat: stop.lat, lng: stop.lng })
      }
      if (day.overnight?.listing_id) {
        usedIds.add(day.overnight.listing_id)
        if (day.overnight.lat && day.overnight.lng) usedCoords.push({ lat: day.overnight.lat, lng: day.overnight.lng })
      }
    }

    // Calculate centroid of itinerary stops for proximity filtering
    let centroidLat = null, centroidLng = null
    if (usedCoords.length > 0) {
      centroidLat = usedCoords.reduce((s, c) => s + c.lat, 0) / usedCoords.length
      centroidLng = usedCoords.reduce((s, c) => s + c.lng, 0) / usedCoords.length
    }

    // Haversine distance in km
    function distKm(lat1, lng1, lat2, lng2) {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const RECOMMENDATION_RADIUS_KM = 50

    // Check if itinerary is missing accommodation for multi-day trips
    const hasOvernight = enrichedDays.some(d => d.overnight?.listing_id)
    const needsAccommodation = duration.days > 1 && !hasOvernight

    // Use preferredVerticals (already computed earlier) for recommendation weighting
    const interestVerticals = preferredVerticals

    const recommendations = venueData
      .filter(v => !usedIds.has(v.id))
      // Filter by geographic proximity to itinerary centroid
      .filter(v => {
        if (!centroidLat || !v.lat || !v.lng) return false
        return distKm(centroidLat, centroidLng, v.lat, v.lng) <= RECOMMENDATION_RADIUS_KM
      })
      .map(v => ({
        id: v.id,
        name: v.name,
        vertical: v.vertical,
        vertical_label: v.vertical_label,
        lat: v.lat,
        lng: v.lng,
        region: v.region,
        slug: v.slug,
        hero_image_url: v.hero_image_url,
        description: v.description,
        distance_km: centroidLat ? Math.round(distKm(centroidLat, centroidLng, v.lat, v.lng)) : null,
        matches_interests: interestVerticals.has(v.vertical),
      }))
      // Sort: accommodation first if needed, then user interests, then by distance
      .sort((a, b) => {
        if (needsAccommodation) {
          if (a.vertical === 'rest' && b.vertical !== 'rest') return -1
          if (b.vertical === 'rest' && a.vertical !== 'rest') return 1
        }
        // Boost user's preferred verticals
        if (a.matches_interests && !b.matches_interests) return -1
        if (b.matches_interests && !a.matches_interests) return 1
        return (a.distance_km || 0) - (b.distance_km || 0)
      })
      .slice(0, 12)

    // Flag thin corpus so frontend can show a note
    const focusVerticalCount = effectiveVerticals.length > 0
      ? venueData.filter(v => effectiveVerticals.includes(v.vertical)).length
      : venueData.length
    const thinCorpus = effectiveVerticals.length > 0 && focusVerticalCount < totalStopsNeeded

    // Collect unique verticals present in the generated itinerary
    const itineraryVerticals = [...new Set(
      enrichedDays.flatMap(d => (d.stops || []).map(s => s.vertical)).filter(Boolean)
    )]

    logTrail(request, {
      promptText: q,
      regionDetected: geoBounds?.label || region || null,
      verticalsIncluded: itineraryVerticals,
      daysGenerated: enrichedDays.length,
    })

    return NextResponse.json({
      title: itinerary.title,
      intro: itinerary.intro,
      days: enrichedDays,
      recommendations,
      needs_accommodation: needsAccommodation && accommodation !== 'sorted',
      thin_corpus: thinCorpus,
      parsed_preferences: {
        primary: preferences.primary.map(v => VERTICAL_LABELS[v] || v),
        secondary: preferences.secondary.map(v => VERTICAL_LABELS[v] || v),
        soft: preferences.soft.map(v => VERTICAL_LABELS[v] || v),
      },
      focus_verticals: effectiveVerticals.length > 0 ? effectiveVerticals.map(v => VERTICAL_LABELS[v] || v) : null,
      focus_venue_count: focusVerticalCount,
      personalised: interestVerticals.size > 0,
      preference_labels: preferenceLabels.length > 0 ? preferenceLabels : null,
      authenticated: isAuthenticated,
      query: q,
      region: region || null,
      region_label: geoBounds?.label || region || null,
      city_note: city_note || null,
      duration,
      venue_count: venueData.length,
      stripped_count: strippedCount,
      // Echo question flow params for frontend display
      flow: (accommodation || transport || group || pace) ? {
        accommodation: accommodation || null,
        transport: transport || null,
        group: group || null,
        pace: pace || null,
      } : null,
    })
  } catch (err) {
    console.error('[itinerary] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
