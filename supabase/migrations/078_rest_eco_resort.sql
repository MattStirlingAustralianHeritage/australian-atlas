-- Add eco_resort to rest_meta accommodation_type CHECK constraint
alter table rest_meta
  drop constraint if exists rest_meta_accommodation_type_check;

alter table rest_meta
  add constraint rest_meta_accommodation_type_check
  check (accommodation_type in (
    'boutique_hotel','farm_stay','glamping',
    'self_contained','bnb','guesthouse','cottage','eco_resort'
  ));
