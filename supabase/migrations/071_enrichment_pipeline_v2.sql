-- ============================================================
-- Migration 071: Enrichment Pipeline V2
-- Adds source text storage, confidence scoring, and
-- hallucination risk tracking for AI-generated descriptions.
-- ============================================================

-- Store the scraped source material used to generate each description
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_source_text text;

-- Confidence score (0-100) from grounding verification
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_confidence integer;

-- Hallucination risk flag from automated audit
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_risk_level text;
-- Values: 'low', 'medium', 'high', 'unaudited'

-- Grounding verification result (JSON from the second Claude call)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_grounding_result jsonb;

-- Source quality metrics
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_source_word_count integer;

-- Index for admin review filtering
CREATE INDEX IF NOT EXISTS idx_listings_enrichment_risk
  ON listings (enrichment_risk_level)
  WHERE enrichment_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_enrichment_confidence
  ON listings (enrichment_confidence)
  WHERE enrichment_status IS NOT NULL;

-- Comment
COMMENT ON COLUMN listings.enrichment_source_text IS 'Scraped website text used as source material for AI description generation (truncated to 2000 chars)';
COMMENT ON COLUMN listings.enrichment_confidence IS 'Grounding confidence score 0-100 from automated verification';
COMMENT ON COLUMN listings.enrichment_risk_level IS 'Hallucination risk: low/medium/high/unaudited';
COMMENT ON COLUMN listings.enrichment_grounding_result IS 'JSON result from grounding verification Claude call';
COMMENT ON COLUMN listings.enrichment_source_word_count IS 'Word count of scraped source text before truncation';
