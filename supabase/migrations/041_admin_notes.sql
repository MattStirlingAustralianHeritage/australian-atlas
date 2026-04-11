-- Admin notes / bug report tracker
CREATE TABLE IF NOT EXISTS admin_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note       text        NOT NULL,
  url        text,
  severity   text        NOT NULL DEFAULT 'bug'
    CHECK (severity IN ('bug', 'cosmetic', 'suggestion')),
  status     text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup for active notes
CREATE INDEX idx_admin_notes_active
  ON admin_notes (status)
  WHERE status != 'done';
