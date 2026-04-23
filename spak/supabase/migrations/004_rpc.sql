-- supabase/migrations/004_rpc.sql
-- RPC functions called from server-side route handlers
-- These run with SECURITY DEFINER to bypass RLS safely

-- ============================================================
-- update_participant_score
-- Atomically updates participant score to prevent race conditions
-- Called by answer submission route handler
-- ============================================================

CREATE OR REPLACE FUNCTION update_participant_score(
  p_participant_id UUID,
  p_points_delta NUMERIC,
  p_is_correct BOOLEAN,
  p_response_ms INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_current_avg NUMERIC;
  v_current_count INTEGER;
  v_new_avg NUMERIC;
BEGIN
  -- Fetch current avg and count
  SELECT avg_response_ms, correct_count
  INTO v_current_avg, v_current_count
  FROM participants
  WHERE id = p_participant_id
  FOR UPDATE;

  -- Calculate new rolling average response time
  IF p_is_correct AND p_response_ms IS NOT NULL THEN
    IF v_current_avg IS NULL OR v_current_count = 0 THEN
      v_new_avg := p_response_ms;
    ELSE
      v_new_avg := ((v_current_avg * v_current_count) + p_response_ms) / (v_current_count + 1);
    END IF;
  ELSE
    v_new_avg := v_current_avg;
  END IF;

  UPDATE participants
  SET
    total_score = total_score + p_points_delta,
    correct_count = correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    wrong_count = wrong_count + CASE WHEN NOT p_is_correct THEN 1 ELSE 0 END,
    avg_response_ms = v_new_avg,
    last_seen_at = NOW()
  WHERE id = p_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- get_session_leaderboard
-- Returns current leaderboard for a session
-- Used for live leaderboard endpoint
-- ============================================================

CREATE OR REPLACE FUNCTION get_session_leaderboard(p_session_id UUID)
RETURNS TABLE (
  rank BIGINT,
  participant_id UUID,
  display_name TEXT,
  team_name TEXT,
  total_score NUMERIC,
  correct_count INTEGER,
  wrong_count INTEGER,
  avg_response_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY p.total_score DESC,
               p.correct_count DESC,
               p.avg_response_ms ASC NULLS LAST
    ) AS rank,
    p.id AS participant_id,
    p.display_name,
    t.team_name,
    p.total_score,
    p.correct_count,
    p.wrong_count,
    p.avg_response_ms
  FROM participants p
  LEFT JOIN teams t ON t.id = p.team_id
  WHERE p.session_id = p_session_id
  ORDER BY p.total_score DESC, p.correct_count DESC, p.avg_response_ms ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- get_answer_distribution
-- Returns answer distribution without exposing is_correct
-- unless p_reveal is TRUE
-- ============================================================

CREATE OR REPLACE FUNCTION get_answer_distribution(
  p_question_id UUID,
  p_session_id UUID,
  p_reveal BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  option_id UUID,
  option_label TEXT,
  option_text TEXT,
  count BIGINT,
  percentage NUMERIC,
  is_correct BOOLEAN
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM answers
  WHERE question_id = p_question_id
    AND session_id = p_session_id
    AND submission_status = 'submitted';

  RETURN QUERY
  SELECT
    qo.id AS option_id,
    qo.option_label,
    qo.option_text,
    COUNT(a.id) AS count,
    CASE WHEN v_total > 0 THEN ROUND(COUNT(a.id)::NUMERIC / v_total * 100, 1) ELSE 0 END AS percentage,
    CASE WHEN p_reveal THEN qo.is_correct ELSE FALSE END AS is_correct
  FROM question_options qo
  LEFT JOIN answers a ON a.selected_option_id = qo.id
    AND a.question_id = p_question_id
    AND a.session_id = p_session_id
    AND a.submission_status = 'submitted'
  WHERE qo.question_id = p_question_id
  GROUP BY qo.id, qo.option_label, qo.option_text, qo.is_correct, qo.order_index
  ORDER BY qo.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- mark_participant_online
-- Called by presence heartbeat
-- ============================================================

CREATE OR REPLACE FUNCTION mark_participant_online(
  p_join_code TEXT,
  p_is_online BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
BEGIN
  UPDATE participants
  SET is_online = p_is_online, last_seen_at = NOW()
  WHERE join_code = p_join_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Leaderboard reads (most common hot path)
CREATE INDEX IF NOT EXISTS idx_participants_leaderboard
  ON participants(session_id, total_score DESC, correct_count DESC, avg_response_ms ASC);

-- Answer lookup by question for distribution
CREATE INDEX IF NOT EXISTS idx_answers_distribution
  ON answers(question_id, session_id, selected_option_id, submission_status);

-- Display state lookup (realtime hot path)
CREATE INDEX IF NOT EXISTS idx_display_state_session
  ON display_state(session_id);

-- Audit log recent lookups
CREATE INDEX IF NOT EXISTS idx_audit_recent
  ON audit_logs(session_id, created_at DESC);
