-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 003: Vertical extension tables
-- ============================================================

-- SBA: breweries, wineries, distilleries, cideries
create table sba_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  producer_type       text check (producer_type in (
                        'brewery','winery','distillery','cidery','meadery',
                        'cellar_door','sour_brewery','non_alcoholic'
                      )),
  subtype             text,
  has_tasting_room    boolean default false,
  has_cellar_door     boolean default false,
  has_tours           boolean default false,
  has_online_store    boolean default false,
  has_restaurant      boolean default false,
  has_accommodation   boolean default false,
  features            text[],
  listing_tier        text,
  google_rating       numeric(2,1),
  google_rating_count integer,
  producer_picks      jsonb
);

-- Collection: museums, galleries, heritage sites
create table collection_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  institution_type    text check (institution_type in (
                        'museum','gallery','heritage_site','botanical_garden','cultural_centre'
                      )),
  subtype             text,
  is_free_admission   boolean default false,
  admission_price     text,
  is_accessible       boolean default false,
  current_exhibition  text,
  features            text[],
  listing_tier        text,
  google_rating       numeric(2,1),
  google_rating_count integer
);

-- Craft: makers, artists, studios
create table craft_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  discipline          text check (discipline in (
                        'ceramics_clay','visual_art','jewellery_metalwork',
                        'textile_fibre','wood_furniture','glass','printmaking'
                      )),
  subcategories       text[],
  materials           text[],
  practice_description text,
  is_open_to_public   boolean default false,
  by_appointment      boolean default false,
  has_online_store    boolean default false,
  commission_available boolean default false,
  experiences_and_classes boolean default false,
  features            text[],
  listing_tier        text,
  google_rating       numeric(2,1),
  google_rating_count integer
);

-- Fine Grounds: specialty coffee roasters & cafés
create table fine_grounds_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  entity_type         text check (entity_type in ('roaster','cafe')),
  is_roaster          boolean default false,
  is_cafe             boolean default false,
  roaster_master_id   uuid references listings(id),  -- FK to the roaster listing in master DB
  beans_origin        text[],
  brewing_methods     text[],
  roast_style         text,
  food_offering       text check (food_offering in ('none','light','full')),
  has_tasting_room    boolean default false,
  features            text[],
  listing_tier        text,
  google_rating       numeric(2,1),
  google_rating_count integer,
  roaster_picks       jsonb
);

-- Rest: boutique accommodation
create table rest_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  accommodation_type  text check (accommodation_type in (
                        'boutique_hotel','farm_stay','glamping',
                        'self_contained','bnb','guesthouse','cottage'
                      )),
  tagline             text,
  setting             text check (setting in (
                        'coastal','bush','mountain','valley','farmland','desert','urban'
                      )),
  min_price_per_night integer,
  max_price_per_night integer,
  guest_capacity      integer,
  bedrooms            integer,
  bathrooms           integer,
  amenities           text[],
  features            text[],
  listing_tier        text,
  google_rating       numeric(2,1),
  google_rating_count integer,
  host_picks          jsonb
);

-- Field: natural places
create table field_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  feature_type        text check (feature_type in (
                        'swimming_hole','waterfall','lookout','gorge',
                        'coastal_walk','hot_spring','cave','national_park'
                      )),
  is_entry_free       boolean default true,
  entry_fee           text check (entry_fee in ('free','paid','national_parks_pass')),
  dogs_allowed        boolean default false,
  family_friendly     boolean default false,
  swimming            boolean default false,
  difficulty          text check (difficulty in ('easy','moderate','hard')),
  walk_distance_km    numeric(6,2),
  best_seasons        text[],
  best_time_of_day    text,
  park_name           text,
  nearest_town        text,
  what_to_bring       text[],
  know_before_you_go  text
);

-- Corner: independent retail
create table corner_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  shop_type           text check (shop_type in (
                        'bookshop','records','homewares','stationery',
                        'jewellery','toys','general','clothing','food_drink',
                        'plants','art_supplies','other'
                      )),
  categories          text[],
  story               text,
  known_for           text,
  owner_name          text,
  year_established    integer,
  has_online_store    boolean default false,
  parking             text,
  accessibility       text
);

-- Found: secondhand, vintage, antique shops
create table found_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  shop_type           text check (shop_type in (
                        'vintage_clothing','vintage_furniture','antiques',
                        'op_shop','books_ephemera','art_objects','market'
                      )),
  categories          text[],
  story               text,
  known_for           text,
  price_range         text,
  market_schedule     text,
  op_shop_chain       text
);

-- Table: food producers, farm gates, markets
create table table_meta (
  listing_id          uuid primary key references listings(id) on delete cascade,
  food_type           text check (food_type in (
                        'restaurant','bakery','market','farm_gate',
                        'artisan_producer','specialty_retail','destination',
                        'cooking_school','providore','food_trail'
                      )),
  cuisine             text,
  cuisine_tags        text[],
  categories          text[],
  story               text,
  known_for           text,
  owner_name          text,
  year_established    integer,
  is_seasonal         boolean default false,
  seasonal_availability text,
  market_schedule     text,
  pick_your_own       boolean default false,
  cafe_on_site        boolean default false,
  cooking_classes     boolean default false,
  wholesale_available boolean default false,
  delivery_available  boolean default false,
  has_online_store    boolean default false,
  parking             text,
  accessibility       text
);
