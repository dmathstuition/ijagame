-- ============================================================
-- INFANT JESUS SPAK COMPETITION PLATFORM
-- Database Schema v1.0
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE app_role AS ENUM ('super_admin', 'quiz_admin', 'moderator', 'participant', 'display');

CREATE TYPE round_mode AS ENUM (
  'fastest_finger',
  'classic_mcq',
  'personal_cbt',
  'sudden_death',
  'practice',
  'buzzer'
);

CREATE TYPE session_status AS ENUM (
  'draft',
  'lobby',
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE round_status AS ENUM (
  'pending',
  'active',
  'paused',
  'completed'
);

CREATE TYPE question_type AS ENUM (
  'multiple_choice',
  'true_false',
  'short_answer'
);

CREATE TYPE reveal_state AS ENUM (
  'hidden',
  'distribution_only',
  'answer_revealed',
  'leaderboard_revealed'
);

CREATE TYPE submission_status AS ENUM (
  'submitted',
  'invalidated',
  'overridden',
  'late'
);

CREATE TYPE answer_window_state AS ENUM (
  'closed',
  'open',
  'locked'
);

-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'participant',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPETITIONS
-- ============================================================

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  school_year TEXT,
  subject TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  allow_negative_marking BOOLEAN NOT NULL DEFAULT false,
  negative_mark_value NUMERIC(5,2) NOT NULL DEFAULT 0,
  allow_speed_bonus BOOLEAN NOT NULL DEFAULT false,
  speed_bonus_max NUMERIC(5,2) NOT NULL DEFAULT 0,
  team_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  session_code TEXT NOT NULL UNIQUE,
  status session_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES profiles(id),
  current_round_id UUID, -- FK set later
  current_question_index INTEGER NOT NULL DEFAULT 0,
  answer_window_state answer_window_state NOT NULL DEFAULT 'closed',
  reveal_state reveal_state NOT NULL DEFAULT 'hidden',
  privacy_mode BOOLEAN NOT NULL DEFAULT false,
  show_fastest_answer BOOLEAN NOT NULL DEFAULT true,
  show_distribution BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sessions_code ON sessions(session_code);
CREATE INDEX idx_sessions_competition ON sessions(competition_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- ============================================================
-- ROUNDS
-- ============================================================

CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode round_mode NOT NULL DEFAULT 'classic_mcq',
  order_index INTEGER NOT NULL DEFAULT 0,
  status round_status NOT NULL DEFAULT 'pending',
  time_limit_seconds INTEGER NOT NULL DEFAULT 30,
  base_points INTEGER NOT NULL DEFAULT 10,
  allow_negative BOOLEAN NOT NULL DEFAULT false,
  negative_value NUMERIC(5,2) NOT NULL DEFAULT 0,
  allow_speed_bonus BOOLEAN NOT NULL DEFAULT false,
  speed_bonus_max NUMERIC(5,2) NOT NULL DEFAULT 5,
  eliminate_on_wrong BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rounds_session ON rounds(session_id);
CREATE INDEX idx_rounds_order ON rounds(session_id, order_index);

-- ============================================================
-- QUESTIONS
-- ============================================================

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type question_type NOT NULL DEFAULT 'multiple_choice',
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  time_limit_seconds INTEGER, -- overrides round default if set
  base_points INTEGER,        -- overrides round default if set
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_round ON questions(round_id);
CREATE INDEX idx_questions_order ON questions(round_id, order_index);

-- ============================================================
-- QUESTION OPTIONS
-- ============================================================

CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_label TEXT NOT NULL, -- A, B, C, D
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_options_question ON question_options(question_id);

-- ============================================================
-- TEAMS (optional)
-- ============================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#1E3A5F',
  total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, team_name)
);

-- ============================================================
-- PARTICIPANTS
-- ============================================================

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES profiles(id), -- null for anonymous join
  join_code TEXT NOT NULL,
  is_eliminated BOOLEAN NOT NULL DEFAULT false,
  is_online BOOLEAN NOT NULL DEFAULT false,
  total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms NUMERIC(10,2),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, display_name)
);

CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_participants_score ON participants(session_id, total_score DESC);
CREATE INDEX idx_participants_team ON participants(team_id);

-- ============================================================
-- ANSWERS
-- ============================================================

CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id),
  round_id UUID NOT NULL REFERENCES rounds(id),
  question_id UUID NOT NULL REFERENCES questions(id),
  selected_option_id UUID REFERENCES question_options(id),
  submitted_at_server TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- server time, authoritative
  response_time_ms INTEGER, -- ms from question open to submission
  is_correct BOOLEAN,
  awarded_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  submission_status submission_status NOT NULL DEFAULT 'submitted',
  fastest_rank INTEGER, -- 1 = fastest correct answer
  override_by UUID REFERENCES profiles(id),
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id, question_id) -- one answer per question per participant
);

CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_participant ON answers(participant_id);
CREATE INDEX idx_answers_session ON answers(session_id);
CREATE INDEX idx_answers_submitted_at ON answers(question_id, submitted_at_server);
CREATE INDEX idx_answers_correct ON answers(question_id, is_correct, submitted_at_server);

-- ============================================================
-- DISPLAY STATE
-- ============================================================

CREATE TABLE display_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
  current_question_id UUID REFERENCES questions(id),
  current_round_id UUID REFERENCES rounds(id),
  reveal_state reveal_state NOT NULL DEFAULT 'hidden',
  answer_window_state answer_window_state NOT NULL DEFAULT 'closed',
  timer_started_at TIMESTAMPTZ,
  timer_duration_seconds INTEGER,
  timer_paused_at TIMESTAMPTZ,
  show_leaderboard BOOLEAN NOT NULL DEFAULT false,
  show_distribution BOOLEAN NOT NULL DEFAULT false,
  show_fastest BOOLEAN NOT NULL DEFAULT false,
  fastest_participant_id UUID REFERENCES participants(id),
  fastest_response_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEADERBOARD SNAPSHOT
-- ============================================================

CREATE TABLE leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  question_id UUID REFERENCES questions(id),
  round_id UUID REFERENCES rounds(id),
  snapshot_data JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_session ON leaderboard_snapshots(session_id);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id),
  performed_by UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_session ON audit_logs(session_id);
CREATE INDEX idx_audit_user ON audit_logs(performed_by);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- FK BACK-REFERENCES (deferred)
-- ============================================================

ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_current_round
  FOREIGN KEY (current_round_id) REFERENCES rounds(id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_competitions_updated_at BEFORE UPDATE ON competitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rounds_updated_at BEFORE UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_display_state_updated_at BEFORE UPDATE ON display_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE display_state;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE leaderboard_snapshots;
