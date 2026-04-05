-- Field Atlas listing candidates: Great Ocean Road / Otways corridor
-- Source: map_coverage_audit — manual editorial sweep of the GOR region
-- Note: source column has no CHECK constraint (ai_prospector already used by daily cron)

INSERT INTO listing_candidates (name, region, vertical, confidence, source, source_detail, status, notes)
VALUES
  -- Swimming holes / waterfalls
  ('Hopetoun Falls',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Striking 30-metre waterfall plunging into a ferny amphitheatre in the Otway Ranges, one of the most photographed falls in Victoria.'),

  ('Beauchamp Falls',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Remote tiered waterfall reached via a steep rainforest trail in the Otways, rewarding hikers with a secluded old-growth setting.'),

  ('Triplet Falls',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Three-tiered cascade accessed by a well-graded loop walk through towering mountain ash and myrtle beech forest.'),

  ('Erskine Falls',
   'Lorne, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Lorne''s signature 30-metre waterfall set in lush fern gully, accessible via a stepped path from the road above.'),

  ('Phantom Falls',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Seasonal waterfall hidden deep in the Otway forest, best seen after heavy rainfall when the ephemeral flow is at full force.'),

  ('Sabine Falls',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Slender waterfall dropping through dense Otway rainforest, reached by an unmarked track favoured by local bushwalkers.'),

  ('Sheoak Falls',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Easy-access waterfall just off the Great Ocean Road near Lorne, popular as a short family-friendly walk.'),

  -- Lookouts
  ('Teddy''s Lookout',
   'Lorne, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Elevated platform above Lorne offering sweeping views across the St George River valley and the Great Ocean Road coastline.'),

  ('Mariners Lookout',
   'Apollo Bay, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Short uphill walk above Apollo Bay with panoramic views over the harbour, township, and the Otway hinterland.'),

  ('Castle Cove Lookout',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Dramatic clifftop vantage point between Apollo Bay and the Twelve Apostles with views of layered rock formations and surging ocean.'),

  -- Coastal walks
  ('Great Ocean Walk',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Iconic 104-kilometre multi-day trail from Apollo Bay to the Twelve Apostles traversing wild beaches, cliff edges, and coastal eucalypt forest.'),

  ('Surf Coast Walk',
   'Surf Coast, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Scenic 44-kilometre coastal trail linking Torquay to Aireys Inlet along sandstone cliffs, surf beaches, and heathland.'),

  ('Point Addis Walk',
   'Surf Coast, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Clifftop loop walk through the Ironbark Basin with sweeping views of the Surf Coast and seasonal wildflower displays.'),

  ('Wreck Beach Walk',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Coastal trail descending to a remote beach near Moonlight Head, passing anchors from 19th-century shipwrecks along the way.'),

  -- Gorges
  ('Loch Ard Gorge',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Narrow inlet framed by sheer limestone cliffs near the Twelve Apostles, named after the 1878 clipper ship wreck that claimed 52 lives.'),

  ('Broken River Gorge',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Quiet river gorge in the eastern Otways offering a rugged bushwalk through wet sclerophyll forest and moss-covered boulders.'),

  -- National park features
  ('Maits Rest Rainforest Walk',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Short boardwalk loop through ancient cool-temperate rainforest featuring myrtle beech trees estimated at over 300 years old.'),

  ('Otway Fly Treetop Walk',
   'Otways, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Elevated steel walkway 25 metres above the rainforest canopy with a 47-metre spiral tower offering views across the Otway Ranges.'),

  ('Cape Otway Lightstation',
   'Cape Otway, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Australia''s oldest surviving mainland lighthouse, built in 1848 on a dramatic headland where the Southern Ocean meets Bass Strait.'),

  ('Kennett River Koala Walk',
   'Great Ocean Road, VIC', 'field', 0.75, 'map_coverage_audit', 'GOR/Otways corridor audit',
   'pending', 'Gentle forest walk along Grey River Road renowned for reliable wild koala sightings in the manna gum canopy overhead.')

ON CONFLICT (lower(trim(name)), vertical) DO NOTHING;
