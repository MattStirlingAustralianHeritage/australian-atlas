-- ============================================================
-- 121_cinema_chain_domains.sql
--
-- Populates the domains[] array on the cinema-scoped
-- commercial_groups rows so the candidate-seed chain filter
-- can match by website host (the only signal that reliably
-- catches arbitrary chain venues like "Dendy Newtown" or
-- "Hoyts Highpoint" — venue names follow no fixed pattern,
-- but the chain centralises on one domain).
--
-- Purely additive: only sets domains[] on rows where it is
-- currently empty. brands[] and all other columns untouched.
--
-- Source: editorial decision 2026-05-05.
-- ============================================================

update commercial_groups set domains = array['hoyts.com.au']                              where group_name = 'Hoyts Australia';
update commercial_groups set domains = array['villagecinemas.com.au']                     where group_name = 'Village Cinemas';
update commercial_groups set domains = array['dendy.com.au']                              where group_name = 'Dendy Cinemas';
update commercial_groups set domains = array['palacecinemas.com.au']                      where group_name = 'Palace Cinemas';
update commercial_groups set domains = array['readingcinemas.com.au']                     where group_name = 'Reading Cinemas';
update commercial_groups set domains = array['eventcinemas.com.au','greaterunion.com.au'] where group_name = 'EVT';
