-- ============================================================
-- SEED DATA - INFANT JESUS SPAK COMPETITION
-- ============================================================
-- NOTE: Run this after creating your first super admin via
-- Supabase Auth (sign up), then update the UUID below.
-- Replace 'YOUR_SUPER_ADMIN_UUID' with actual auth user UUID.

-- ============================================================
-- PROFILES (created by auth trigger in production)
-- Manually insert for seed
-- ============================================================

-- Insert super admin profile (auth user must exist first)
-- INSERT INTO profiles (id, email, full_name, role)
-- VALUES ('YOUR_SUPER_ADMIN_UUID', 'admin@infantjesus.edu.ng', 'Super Administrator', 'super_admin');

-- Example moderator profile
-- INSERT INTO profiles (id, email, full_name, role)
-- VALUES ('MODERATOR_UUID', 'moderator@infantjesus.edu.ng', 'Quiz Moderator', 'moderator');

-- ============================================================
-- SAMPLE COMPETITION
-- ============================================================

INSERT INTO competitions (
  id, title, description, school_year, subject,
  created_by, is_active, allow_negative_marking,
  negative_mark_value, allow_speed_bonus, speed_bonus_max, team_mode
) VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'Inter-House Science Quiz 2025',
  'Annual Science Quiz Competition for SS1 - SS3 students',
  '2024/2025',
  'General Science',
  -- Use service role to bypass FK temporarily, replace with real UUID
  '00000000-0000-0000-0000-000000000000',
  true, false, 0, true, 5, false
) ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE SESSION
-- ============================================================

INSERT INTO sessions (
  id, competition_id, title, session_code, status,
  created_by, answer_window_state, reveal_state,
  privacy_mode, show_fastest_answer, show_distribution
) VALUES (
  's1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'Preliminary Round - Group A',
  'SPAK2025',
  'draft',
  '00000000-0000-0000-0000-000000000000',
  'closed', 'hidden', false, true, true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE ROUNDS
-- ============================================================

-- Round 1: Classic MCQ
INSERT INTO rounds (
  id, session_id, title, mode, order_index, status,
  time_limit_seconds, base_points, allow_negative,
  allow_speed_bonus, speed_bonus_max
) VALUES (
  'r1000000-0000-0000-0000-000000000001',
  's1000000-0000-0000-0000-000000000001',
  'Round 1: General Science',
  'classic_mcq', 0, 'pending',
  30, 10, false, false, 0
) ON CONFLICT DO NOTHING;

-- Round 2: Fastest Finger
INSERT INTO rounds (
  id, session_id, title, mode, order_index, status,
  time_limit_seconds, base_points, allow_speed_bonus, speed_bonus_max
) VALUES (
  'r2000000-0000-0000-0000-000000000002',
  's1000000-0000-0000-0000-000000000001',
  'Round 2: Speed Round',
  'fastest_finger', 1, 'pending',
  15, 20, true, 10
) ON CONFLICT DO NOTHING;

-- Round 3: Sudden Death
INSERT INTO rounds (
  id, session_id, title, mode, order_index, status,
  time_limit_seconds, base_points, eliminate_on_wrong
) VALUES (
  'r3000000-0000-0000-0000-000000000003',
  's1000000-0000-0000-0000-000000000001',
  'Round 3: Sudden Death',
  'sudden_death', 2, 'pending',
  20, 30, true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE QUESTIONS - ROUND 1
-- ============================================================

INSERT INTO questions (id, round_id, question_text, question_type, order_index, time_limit_seconds, base_points)
VALUES
  ('q1000000-0000-0000-0000-000000000001', 'r1000000-0000-0000-0000-000000000001',
   'What is the chemical symbol for Gold?', 'multiple_choice', 0, 30, 10),
  ('q1000000-0000-0000-0000-000000000002', 'r1000000-0000-0000-0000-000000000001',
   'Which planet is known as the Red Planet?', 'multiple_choice', 1, 30, 10),
  ('q1000000-0000-0000-0000-000000000003', 'r1000000-0000-0000-0000-000000000001',
   'What is the powerhouse of the cell?', 'multiple_choice', 2, 30, 10),
  ('q1000000-0000-0000-0000-000000000004', 'r1000000-0000-0000-0000-000000000001',
   'How many bones are in the adult human body?', 'multiple_choice', 3, 30, 10),
  ('q1000000-0000-0000-0000-000000000005', 'r1000000-0000-0000-0000-000000000001',
   'What is the speed of light in a vacuum (approximately)?', 'multiple_choice', 4, 30, 10)
ON CONFLICT DO NOTHING;

-- OPTIONS for Q1 (Gold)
INSERT INTO question_options (question_id, option_label, option_text, is_correct, order_index) VALUES
  ('q1000000-0000-0000-0000-000000000001', 'A', 'Go', false, 0),
  ('q1000000-0000-0000-0000-000000000001', 'B', 'Au', true, 1),
  ('q1000000-0000-0000-0000-000000000001', 'C', 'Ag', false, 2),
  ('q1000000-0000-0000-0000-000000000001', 'D', 'Gd', false, 3)
ON CONFLICT DO NOTHING;

-- OPTIONS for Q2 (Mars)
INSERT INTO question_options (question_id, option_label, option_text, is_correct, order_index) VALUES
  ('q1000000-0000-0000-0000-000000000002', 'A', 'Jupiter', false, 0),
  ('q1000000-0000-0000-0000-000000000002', 'B', 'Venus', false, 1),
  ('q1000000-0000-0000-0000-000000000002', 'C', 'Mars', true, 2),
  ('q1000000-0000-0000-0000-000000000002', 'D', 'Saturn', false, 3)
ON CONFLICT DO NOTHING;

-- OPTIONS for Q3 (Mitochondria)
INSERT INTO question_options (question_id, option_label, option_text, is_correct, order_index) VALUES
  ('q1000000-0000-0000-0000-000000000003', 'A', 'Nucleus', false, 0),
  ('q1000000-0000-0000-0000-000000000003', 'B', 'Ribosome', false, 1),
  ('q1000000-0000-0000-0000-000000000003', 'C', 'Golgi Apparatus', false, 2),
  ('q1000000-0000-0000-0000-000000000003', 'D', 'Mitochondria', true, 3)
ON CONFLICT DO NOTHING;

-- OPTIONS for Q4 (206 bones)
INSERT INTO question_options (question_id, option_label, option_text, is_correct, order_index) VALUES
  ('q1000000-0000-0000-0000-000000000004', 'A', '198', false, 0),
  ('q1000000-0000-0000-0000-000000000004', 'B', '206', true, 1),
  ('q1000000-0000-0000-0000-000000000004', 'C', '212', false, 2),
  ('q1000000-0000-0000-0000-000000000004', 'D', '220', false, 3)
ON CONFLICT DO NOTHING;

-- OPTIONS for Q5 (Speed of light)
INSERT INTO question_options (question_id, option_label, option_text, is_correct, order_index) VALUES
  ('q1000000-0000-0000-0000-000000000005', 'A', '3 × 10⁸ m/s', true, 0),
  ('q1000000-0000-0000-0000-000000000005', 'B', '3 × 10⁶ m/s', false, 1),
  ('q1000000-0000-0000-0000-000000000005', 'C', '3 × 10¹⁰ m/s', false, 2),
  ('q1000000-0000-0000-0000-000000000005', 'D', '3 × 10⁴ m/s', false, 3)
ON CONFLICT DO NOTHING;

-- DISPLAY STATE for session
INSERT INTO display_state (
  session_id, current_round_id, current_question_id,
  reveal_state, answer_window_state
) VALUES (
  's1000000-0000-0000-0000-000000000001',
  'r1000000-0000-0000-0000-000000000001',
  'q1000000-0000-0000-0000-000000000001',
  'hidden', 'closed'
) ON CONFLICT (session_id) DO NOTHING;
