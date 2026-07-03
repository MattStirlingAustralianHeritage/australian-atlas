-- 217_editorial_translations.sql
-- Korean launch (feat/ko-launch): per-locale translations for editorial content
-- (journal articles + region editorial).
--
-- ADDITIVE ONLY. Creates two new tables. Does NOT alter `articles` or `regions`.
-- In particular this NEVER writes to articles.body — the translated article body
-- lives in article_translations.body, a separate table (respects the CLAUDE.md
-- Article Body Protection rule; the base articles.body is untouched).

create table if not exists public.article_translations (
  article_id       uuid not null references public.articles(id) on delete cascade,
  locale           text not null,
  title            text,
  excerpt          text,
  body             text,
  meta_description text,
  source_hash      text,
  model            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (article_id, locale)
);

create table if not exists public.region_translations (
  region_id        uuid not null references public.regions(id) on delete cascade,
  locale           text not null,
  name             text,
  description      text,
  generated_intro  text,
  long_description text,
  source_hash      text,
  model            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (region_id, locale)
);

comment on table public.article_translations is
  'Per-locale translations of journal article title/excerpt/body/meta. Additive; render falls back to articles.* when a field is null. Never writes articles.body. feat/ko-launch.';
comment on table public.region_translations is
  'Per-locale translations of region editorial (name/description/generated_intro/long_description). Additive; render falls back to regions.* when a field is null. feat/ko-launch.';

create index if not exists article_translations_locale_idx on public.article_translations (locale);
create index if not exists region_translations_locale_idx on public.region_translations (locale);

-- RLS: public content is world-readable; writes are service-role only.
alter table public.article_translations enable row level security;
alter table public.region_translations enable row level security;

drop policy if exists article_translations_public_read on public.article_translations;
create policy article_translations_public_read on public.article_translations for select using (true);

drop policy if exists region_translations_public_read on public.region_translations;
create policy region_translations_public_read on public.region_translations for select using (true);

notify pgrst, 'reload schema';
