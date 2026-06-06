-- Migration 150: search_health view — the instrument that makes a silent 0%
-- impossible to repeat. Per-vertical embedding coverage + a synthetic 'ALL' row
-- carrying overall coverage and the last-7-day event rates from search_events.

create or replace view search_health as
  select
    c.vertical,
    c.total_active,
    c.embedded,
    round(100.0 * c.embedded / nullif(c.total_active, 0), 1) as coverage_pct,
    c.needs_embedding,
    null::bigint as events_7d,
    null::bigint as zero_results_7d,
    null::bigint as voyage_errors_7d
  from (
    select vertical,
           count(*)                               as total_active,
           count(embedding)                       as embedded,
           count(*) filter (where needs_embedding) as needs_embedding
    from listings
    where status = 'active'
    group by vertical
  ) c
  union all
  select
    'ALL',
    count(*),
    count(embedding),
    round(100.0 * count(embedding) / nullif(count(*), 0), 1),
    count(*) filter (where needs_embedding),
    (select count(*) from search_events where created_at > now() - interval '7 days'),
    (select count(*) from search_events where created_at > now() - interval '7 days' and zero_result),
    (select count(*) from search_events where created_at > now() - interval '7 days' and voyage_error is not null)
  from listings
  where status = 'active'
  order by total_active desc nulls last;
