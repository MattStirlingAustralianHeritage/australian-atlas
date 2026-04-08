CREATE TABLE IF NOT EXISTS editorial_pitches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vertical text NOT NULL,
  headline text NOT NULL,
  angle text NOT NULL,
  suggested_venue text,
  suggested_venue_id uuid,
  estimated_read_time text DEFAULT '6 min',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_editorial_pitches_vertical_status ON editorial_pitches(vertical, status);
