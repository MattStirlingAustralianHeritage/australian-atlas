-- Migration 165: lexical OR-recall + category-synonym auto-enrichment.
--
-- WHY ──────────────────────────────────────────────────────────────────────
-- Multi-word natural-language queries silently returned ZERO results even when
-- obviously-matching venues existed. Root cause: the lexical arm builds its
-- query with websearch_to_tsquery, which is strict AND. "Belgium style
-- chocolates" → 'belgium' & 'style' & 'chocol'. A chocolatier whose description
-- says "Belgian couverture chocolates" matches 'chocol' but NOT 'belgium'
-- ('belgian' and 'belgium' stem differently) and never contains 'style', so the
-- AND query matches nothing. Meanwhile freshly-added venues have no embedding
-- yet (the semantic arm can't fire for them), so the lexical arm is the ONLY arm
-- that can surface new content — and it was failing on every multi-word query.
--
-- This migration has two parts, both pure CREATE (no destructive table DDL on
-- existing tables) so every consumer (/api/search, vibe, similar, plan,
-- itinerary) picks them up with NO code change:
--
--   1. listing_category_synonyms — a tiny data-driven table mapping
--      (vertical, sub_type) → a bag of synonyms / related terms / common search
--      phrasings. Folded into the lexical full-text document, it auto-enriches
--      EVERY venue of a category (old and new) with searchable vocabulary the
--      operator never has to type. A new candidate promoted with a known
--      sub_type is covered the instant it goes live — no per-row enrichment
--      write. sub_type IS NULL rows are vertical-level fallbacks that apply to
--      every listing in the vertical (including unknown/new sub_types).
--
--   2. search_listings_hybrid — the lexical arm now also builds an OR query
--      (top-level & flipped to |) so a venue matching ANY significant term is a
--      candidate, then RANKS by coverage: an all-terms / phrase match earns a
--      large bonus and floats to the top, partial matches rank below by
--      ts_rank. Strict precision is preserved at the top of the list; recall is
--      recovered at the bottom instead of being thrown away. Phrase operators
--      (<->) and negation (!) are preserved — a negated query keeps strict
--      semantics (an OR'd negation would match nearly everything). The semantic
--      arm is UNCHANGED. Signature and return type are byte-identical.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Re-apply migration 162 (162_search_keywords_into_search.sql) to restore the
--   previous search_listings_hybrid. The synonyms table can be left in place
--   (nothing else references it) or dropped: DROP TABLE listing_category_synonyms.
-- ============================================================================

-- ── 1. Category synonym table ────────────────────────────────────────────────
create table if not exists listing_category_synonyms (
  vertical text not null,
  sub_type text,                       -- NULL = vertical-level fallback
  terms    text not null,
  unique (vertical, sub_type)
);

comment on table listing_category_synonyms is
  'Auto-enrichment: (vertical, sub_type) → searchable synonym vocabulary folded into the lexical search document by search_listings_hybrid. sub_type IS NULL = vertical-level fallback. Never rendered publicly; search-only.';

-- Idempotent seed. ON CONFLICT keeps re-runs safe and lets the term bags be
-- tuned by re-applying. Terms are lowercase, space-delimited; include the plain
-- category word(s), synonyms, materials/jargon, and common NL phrasings.
insert into listing_category_synonyms (vertical, sub_type, terms) values
  -- vertical-level fallbacks (apply to every listing in the vertical) ──────────
  ('sba',          null, 'craft beverage drinks producer cellar door tasting room small batch independent'),
  ('table',        null, 'food producer gourmet artisan local produce providore eat'),
  ('craft',        null, 'maker artist studio workshop handmade craft artisan creative'),
  ('fine_grounds', null, 'specialty coffee espresso beans roastery cafe'),
  ('collection',   null, 'museum gallery culture arts heritage exhibition things to do'),
  ('corner',       null, 'independent shop store retail boutique'),
  ('found',        null, 'vintage secondhand antique retro thrift preloved'),
  ('field',        null, 'nature outdoors natural scenery walk hike free things to do'),
  ('rest',         null, 'accommodation stay lodging getaway retreat overnight'),
  ('way',          null, 'tour experience guided trip adventure operator activity'),

  -- sba ────────────────────────────────────────────────────────────────────
  ('sba', 'winery',        'winery wine vineyard cellar door wines vino sparkling red white rose tasting'),
  ('sba', 'brewery',       'brewery beer craft beer ale ipa lager pale ale stout porter sour taproom brewpub brewhouse'),
  ('sba', 'distillery',    'distillery gin whisky whiskey vodka rum spirits liqueur tasting still'),
  ('sba', 'cidery',        'cidery cider apple pear perry orchard'),
  ('sba', 'meadery',       'meadery mead honey wine fermented honey'),
  ('sba', 'non_alcoholic', 'non alcoholic zero proof alcohol free mocktail no and low'),
  ('sba', 'sake_brewery',  'sake brewery rice wine japanese sake'),

  -- table ───────────────────────────────────────────────────────────────────
  ('table', 'restaurant',       'restaurant dining eatery bistro kitchen menu chef degustation'),
  ('table', 'creamery',         'creamery cheese cheesemaker dairy gelato ice cream fromage curd'),
  ('table', 'bakery',           'bakery bread sourdough pastry patisserie baker buns croissant cakes'),
  ('table', 'farm_gate',        'farm gate farm shop produce orchard pick your own roadside stall growers'),
  ('table', 'chocolatier',      'chocolatier chocolate chocolates chocolaterie belgian belgium truffle truffles praline pralines bonbon bonbons ganache couverture cacao cocoa bean to bar single origin confectionery sweets fudge handmade artisan'),
  ('table', 'cafe',             'cafe coffee brunch breakfast lunch espresso'),
  ('table', 'market',           'market farmers market produce market growers market stalls'),
  ('table', 'providore',        'providore deli delicatessen grocer pantry gourmet provisions fine food'),
  ('table', 'artisan_producer', 'artisan producer small batch handmade maker specialty food'),

  -- craft ─────────────────────────────────────────────────────────────────
  ('craft', 'visual_art',         'visual art painting painter artist gallery drawing illustration fine art'),
  ('craft', 'jewellery_metalwork','jewellery jeweller jewelry metalwork silversmith goldsmith rings earrings blacksmith metalsmith'),
  ('craft', 'ceramics_clay',      'ceramics ceramic pottery potter clay porcelain stoneware wheel kiln tableware'),
  ('craft', 'wood_furniture',     'wood furniture woodwork woodworker joinery cabinetmaker timber carpentry bespoke furniture'),
  ('craft', 'printmaking',        'printmaking printmaker print screenprint letterpress lithograph etching linocut risograph'),
  ('craft', 'textile_fibre',      'textile fibre fiber weaving weaver knitting fabric yarn dyeing felt macrame embroidery'),
  ('craft', 'glass',              'glass glassblowing glassblower glassware blown glass stained glass studio glass'),
  ('craft', 'leathermaker',       'leather leatherwork leathermaker leathersmith tannery bags wallets belts saddlery'),
  ('craft', 'shoemaker',          'shoemaker shoemaking cobbler bespoke shoes footwear bootmaker'),

  -- fine_grounds ──────────────────────────────────────────────────────────
  ('fine_grounds', 'roaster', 'roaster coffee roaster specialty coffee beans roastery single origin espresso filter'),
  ('fine_grounds', 'cafe',    'cafe coffee shop espresso brunch breakfast barista latte flat white'),

  -- collection ───────────────────────────────────────────────────────────
  ('collection', 'museum',          'museum exhibition collection artefacts history natural history science'),
  ('collection', 'gallery',         'gallery art gallery exhibition contemporary art paintings sculpture artist run'),
  ('collection', 'heritage_site',   'heritage site historic landmark history conservation national trust'),
  ('collection', 'cultural_centre', 'cultural centre arts centre community indigenous first nations performing arts'),
  ('collection', 'botanical_garden','botanical garden botanic gardens arboretum plants flora glasshouse'),
  ('collection', 'live_music_venue','live music venue band gig stage concert club music'),
  ('collection', 'cinema',          'cinema movie theatre film screen independent cinema arthouse'),
  ('collection', 'comedy_club',     'comedy club stand up comedy live comedy'),
  ('collection', 'archive',         'archive records library historical collection'),
  ('collection', 'sculpture_park',  'sculpture park outdoor sculpture art trail installation'),
  ('collection', 'drive_in',        'drive in cinema outdoor movie'),

  -- corner ────────────────────────────────────────────────────────────────
  ('corner', 'bookshop',   'bookshop bookstore books independent bookseller secondhand books reading'),
  ('corner', 'records',    'records record store vinyl lp music shop turntable'),
  ('corner', 'homewares',  'homewares home decor interiors ceramics kitchenware gifts'),
  ('corner', 'clothing',   'clothing fashion boutique apparel menswear womenswear label'),
  ('corner', 'jewellery',  'jewellery jewelry accessories rings earrings'),
  ('corner', 'toys',       'toys toy shop games children kids'),
  ('corner', 'stationery', 'stationery pens paper cards notebooks'),
  ('corner', 'general',    'shop store general store independent retail'),
  ('corner', 'food_drink', 'food drink grocer deli specialty'),

  -- found ─────────────────────────────────────────────────────────────────
  ('found', 'vintage_clothing', 'vintage clothing retro fashion preloved secondhand thrift recycled'),
  ('found', 'market',           'market flea market trash and treasure car boot stalls'),
  ('found', 'antiques',         'antiques antique dealer collectables vintage estate'),
  ('found', 'vintage_furniture','vintage furniture mid century retro furniture restored'),
  ('found', 'vintage_store',    'vintage store secondhand retro preloved'),
  ('found', 'books_ephemera',   'books ephemera secondhand books prints postcards paper'),
  ('found', 'art_objects',      'art objects curios collectables decorative'),
  ('found', 'op_shop',          'op shop charity shop thrift secondhand'),

  -- field ─────────────────────────────────────────────────────────────────
  ('field', 'lookout',        'lookout viewpoint vista scenic view panorama'),
  ('field', 'waterfall',      'waterfall falls cascade swimming'),
  ('field', 'national_park',  'national park reserve wilderness bushwalking trails'),
  ('field', 'swimming_hole',  'swimming hole swimming spot rock pool waterhole creek'),
  ('field', 'coastal_walk',   'coastal walk clifftop walk beach walk coastal trail'),
  ('field', 'gorge',          'gorge canyon ravine river'),
  ('field', 'cave',           'cave caves caverns limestone'),
  ('field', 'wildlife_zoo',   'wildlife zoo sanctuary animals native animals fauna park'),
  ('field', 'hot_spring',     'hot spring thermal springs natural spa soak'),
  ('field', 'nature_reserve', 'nature reserve conservation park flora fauna'),
  ('field', 'botanic_garden', 'botanic garden gardens plants flora'),
  ('field', 'bush_walk',      'bush walk bushwalking hike trail track'),

  -- rest ──────────────────────────────────────────────────────────────────
  ('rest', 'boutique_hotel',     'boutique hotel design hotel rooms suite luxury stay'),
  ('rest', 'cottage',            'cottage self contained holiday house cabin hideaway'),
  ('rest', 'bnb',                'bed and breakfast b and b guesthouse homestay'),
  ('rest', 'glamping',           'glamping luxury camping safari tent bell tent eco tent'),
  ('rest', 'farm_stay',          'farm stay rural accommodation country stay working farm'),
  ('rest', 'eco_resort',         'eco resort sustainable lodge off grid eco lodge retreat'),
  ('rest', 'guesthouse',         'guesthouse guest house b and b inn rooms'),
  ('rest', 'heritage_hotel',     'heritage hotel historic hotel pub stay character'),
  ('rest', 'heritage_lighthouse','lighthouse keepers cottage heritage stay coastal'),
  ('rest', 'national_park_stay', 'national park accommodation eco cabin wilderness stay'),

  -- way ───────────────────────────────────────────────────────────────────
  ('way', 'sailing_charter',             'sailing charter yacht boat cruise sail skipper'),
  ('way', 'specialist_natural_history',  'natural history wildlife birdwatching nature guide ecology'),
  ('way', 'dive_operator',               'dive scuba diving snorkelling reef underwater'),
  ('way', 'cultural_tour',               'cultural tour indigenous first nations heritage walk guide'),
  ('way', 'river_canoe_tour',            'canoe kayak river paddle tour'),
  ('way', 'sea_kayak_tour',              'sea kayak ocean paddle coastal tour'),
  ('way', 'guided_walk_multiday',        'multi day walk trek hike guided walking tour'),
  ('way', 'guided_walk_day',             'day walk guided walk hike nature walk'),
  ('way', 'horseback_expedition',        'horse riding horseback trail ride expedition'),
  ('way', 'four_wheel_drive_expedition', '4wd four wheel drive off road tour expedition'),
  ('way', 'scenic_flight',               'scenic flight aerial helicopter plane flight'),
  ('way', 'fishing_guide',               'fishing guide angling charter fishing trip')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- ── 2. Lexical OR-recall + category synonyms in search_listings_hybrid ───────
create or replace function search_listings_hybrid(
  query_embedding vector(1024) default null,
  query_text text default null,
  filter_vertical text default null,
  filter_state text default null,
  filter_region text default null,
  match_count int default 24,
  similarity_floor float default 0.48,
  include_way boolean default false,
  lat_min float8 default null,
  lat_max float8 default null,
  lng_min float8 default null,
  lng_max float8 default null,
  exclude_vertical text default null,
  exclude_suburb text default null,
  min_quality int default null,
  require_trail_suitable boolean default false,
  filter_suburb text default null
)
returns table (
  id uuid, name text, slug text, vertical text, sub_type text, description text,
  region text, state text, suburb text, address text, lat float8, lng float8,
  hero_image_url text, source_id text, website text,
  is_claimed boolean, is_featured boolean, editors_pick boolean, quality_score int,
  similarity float, fused_score float
)
language plpgsql stable
as $$
declare
  ql text := lower(btrim(coalesce(query_text, '')));
  -- AND form (precise): every term must match. NULL when the query is empty or
  -- reduces to nothing (all stopwords).
  andtxt text := case when ql = '' then null else nullif(websearch_to_tsquery('english', query_text)::text, '') end;
  ts_and tsquery := case when andtxt is null then null else andtxt::tsquery end;
  -- OR form (recall): flip the top-level conjunctions to disjunctions so a
  -- venue matching ANY significant term is a candidate. Phrase operators
  -- (<->/<N>) are untouched (quoted phrases stay strict). Negation (!) keeps
  -- strict semantics — an OR'd negation would match almost everything.
  ts_or tsquery := case
    when andtxt is null then null
    when position('!' in andtxt) > 0 then andtxt::tsquery
    else replace(andtxt, ' & ', ' | ')::tsquery
  end;
begin
  return query
  with base as (
    select l.id, l.name, l.slug, l.vertical, l.sub_type, l.description,
           l.region, l.state, l.suburb, l.address, l.lat, l.lng,
           l.hero_image_url, l.source_id, l.website,
           l.is_claimed, l.is_featured, l.editors_pick, l.quality_score,
           l.embedding,
           -- Pre-built lexical document: editorial text + operator highlights +
           -- operator keywords + category synonyms (auto-enrichment). Computed
           -- once per row here, reused by every reference in the lexical CTE.
           to_tsvector('english',
             l.name || ' ' || coalesce(l.description,'') || ' ' || coalesce(l.sub_type,'')
             || ' ' || coalesce(operator_highlights_search_text(l.operator_highlights),'')
             || ' ' || coalesce(array_to_string(l.search_keywords, ' '), '')
             || ' ' || coalesce(cat.terms, '')) as doc
    from listings l
    left join lateral (
      select string_agg(cs.terms, ' ') as terms
      from listing_category_synonyms cs
      where cs.vertical = l.vertical
        and (cs.sub_type = l.sub_type or cs.sub_type is null)
    ) cat on true
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state    is null or l.state = filter_state)
      and (filter_region   is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb   is null or l.suburb ilike filter_suburb)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
  ),
  semantic as (
    select b.id,
           row_number() over (order by b.embedding <=> query_embedding) as rnk,
           1 - (b.embedding <=> query_embedding) as sim
    from base b
    where query_embedding is not null
      and b.embedding is not null
      and 1 - (b.embedding <=> query_embedding) > similarity_floor
    order by b.embedding <=> query_embedding
    limit greatest(match_count * 4, 100)
  ),
  lexical as (
    select b.id,
           row_number() over (
             order by
               -- name match boost (exact > prefix/substring)
               (case when lower(b.name) = ql then 2
                     when ql <> '' and lower(b.name) like ql || '%' then 1
                     when ql <> '' and lower(b.name) like '%' || ql || '%' then 1
                     else 0 end)
               -- all-terms / phrase match floats precise hits to the top
               + (case when ts_and is not null and b.doc @@ ts_and then 1.0 else 0 end)
               -- partial coverage: more matched query terms → higher
               + coalesce(ts_rank(b.doc, ts_or), 0) desc
           ) as rnk
    from base b
    where ts_or is not null
      and (
        b.doc @@ ts_or
        or (ql <> '' and lower(b.name) like '%' || ql || '%')
      )
    order by rnk
    limit greatest(match_count * 4, 100)
  ),
  fused as (
    select coalesce(s.id, x.id) as id,
           (coalesce(1.0 / (60 + s.rnk), 0.0) + coalesce(1.0 / (60 + x.rnk), 0.0))::float8 as fused_score,
           s.sim::float8 as similarity
    from semantic s
    full outer join lexical x on x.id = s.id
  )
  select b.id, b.name, b.slug, b.vertical, b.sub_type, b.description,
         b.region, b.state, b.suburb, b.address, b.lat, b.lng,
         b.hero_image_url, b.source_id, b.website,
         b.is_claimed, b.is_featured, b.editors_pick, b.quality_score,
         f.similarity, f.fused_score
  from fused f
  join base b on b.id = f.id
  order by f.fused_score desc, b.name asc
  limit match_count;
end;
$$;

notify pgrst, 'reload schema';
