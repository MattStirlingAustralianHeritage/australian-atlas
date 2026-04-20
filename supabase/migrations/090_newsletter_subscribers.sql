-- Newsletter subscribers
create table if not exists newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  source text default 'website',
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz,
  resubscribed_at timestamptz
);

create index if not exists idx_newsletter_email on newsletter_subscribers (email);
create index if not exists idx_newsletter_status on newsletter_subscribers (status);
