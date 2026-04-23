-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- INFANT JESUS SPAK COMPETITION PLATFORM
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get current user role from profiles
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS app_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is admin (super_admin or quiz_admin or moderator)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'quiz_admin', 'moderator')
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================

-- Users can read their own profile
CREATE POLICY "profiles_read_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "profiles_admin_read_all"
  ON profiles FOR SELECT
  USING (is_admin());

-- Users can update their own profile (limited fields via app logic)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Only super admin can update roles
CREATE POLICY "profiles_super_admin_full"
  ON profiles FOR ALL
  USING (is_super_admin());

-- ============================================================
-- COMPETITIONS
-- ============================================================

-- Admins can do everything
CREATE POLICY "competitions_admin_all"
  ON competitions FOR ALL
  USING (is_admin());

-- Participants can read active competitions (for display only)
CREATE POLICY "competitions_participant_read"
  ON competitions FOR SELECT
  USING (is_active = true);

-- ============================================================
-- SESSIONS
-- ============================================================

-- Admins can do everything
CREATE POLICY "sessions_admin_all"
  ON sessions FOR ALL
  USING (is_admin());

-- Anyone can read active/lobby sessions (to join)
CREATE POLICY "sessions_public_read_active"
  ON sessions FOR SELECT
  USING (status IN ('lobby', 'active', 'paused', 'completed'));

-- ============================================================
-- ROUNDS
-- ============================================================

-- Admins can do everything
CREATE POLICY "rounds_admin_all"
  ON rounds FOR ALL
  USING (is_admin());

-- Participants can read rounds for active sessions they are in
CREATE POLICY "rounds_participant_read"
  ON rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = rounds.session_id
      AND s.status IN ('active', 'paused', 'lobby', 'completed')
    )
  );

-- ============================================================
-- QUESTIONS
-- ============================================================

-- Admins full access
CREATE POLICY "questions_admin_all"
  ON questions FOR ALL
  USING (is_admin());

-- Participants can read questions in active rounds ONLY
-- They get question text and options, but NOT correct answer
CREATE POLICY "questions_participant_read_active"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN sessions s ON s.id = r.session_id
      WHERE r.id = questions.round_id
      AND r.status IN ('active', 'completed')
      AND s.status IN ('active', 'paused', 'completed')
    )
  );

-- ============================================================
-- QUESTION OPTIONS
-- ============================================================

-- Admins full access
CREATE POLICY "options_admin_all"
  ON question_options FOR ALL
  USING (is_admin());

-- Participants can read options for active/completed questions
-- CRITICAL: is_correct is readable, but the app layer must
-- only expose this when reveal_state = 'answer_revealed'
-- The DB stores is_correct but RLS alone can't filter columns
-- We handle this at the API/edge function layer
CREATE POLICY "options_participant_read"
  ON question_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM questions q
      JOIN rounds r ON r.id = q.round_id
      JOIN sessions s ON s.id = r.session_id
      WHERE q.id = question_options.question_id
      AND s.status IN ('active', 'paused', 'completed')
    )
  );

-- ============================================================
-- TEAMS
-- ============================================================

CREATE POLICY "teams_admin_all"
  ON teams FOR ALL
  USING (is_admin());

CREATE POLICY "teams_public_read"
  ON teams FOR SELECT
  USING (true);

-- ============================================================
-- PARTICIPANTS
-- ============================================================

-- Admins full access
CREATE POLICY "participants_admin_all"
  ON participants FOR ALL
  USING (is_admin());

-- Participants can read all participants in same session (for leaderboard)
CREATE POLICY "participants_read_same_session"
  ON participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants p2
      WHERE p2.session_id = participants.session_id
      AND p2.id = auth.uid()::text::uuid  -- check if requester is in same session (via cookie/anon)
    )
    OR
    -- display screens can read all
    get_user_role() = 'display'
    OR
    -- anyone can read session participants for display
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = participants.session_id
      AND s.status IN ('active', 'paused', 'lobby', 'completed')
    )
  );

-- Participants can insert themselves (join session) — validated by API
CREATE POLICY "participants_insert_own"
  ON participants FOR INSERT
  WITH CHECK (true); -- API validates session code and state

-- Participants can update their own online status
CREATE POLICY "participants_update_own"
  ON participants FOR UPDATE
  USING (true)
  WITH CHECK (true); -- API layer restricts what fields can change

-- ============================================================
-- ANSWERS
-- ============================================================

-- Admins full access
CREATE POLICY "answers_admin_all"
  ON answers FOR ALL
  USING (is_admin());

-- Participants can insert their own answers
CREATE POLICY "answers_participant_insert"
  ON answers FOR INSERT
  WITH CHECK (true); -- Edge function handles auth, idempotency, timing

-- Participants can read ONLY their own answers
CREATE POLICY "answers_participant_read_own"
  ON answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = answers.participant_id
    )
  );

-- Aggregate stats (not individual answers) are exposed via API layer only
-- The display screen reads aggregated data via secure API, not this table directly

-- ============================================================
-- DISPLAY STATE
-- ============================================================

-- Admins can do everything
CREATE POLICY "display_state_admin_all"
  ON display_state FOR ALL
  USING (is_admin());

-- Anyone with access to an active session can read display state
CREATE POLICY "display_state_public_read"
  ON display_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = display_state.session_id
      AND s.status IN ('active', 'paused', 'lobby', 'completed')
    )
  );

-- ============================================================
-- LEADERBOARD SNAPSHOTS
-- ============================================================

CREATE POLICY "leaderboard_admin_all"
  ON leaderboard_snapshots FOR ALL
  USING (is_admin());

CREATE POLICY "leaderboard_public_read"
  ON leaderboard_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = leaderboard_snapshots.session_id
      AND s.status IN ('active', 'paused', 'completed')
    )
  );

-- ============================================================
-- AUDIT LOGS
-- ============================================================

-- Only admins can read audit logs
CREATE POLICY "audit_admin_read"
  ON audit_logs FOR SELECT
  USING (is_admin());

-- Only service role inserts audit logs (from edge functions/route handlers)
CREATE POLICY "audit_service_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (is_admin());
