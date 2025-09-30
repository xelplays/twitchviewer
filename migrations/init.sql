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

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,        -- username (lowercase)
  achievement_type TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  description TEXT,
  points_rewarded INTEGER DEFAULT 0,
  earned_at INTEGER DEFAULT 0,
  UNIQUE(username, achievement_type)
);

CREATE TABLE IF NOT EXISTS lottery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,        -- username (lowercase)
  tickets INTEGER NOT NULL DEFAULT 1,
  entry_date TEXT DEFAULT CURRENT_DATE,
  UNIQUE(username, entry_date)
);

CREATE TABLE IF NOT EXISTS lottery_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_date TEXT DEFAULT CURRENT_DATE,
  winner_username TEXT,
  total_tickets INTEGER,
  prize_pool INTEGER,
  drawn_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at INTEGER DEFAULT 0
);
COMMIT;
