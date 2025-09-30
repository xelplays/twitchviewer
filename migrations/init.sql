BEGIN;
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,        -- lowercase
  display_name TEXT,
  points INTEGER DEFAULT 0,
  view_seconds INTEGER DEFAULT 0,
  last_message_ts INTEGER DEFAULT 0,
  last_seen_ts INTEGER DEFAULT 0,
  chat_points_last_hour INTEGER DEFAULT 0,
  chat_points_hour_reset_ts INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS winners (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,        -- "YYYY-MM"
  rank INTEGER NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  points INTEGER,
  awarded_at INTEGER
);

CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitter TEXT NOT NULL,        -- username (lowercase)
  display_name TEXT,
  clip_url TEXT NOT NULL,
  clip_id TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  reviewer TEXT,
  points_awarded INTEGER DEFAULT 0,
  submitted_at INTEGER,
  reviewed_at INTEGER,
  note TEXT
);
COMMIT;
