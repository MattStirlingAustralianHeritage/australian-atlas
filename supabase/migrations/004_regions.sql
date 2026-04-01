-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 004: Regions table + seed data
-- ============================================================

create table regions (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  slug                  text not null unique,
  state                 text check (state in ('VIC','NSW','QLD','SA','WA','TAS','ACT','NT')),
  description           text,
  geojson               jsonb,
  hero_image_url        text,
  min_listing_threshold int default 15,
  status                text default 'draft' check (status in ('draft','live')),
  reviewed              boolean default false,
  generated_intro       text,
  generated_itinerary   jsonb,
  generated_at          timestamptz,
  listing_count         int default 0,
  article_count         int default 0,
  featured_article_id   uuid,  -- FK added after articles table exists
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create trigger regions_updated_at
  before update on regions
  for each row execute function update_updated_at();

-- Seed initial regions
insert into regions (name, slug, state, description) values
  ('Mornington Peninsula', 'mornington-peninsula', 'VIC',
   'A stunning coastal region south of Melbourne, renowned for its wineries, breweries, hot springs, and artisan food scene.'),
  ('Barossa Valley', 'barossa-valley', 'SA',
   'Australia''s most celebrated wine region, home to world-class Shiraz and a thriving artisan food culture rooted in German heritage.'),
  ('Yarra Valley', 'yarra-valley', 'VIC',
   'Rolling green hills east of Melbourne with over 80 wineries, craft breweries, and a growing farm-gate food trail.'),
  ('Byron Hinterland', 'byron-hinterland', 'NSW',
   'A lush subtropical hinterland behind Byron Bay, home to artisan makers, boutique accommodation, and independent cafés.'),
  ('Blue Mountains', 'blue-mountains', 'NSW',
   'A UNESCO World Heritage wilderness west of Sydney, with historic villages, galleries, bookshops, and natural swimming holes.'),
  ('Adelaide Hills', 'adelaide-hills', 'SA',
   'Cool-climate wine country in the Mt Lofty Ranges, with craft breweries, cideries, and a strong independent retail scene.'),
  ('Margaret River', 'margaret-river', 'WA',
   'Western Australia''s premier wine and surf region, with world-class wineries, craft breweries, and artisan chocolate makers.'),
  ('Hunter Valley', 'hunter-valley', 'NSW',
   'Australia''s oldest wine region, two hours north of Sydney, with Semillon and Shiraz producers alongside boutique accommodation.'),
  ('Daylesford & Hepburn Springs', 'daylesford', 'VIC',
   'Victoria''s spa country, known for mineral springs, independent bookshops, galleries, and a vibrant food scene.'),
  ('Hobart & Southern Tasmania', 'hobart', 'TAS',
   'Tasmania''s creative capital, home to MONA, a thriving craft scene, specialty coffee, and some of Australia''s best farm-to-table dining.'),
  ('Grampians', 'grampians', 'VIC',
   'A dramatic sandstone mountain range in western Victoria, with national parks, Aboriginal rock art, and a growing wine and food trail.'),
  ('Flinders Ranges', 'flinders-ranges', 'SA',
   'Ancient landscapes north of Adelaide, with gorges, geological formations, and remote outback accommodation.'),
  ('Noosa Hinterland', 'noosa-hinterland', 'QLD',
   'A subtropical hinterland behind Noosa, with boutique breweries, farm gates, and artisan food producers.'),
  ('Sunshine Coast Hinterland', 'sunshine-coast-hinterland', 'QLD',
   'Green mountains behind the Sunshine Coast, home to craft breweries, galleries, and independent retail villages like Maleny and Montville.'),
  ('Kangaroo Island', 'kangaroo-island', 'SA',
   'South Australia''s wildlife haven, with artisan producers, farm gates, boutique accommodation, and dramatic coastal landscapes.'),
  ('Bruny Island', 'bruny-island', 'TAS',
   'A rugged island south of Hobart, known for oyster farms, artisan cheese, whisky distilleries, and extraordinary natural landscapes.'),
  ('Tamar Valley', 'tamar-valley', 'TAS',
   'Northern Tasmania''s wine corridor, stretching from Launceston to the coast with cool-climate wineries and farm-gate producers.'),
  ('Central Victoria', 'central-victoria', 'VIC',
   'The goldfields region around Bendigo, Castlemaine, and Ballarat — rich in heritage architecture, galleries, and craft makers.'),
  ('Great Ocean Road', 'great-ocean-road', 'VIC',
   'One of the world''s great coastal drives, from Torquay to the Twelve Apostles, with breweries, cafés, and boutique stays along the way.'),
  -- Additional high-density regions
  ('McLaren Vale', 'mclaren-vale', 'SA',
   'A premium wine region south of Adelaide, with Shiraz and Grenache producers, cellar doors, and a strong artisan food scene.'),
  ('Bellarine Peninsula', 'bellarine-peninsula', 'VIC',
   'A coastal region west of Melbourne, with wineries, breweries, farm gates, and the historic port town of Queenscliff.'),
  ('Southern Highlands', 'southern-highlands', 'NSW',
   'A cool-climate escarpment south of Sydney, with bookshops, galleries, antique stores, and boutique accommodation.'),
  ('Shoalhaven', 'shoalhaven', 'NSW',
   'South coast NSW, home to oyster farms, craft breweries, and natural swimming spots from Kiama to Jervis Bay.'),
  ('Gold Coast Hinterland', 'gold-coast-hinterland', 'QLD',
   'Rainforest-covered mountains behind the Gold Coast, with artisan distilleries, farm gates, and boutique stays.'),
  ('Macedon Ranges', 'macedon-ranges', 'VIC',
   'Cool-climate wine country north of Melbourne, with heritage villages, independent retail, and a growing food scene.'),
  ('Clare Valley', 'clare-valley', 'SA',
   'A boutique wine region north of Adelaide, famous for Riesling and dotted with heritage stone buildings.'),
  ('Cradle Country', 'cradle-country', 'TAS',
   'Tasmania''s wild north-west, centred on Cradle Mountain, with wilderness lodges, craft distilleries, and farm stays.'),
  ('Fremantle & Swan Valley', 'fremantle-swan-valley', 'WA',
   'Perth''s creative port city and its neighbouring wine valley — a hotbed of craft breweries, vintage shops, and independent coffee.'),
  ('Canberra District', 'canberra-district', 'ACT',
   'The national capital''s wine and food region, with cool-climate wineries, galleries, and a thriving specialty coffee scene.'),
  ('Northern Rivers', 'northern-rivers', 'NSW',
   'A creative subtropical region from Lismore to Brunswick Heads, with artisan makers, vintage shops, and farm-gate food.');
