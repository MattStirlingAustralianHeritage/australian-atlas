-- Search recall for the new 'bottle_shop' Corner category.
--
-- Adds a (vertical='corner', sub_type='bottle_shop') row to listing_category_synonyms
-- (created in migration 165). search_listings_hybrid folds these terms into the
-- lexical full-text document for every bottle-shop listing, so related-term queries
-- ("wine merchant", "bottle-o", "natural wine", "craft beer shop", "cellar") surface
-- independent bottle shops even when the listing text doesn't contain the exact
-- phrase. Retail-focused terms — kept distinct from Table's 'wine_bar' (a venue that
-- pours by the glass) and SBA's 'cellar_door'/'winery' (the producers themselves).
--
-- Corner has NO category CHECK constraint (corner_meta.shop_type is free-text), so
-- unlike the Table/Craft category launches this migration is the ONLY DB change
-- needed for the bottle_shop vocab — there is no constraint to widen.
-- Search-only, never rendered publicly. Idempotent — re-applying just retunes terms.

insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('corner', 'bottle_shop', 'bottle shop bottle shops bottle-o bottleo bottle store wine merchant wine merchants wine shop wine store wine seller wine retailer independent cellar the cellar cellars liquor store liquor shop off licence off-licence packaged liquor takeaway liquor natural wine low intervention wine low-intervention wine minimal intervention wine orange wine skin contact wine biodynamic wine organic wine small producer wine boutique wine fine wine wine club craft beer independent craft beer craft beer shop bottle shop craft beer local beer craft cider natural cider spirits craft spirits whisky whiskey gin rum vermouth sake mead by the bottle cellar door retail wine tasting bottle tasting drops good drops')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

-- No schema change; search_listings_hybrid reads the table at query time. Reload
-- the PostgREST cache anyway for consistency with the category-vocab migrations.
notify pgrst, 'reload schema';
