-- ============================================================
-- Migration 072: Article Body Protection
-- Prevents any automated process from overwriting published
-- article body content. Adds body_locked flag and audit trail.
-- ============================================================

-- body_locked: once an article is published and its body is set,
-- this flag prevents any programmatic update to the body field.
-- Only manual admin updates via the CMS should modify body content.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS body_locked boolean NOT NULL DEFAULT false;

-- Track who/what last modified the body
ALTER TABLE articles ADD COLUMN IF NOT EXISTS body_updated_at timestamptz;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS body_updated_by text; -- 'admin', 'cms_sync', etc.

-- Set body_locked = true for all currently published articles with body content
UPDATE articles SET body_locked = true WHERE status = 'published' AND body IS NOT NULL;

-- Create a trigger function that prevents body updates when body_locked = true
-- Exception: when the update explicitly sets body_locked = false first (admin unlock)
CREATE OR REPLACE FUNCTION protect_article_body()
RETURNS TRIGGER AS $$
BEGIN
  -- If body_locked is true and body is being changed, block the update
  -- UNLESS the update is also explicitly unlocking (setting body_locked = false)
  IF OLD.body_locked = true
    AND NEW.body IS DISTINCT FROM OLD.body
    AND NEW.body_locked = true
  THEN
    RAISE EXCEPTION 'Article body is locked. Set body_locked = false to unlock before updating body.';
  END IF;

  -- Auto-lock body when publishing
  IF NEW.status = 'published' AND NEW.body IS NOT NULL THEN
    NEW.body_locked := true;
  END IF;

  -- Track body modification timestamp
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.body_updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger
DROP TRIGGER IF EXISTS trigger_protect_article_body ON articles;
CREATE TRIGGER trigger_protect_article_body
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION protect_article_body();

-- Index for quick lookup of locked articles
CREATE INDEX IF NOT EXISTS idx_articles_body_locked ON articles (body_locked) WHERE body_locked = true;

-- Comments
COMMENT ON COLUMN articles.body_locked IS 'When true, no programmatic update to the body field is permitted. Set to true automatically on publish.';
COMMENT ON COLUMN articles.body_updated_at IS 'Timestamp of the last body content modification';
COMMENT ON COLUMN articles.body_updated_by IS 'Source of last body update: admin, cms_sync, etc.';
COMMENT ON FUNCTION protect_article_body IS 'Prevents body overwrites on locked articles. Admin must set body_locked=false first.';
