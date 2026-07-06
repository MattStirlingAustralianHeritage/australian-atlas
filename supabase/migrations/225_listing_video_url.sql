-- 225: operator video embed (paid perk)
--
-- One featured video per listing, from an allowlisted platform: YouTube,
-- TikTok or Instagram. The column stores the canonical WATCH url, normalised
-- by lib/video-embed.js at save time (PATCH /api/dashboard/listing — the
-- write is paid-gated by the same tier gate as photos/highlights). Render
-- layers re-parse the stored value and build the iframe src from the parsed
-- video id, so this column can never inject an arbitrary embed.
--
-- Master-only: absent from lib/sync/fieldMaps, so inbound vertical syncs never
-- touch it (sync-safe by omission — same contract as hours / highlights).

alter table public.listings add column if not exists video_url text;

comment on column public.listings.video_url is
  'Operator-featured video (paid perk, mig 225): canonical YouTube / TikTok / Instagram watch URL, normalised + allowlist-validated by lib/video-embed.js. Public surfaces re-parse and build the embed src from the video id; never render this string as an iframe src directly.';
