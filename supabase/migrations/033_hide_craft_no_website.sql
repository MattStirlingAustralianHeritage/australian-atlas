-- Hide Craft Atlas listings without a website URL
-- These listings remain in the database and can be reinstated when a URL is added
-- Audit: SELECT count(*) FROM listings WHERE vertical = 'craft' AND status = 'active' AND (website IS NULL OR trim(website) = '');

UPDATE listings
SET status = 'inactive',
    hidden_reason = 'no_website',
    updated_at = now()
WHERE vertical = 'craft'
  AND status = 'active'
  AND (website IS NULL OR trim(website) = '');
