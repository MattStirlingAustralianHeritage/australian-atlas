-- Search recall for the new 'nursery' Corner category.
--
-- Adds a (vertical='corner', sub_type='nursery') row to listing_category_synonyms
-- (created in migration 165). search_listings_hybrid folds these terms into the
-- lexical full-text document for every nursery listing, so related-term queries
-- ("garden centre", "plant nursery", "native plants", "tube stock", "seedlings")
-- surface independent nurseries even when the listing text doesn't contain the
-- exact phrase. Grower/garden-centre focused terms — kept adjacent to but distinct
-- from the general 'plants' shop category (plant boutiques, florists, garden goods).
--
-- Corner has NO category CHECK constraint (corner_meta.shop_type is free-text), so
-- unlike the Table/Craft category launches this migration is the ONLY DB change
-- needed for the nursery vocab — there is no constraint to widen.
-- Search-only, never rendered publicly. Idempotent — re-applying just retunes terms.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('corner', 'nursery', 'nursery nurseries plant nursery garden nursery garden centre garden center garden shop plant shop plant grower plantsman plantswoman propagation propagation nursery wholesale nursery retail nursery production nursery native plant nursery native nursery bush tucker nursery rare plants exotic plants seedlings tube stock tubestock potted plants pots seed raising greenhouse glasshouse shadehouse horticulture horticultural nurseryman natives indigenous plants edibles fruit trees citrus trees ornamental trees advanced trees perennials annuals succulents cacti bonsai orchids ferns herbs vegetable seedlings garden supplies potting mix mulch soil landscaping plants')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- No schema change; search_listings_hybrid reads the table at query time. Reload
-- the PostgREST cache anyway for consistency with the category-vocab migrations.
notify pgrst, 'reload schema';
