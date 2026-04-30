-- ============================================================
-- 108_pitch_system_vertical_noun_mappings.sql
--
-- Recreate vertical_noun_mappings (dropped in 105) and reseed
-- from snapshot at
-- scripts/data/orphaned-pitch-tables-snapshot-2026-04-30/
-- vertical_noun_mappings.json.
--
-- 72 rows across 9 verticals. Used by editorial copy generation
-- to map (vertical, primary_type) to natural-language nouns.
-- Out of scope for the pitch system itself but preserved here so
-- the data is recoverable from the migration history.
-- ============================================================

create table if not exists vertical_noun_mappings (
  id uuid primary key default gen_random_uuid(),
  vertical text not null,
  primary_type text not null,
  singular_noun text not null,
  fallback_noun text not null,
  unique (vertical, primary_type)
);

create index if not exists vertical_noun_mappings_vertical_idx on vertical_noun_mappings (vertical);

-- ─── Seed (72 rows from snapshot 2026-04-30) ──────────────────────────

insert into vertical_noun_mappings (id, vertical, primary_type, singular_noun, fallback_noun) values
  ('70fab0e0-a916-4c10-98e6-077466c78fe0', 'sba', 'brewery', 'brewery', 'producer'),
  ('760b01f4-edfe-41b6-b92c-1fd5fa02e472', 'sba', 'winery', 'winery', 'producer'),
  ('82c4e1d8-97f3-4a12-9080-fed737cf4b28', 'sba', 'distillery', 'distillery', 'producer'),
  ('cf45b5ae-5588-447e-b2da-87fd48bb6be5', 'sba', 'cidery', 'cidery', 'producer'),
  ('c94cd38d-a3c3-4a04-afce-4678c1536c78', 'sba', 'meadery', 'meadery', 'producer'),
  ('0ea80879-0e55-40ea-a09c-77803d87f5d2', 'sba', 'cellar_door', 'cellar door', 'producer'),
  ('8cfbb7b7-3f92-413b-b973-0d855043145d', 'collection', 'gallery', 'gallery', 'cultural venue'),
  ('0782dbff-3646-4619-8484-51c130352f05', 'collection', 'museum', 'museum', 'cultural venue'),
  ('6963ae3f-7d54-4309-8a57-602ff50abbd6', 'collection', 'heritage_site', 'heritage site', 'cultural venue'),
  ('8c621a18-d30f-487a-8faf-00c31ec6c514', 'collection', 'cultural_centre', 'cultural centre', 'cultural venue'),
  ('03028c8f-762e-451b-9986-99c7c363d53c', 'collection', 'artist_run_initiative', 'ARI', 'cultural venue'),
  ('03512796-7217-4c0c-9671-c844cac98640', 'collection', 'sculpture_park', 'sculpture park', 'cultural venue'),
  ('a90f5454-b100-4f82-96a9-871e62c95f89', 'craft', 'ceramicist', 'ceramic studio', 'studio'),
  ('725c3f8c-c2da-44d3-a9ed-1e99ee58bc59', 'craft', 'jeweller', 'jewellery studio', 'studio'),
  ('b0be67d1-ea23-41f3-9d73-3acc434470de', 'craft', 'glassblower', 'glass studio', 'studio'),
  ('e2f37ff7-36e3-4852-b09f-a6d659f1a9e2', 'craft', 'woodworker', 'workshop', 'studio'),
  ('83a1048b-9739-4cc9-bb7e-3423497aa97b', 'craft', 'textile_artist', 'textile studio', 'studio'),
  ('0af8f951-367d-4672-b29f-dbf3d449ca24', 'craft', 'printmaker', 'print studio', 'studio'),
  ('6dd13f5f-2bcc-489a-ba25-cad134839c73', 'craft', 'blacksmith', 'forge', 'studio'),
  ('1495b14c-23b1-4612-b6dc-f06b8676bdb2', 'craft', 'weaver', 'weaving studio', 'studio'),
  ('b3b5e2f3-727f-4adb-92de-c5b3c63fdc6d', 'craft', 'leatherworker', 'leather workshop', 'studio'),
  ('a5f897c3-8763-43c7-b2c4-f26485873976', 'craft', 'sculptor', 'sculpture studio', 'studio'),
  ('3b62474b-54bc-470a-914a-1236a6370011', 'craft', 'mixed_media', 'studio', 'studio'),
  ('d799a1f5-6def-4545-8596-425ac00c5995', 'craft', 'maker', 'studio', 'studio'),
  ('31b8c6d9-0b1e-48fb-bb83-8129bf5c1af1', 'fine_grounds', 'roaster', 'roaster', 'coffee venue'),
  ('1f467e28-c5ee-427e-b30f-42f5ac5128ef', 'fine_grounds', 'cafe', 'café', 'coffee venue'),
  ('885c5814-6897-467c-84e3-0a65255937e1', 'fine_grounds', 'roaster_cafe', 'roaster-café', 'coffee venue'),
  ('ba5a0ae8-4252-4261-8a9e-4a00556e41bc', 'rest', 'boutique_hotel', 'boutique hotel', 'stay'),
  ('d1040bff-ee7f-43e0-a5c6-025147862d47', 'rest', 'guesthouse', 'guesthouse', 'stay'),
  ('972e0e30-70a9-42ce-aad4-5eaa55ca29e4', 'rest', 'bnb', 'B&B', 'stay'),
  ('38755f9a-eee8-436e-b37c-ef836573b7d7', 'rest', 'farm_stay', 'farm stay', 'stay'),
  ('aa472410-d24a-49f4-8082-3091c22542b8', 'rest', 'glamping', 'glamping site', 'stay'),
  ('a6674123-2238-4b63-94f5-7d3176349783', 'rest', 'cottage', 'cottage', 'stay'),
  ('0e256bf4-19da-4760-aaa4-76b2d519588c', 'rest', 'eco_resort', 'eco-retreat', 'stay'),
  ('37419cc7-2ffb-47fe-a5e9-dc1ca09625cb', 'rest', 'heritage_hotel', 'heritage pub', 'stay'),
  ('f586000a-3567-4d34-9314-e9f993f691c6', 'rest', 'national_park_stay', 'parks accommodation', 'stay'),
  ('9955e611-a8e2-48f7-bdf4-1c7822902f44', 'rest', 'heritage_lighthouse', 'lighthouse stay', 'stay'),
  ('3d8306d1-ceb3-4810-a49b-7f2d7aafcac4', 'field', 'farm_gate', 'farm gate', 'producer'),
  ('8eabeb1e-48a1-4234-b358-55e113bc3989', 'field', 'produce_stand', 'produce stand', 'producer'),
  ('d8fed8b0-be87-4a17-975e-45391108b018', 'field', 'swimming_hole', 'swimming hole', 'natural feature'),
  ('6f754f51-7323-47dd-9079-c44e020669c9', 'field', 'waterfall', 'waterfall', 'natural feature'),
  ('804c3c27-2c2f-4d8f-becc-a38940782adf', 'field', 'lookout', 'lookout', 'natural feature'),
  ('aa42bdf0-e330-44b5-9821-8ffa9a110976', 'field', 'walking_track', 'walking track', 'trail'),
  ('9b0599e0-e4b8-4262-9758-b9687d33bc80', 'field', 'bike_trail', 'bike trail', 'trail'),
  ('a0d420a3-9cc2-40ec-bc7f-845bf430e6ac', 'field', 'gorge', 'gorge', 'natural feature'),
  ('a0ac17e3-8680-4934-8cab-92ce7456e036', 'field', 'beach', 'beach', 'natural feature'),
  ('3f1fcbcd-b37d-4298-9d7f-e562f18af130', 'field', 'nature_reserve', 'reserve', 'natural feature'),
  ('844b098f-c40d-45e4-a0fd-17e8fa19f3ae', 'field', 'wildlife_zoo', 'wildlife sanctuary', 'sanctuary'),
  ('330f96dc-a5b0-4f31-894d-1c59d8f0177d', 'field', 'botanic_garden', 'botanic garden', 'garden'),
  ('3d72b3ab-34a6-471d-9ffc-77d1ade47b93', 'field', 'national_park', 'national park', 'park'),
  ('980065c8-8ed9-40dc-babd-99558c5b8737', 'field', 'cave', 'cave system', 'natural feature'),
  ('aa638d27-a0da-410b-82b7-2712d92b1002', 'field', 'hot_spring', 'hot spring', 'natural feature'),
  ('dcd3939d-315d-4a1a-a7d8-6c41ca4bb33d', 'corner', 'bookshop', 'bookshop', 'shop'),
  ('c5d194bf-ca35-493c-ba88-92424dcbfa0d', 'corner', 'record_store', 'record store', 'shop'),
  ('17ca4efd-d6e7-450b-bda4-6ad64e2e992c', 'corner', 'homewares', 'homewares store', 'shop'),
  ('2a32890b-05c0-4d46-b1a2-29f5874b512c', 'corner', 'design_store', 'design store', 'shop'),
  ('6c733423-e56b-4192-a8bd-a7053807c919', 'corner', 'clothing', 'clothing store', 'shop'),
  ('87f46940-6c6f-4f7a-9c9c-ca4803cb8c0e', 'corner', 'gift_shop', 'shop', 'shop'),
  ('13d85b58-2df0-484d-aaae-9042027861b6', 'corner', 'specialty_retail', 'specialty store', 'shop'),
  ('4cca9c60-944d-4009-b8dc-85ff4f18f239', 'found', 'vintage_store', 'vintage store', 'secondhand store'),
  ('551a8b5f-df69-41a1-982f-8f9719ecb8ca', 'found', 'op_shop', 'op shop', 'secondhand store'),
  ('4a3ab3e9-5f89-413a-b517-d8705fb81fe9', 'found', 'antique_dealer', 'antique dealer', 'secondhand store'),
  ('0075d39c-7ea0-4904-8bb3-5f1770d0dfbd', 'found', 'secondhand_bookshop', 'secondhand bookshop', 'secondhand store'),
  ('b9fffdb0-1bed-485a-bb29-493459a15db6', 'found', 'salvage_yard', 'salvage yard', 'secondhand store'),
  ('bad708cd-17b3-490a-ae9b-1fdbf3e65ac2', 'found', 'weekend_market', 'market', 'market'),
  ('b97a5481-91a3-4047-bc63-f22c5f216c42', 'found', 'flea_market', 'flea market', 'market'),
  ('6115ec43-8047-4cad-8f6c-7a6e1a748164', 'table', 'restaurant', 'restaurant', 'kitchen'),
  ('3a8fe8b3-272f-4a50-9d5e-e78b5d2d9a43', 'table', 'bakery', 'bakery', 'kitchen'),
  ('fa9285f3-c8bf-4032-8c60-e54770c96af5', 'table', 'providore', 'providore', 'kitchen'),
  ('c7adc850-9bea-4b70-be86-d0fa67b645bc', 'table', 'food_producer', 'producer', 'producer'),
  ('f32a08cc-6b00-4c86-a507-ec74de232be1', 'table', 'cooking_school', 'cooking school', 'kitchen'),
  ('8db0afb2-4198-4235-b851-c628b3387abe', 'table', 'cafe', 'café', 'kitchen')
on conflict (vertical, primary_type) do nothing;
