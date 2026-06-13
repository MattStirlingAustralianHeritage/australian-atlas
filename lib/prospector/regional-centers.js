/**
 * Regional search centers for candidate discovery.
 *
 * The prospector originally anchored every Google Places search to the eight
 * STATE_CENTERS (capital cities) with a 200km radius. After months of running,
 * those areas became exhausted — ~90% of everything discovered was already in
 * the DB and got killed at Gate 0 (dedup), so net-new candidates trended to
 * zero and every vertical drained to an empty queue.
 *
 * This module adds real regional hubs across each state, well beyond the
 * capital-city radius, so discovery reaches fresh geography with venues that
 * have never been prospected. Combined with day-rotation (see pickCenters),
 * each run probes a different slice of regional Australia.
 *
 * Every entry is a real, well-known Australian town/city. Coordinates are the
 * town centre — Google Places Text Search ranks by relevance + distance from
 * this point, so they bias results toward genuine regional operators.
 */

export const REGIONAL_CENTERS = {
  VIC: [
    { name: 'Bendigo', lat: -36.7570, lng: 144.2794 },
    { name: 'Ballarat', lat: -37.5622, lng: 143.8503 },
    { name: 'Geelong', lat: -38.1499, lng: 144.3617 },
    { name: 'Bright', lat: -36.7290, lng: 146.9580 },
    { name: 'Mildura', lat: -34.1855, lng: 142.1625 },
    { name: 'Warrnambool', lat: -38.3818, lng: 142.4885 },
    { name: 'Shepparton', lat: -36.3833, lng: 145.3997 },
    { name: 'Bairnsdale', lat: -37.8266, lng: 147.6100 },
    { name: 'Wangaratta', lat: -36.3590, lng: 146.3140 },
    { name: 'Echuca', lat: -36.1408, lng: 144.7515 },
  ],
  NSW: [
    { name: 'Newcastle', lat: -32.9283, lng: 151.7817 },
    { name: 'Wollongong', lat: -34.4248, lng: 150.8931 },
    { name: 'Orange', lat: -33.2839, lng: 149.1009 },
    { name: 'Wagga Wagga', lat: -35.1082, lng: 147.3598 },
    { name: 'Byron Bay', lat: -28.6434, lng: 153.6122 },
    { name: 'Coffs Harbour', lat: -30.2963, lng: 153.1135 },
    { name: 'Dubbo', lat: -32.2569, lng: 148.6011 },
    { name: 'Albury', lat: -36.0737, lng: 146.9135 },
    { name: 'Port Macquarie', lat: -31.4333, lng: 152.9089 },
    { name: 'Bathurst', lat: -33.4193, lng: 149.5775 },
    { name: 'Mudgee', lat: -32.5944, lng: 149.5876 },
    { name: 'Tamworth', lat: -31.0927, lng: 150.9320 },
  ],
  QLD: [
    { name: 'Cairns', lat: -16.9203, lng: 145.7710 },
    { name: 'Townsville', lat: -19.2590, lng: 146.8169 },
    { name: 'Toowoomba', lat: -27.5598, lng: 151.9507 },
    { name: 'Noosa Heads', lat: -26.3980, lng: 153.0907 },
    { name: 'Gold Coast', lat: -28.0167, lng: 153.4000 },
    { name: 'Mackay', lat: -21.1411, lng: 149.1860 },
    { name: 'Rockhampton', lat: -23.3786, lng: 150.5100 },
    { name: 'Bundaberg', lat: -24.8662, lng: 152.3489 },
    { name: 'Hervey Bay', lat: -25.2882, lng: 152.8745 },
    { name: 'Airlie Beach', lat: -20.2680, lng: 148.7180 },
  ],
  SA: [
    { name: 'Mount Gambier', lat: -37.8284, lng: 140.7807 },
    { name: 'Port Lincoln', lat: -34.7263, lng: 135.8606 },
    { name: 'Tanunda', lat: -34.5230, lng: 138.9590 },
    { name: 'Clare', lat: -33.8336, lng: 138.6110 },
    { name: 'Victor Harbor', lat: -35.5520, lng: 138.6220 },
    { name: 'Renmark', lat: -34.1745, lng: 140.7480 },
    { name: 'Port Augusta', lat: -32.4930, lng: 137.7700 },
  ],
  WA: [
    { name: 'Margaret River', lat: -33.9550, lng: 115.0750 },
    { name: 'Albany', lat: -35.0269, lng: 117.8837 },
    { name: 'Broome', lat: -17.9614, lng: 122.2359 },
    { name: 'Geraldton', lat: -28.7774, lng: 114.6150 },
    { name: 'Kalgoorlie', lat: -30.7490, lng: 121.4660 },
    { name: 'Bunbury', lat: -33.3271, lng: 115.6414 },
    { name: 'Esperance', lat: -33.8614, lng: 121.8910 },
    { name: 'Busselton', lat: -33.6555, lng: 115.3490 },
  ],
  TAS: [
    { name: 'Launceston', lat: -41.4391, lng: 147.1358 },
    { name: 'Devonport', lat: -41.1773, lng: 146.3510 },
    { name: 'Burnie', lat: -41.0558, lng: 145.9066 },
    { name: 'Strahan', lat: -42.1535, lng: 145.3290 },
    { name: 'Bicheno', lat: -41.8770, lng: 148.3030 },
    { name: 'Huonville', lat: -43.0290, lng: 147.0490 },
  ],
  NT: [
    { name: 'Alice Springs', lat: -23.6980, lng: 133.8807 },
    { name: 'Katherine', lat: -14.4650, lng: 132.2635 },
    { name: 'Tennant Creek', lat: -19.6480, lng: 134.1890 },
  ],
  // ACT is small enough that the Canberra capital centre covers it; no
  // separate regional hubs are needed.
  ACT: [],
}

/**
 * Pick a rotating slice of regional centers for a state.
 *
 * Rotation makes each daily run probe a different part of the state, so over
 * a week the whole regional footprint gets covered without searching every
 * center every run (which would blow the serverless time/cost budget).
 *
 * @param {string} state - State code (e.g. 'VIC')
 * @param {number} count - How many centers to return
 * @param {number} seed  - Rotation offset (e.g. day-of-year)
 * @returns {{name:string, lat:number, lng:number}[]}
 */
export function pickCenters(state, count, seed = 0) {
  const all = REGIONAL_CENTERS[state] || []
  if (all.length === 0 || count <= 0) return []
  if (count >= all.length) return all
  const start = ((seed % all.length) + all.length) % all.length
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(all[(start + i) % all.length])
  }
  return out
}

/**
 * Day-of-year — a stable rotation seed that advances once per day.
 * @param {Date} [now]
 */
export function dayOfYear(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0)
  const diff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start
  return Math.floor(diff / 86400000)
}
