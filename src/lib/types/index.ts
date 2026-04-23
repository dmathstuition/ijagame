// ============================================================
// INFANT JESUS SPAK - Type Definitions
// src/lib/types/index.ts
// ============================================================

export type AppRole = 'super_admin' | 'quiz_admin' | 'moderator' | 'participant' | 'display'
export type RoundMode = 'fastest_finger' | 'classic_mcq' | 'personal_cbt' | 'sudden_death' | 'practice' | 'buzzer'
export type SessionStatus = 'draft' | 'lobby' | 'active' | 'paused' | 'completed' | 'archived'
export type RoundStatus = 'pending' | 'active' | 'paused' | 'completed'
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer'
export type RevealState = 'hidden' | 'distribution_only' | 'answer_revealed' | 'leaderboard_revealed'
export type SubmissionStatus = 'submitted' | 'invalidated' | 'overridden' | 'late'
export type AnswerWindowState = 'closed' | 'open' | 'locked'

// ============================================================
// DATABASE TYPES
// ============================================================

export interface Profile {
  id: string
  email: string
  full_name: string
  role: AppRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Competition {
  id: string
  title: string
  description: string | null
  school_year: string | null
  subject: string | null
  created_by: string
  is_active: boolean
  allow_negative_marking: boolean
  negative_mark_value: number
  allow_speed_bonus: boolean
  speed_bonus_max: number
  team_mode: boolean
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  competition_id: string
  title: string
  session_code: string
  status: SessionStatus
  created_by: string
  current_round_id: string | null
  current_question_index: number
  answer_window_state: AnswerWindowState
  reveal_state: RevealState
  privacy_mode: boolean
  show_fastest_answer: boolean
  show_distribution: boolean
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  // Joined
  competition?: Competition
}

export interface Round {
  id: string
  session_id: string
  title: string
  mode: RoundMode
  order_index: number
  status: RoundStatus
  time_limit_seconds: number
  base_points: number
  allow_negative: boolean
  negative_value: number
  allow_speed_bonus: boolean
  speed_bonus_max: number
  eliminate_on_wrong: boolean
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  // Joined
  questions?: Question[]
}

export interface Question {
  id: string
  round_id: string
  question_text: string
  question_type: QuestionType
  image_url: string | null
  order_index: number
  time_limit_seconds: number | null
  base_points: number | null
  explanation: string | null
  created_at: string
  updated_at: string
  // Joined
  options?: QuestionOption[]
}

export interface QuestionOption {
  id: string
  question_id: string
  option_label: string // A, B, C, D
  option_text: string
  is_correct: boolean // Hidden from participants until reveal
  order_index: number
  created_at: string
}

// Safe version - correct answer hidden
export interface QuestionOptionPublic {
  id: string
  question_id: string
  option_label: string
  option_text: string
  order_index: number
}

export interface Team {
  id: string
  session_id: string
  team_name: string
  color_hex: string
  total_score: number
  created_at: string
}

export interface Participant {
  id: string
  session_id: string
  display_name: string
  team_id: string | null
  user_id: string | null
  join_code: string
  is_eliminated: boolean
  is_online: boolean
  total_score: number
  correct_count: number
  wrong_count: number
  avg_response_ms: number | null
  joined_at: string
  last_seen_at: string
  created_at: string
  // Joined
  team?: Team
}

export interface Answer {
  id: string
  participant_id: string
  session_id: string
  round_id: string
  question_id: string
  selected_option_id: string | null
  submitted_at_server: string
  response_time_ms: number | null
  is_correct: boolean | null
  awarded_points: number
  submission_status: SubmissionStatus
  fastest_rank: number | null
  override_by: string | null
  override_reason: string | null
  created_at: string
  // Joined
  selected_option?: QuestionOption
  participant?: Participant
}

export interface DisplayState {
  id: string
  session_id: string
  current_question_id: string | null
  current_round_id: string | null
  reveal_state: RevealState
  answer_window_state: AnswerWindowState
  timer_started_at: string | null
  timer_duration_seconds: number | null
  timer_paused_at: string | null
  show_leaderboard: boolean
  show_distribution: boolean
  show_fastest: boolean
  fastest_participant_id: string | null
  fastest_response_ms: number | null
  updated_at: string
  // Joined
  current_question?: Question
  current_round?: Round
  fastest_participant?: Participant
}

export interface LeaderboardEntry {
  rank: number
  participant_id: string
  display_name: string
  team_name?: string
  total_score: number
  correct_count: number
  wrong_count: number
  avg_response_ms: number | null
}

export interface LeaderboardSnapshot {
  id: string
  session_id: string
  question_id: string | null
  round_id: string | null
  snapshot_data: LeaderboardEntry[]
  created_at: string
}

export interface AuditLog {
  id: string
  session_id: string | null
  performed_by: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

// ============================================================
// REALTIME EVENT TYPES
// ============================================================

export type RealtimeEventType =
  | 'session_state_changed'
  | 'round_started'
  | 'question_changed'
  | 'timer_started'
  | 'timer_paused'
  | 'timer_ended'
  | 'answering_opened'
  | 'answering_locked'
  | 'answer_submitted'
  | 'reveal_state_changed'
  | 'leaderboard_updated'
  | 'participant_presence_changed'
  | 'buzzer_triggered'
  | 'participant_eliminated'

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType
  session_id: string
  payload: T
  timestamp: string
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface JoinSessionRequest {
  session_code: string
  display_name: string
  team_id?: string
}

export interface JoinSessionResponse {
  participant: Participant
  session: Session
  join_code: string // stored in localStorage for reconnect
}

export interface SubmitAnswerRequest {
  question_id: string
  selected_option_id: string
  participant_join_code: string
  client_timestamp: number // client performance.now() for reference only
}

export interface SubmitAnswerResponse {
  success: boolean
  answer_id: string
  message: string
}

export interface AdminSessionControlRequest {
  action:
    | 'start_session'
    | 'pause_session'
    | 'resume_session'
    | 'end_session'
    | 'open_answering'
    | 'lock_answering'
    | 'reveal_answer'
    | 'reveal_distribution'
    | 'reveal_leaderboard'
    | 'next_question'
    | 'prev_question'
    | 'start_round'
    | 'end_round'
  session_id: string
  payload?: Record<string, unknown>
}

export interface AnswerDistribution {
  option_id: string
  option_label: string
  option_text: string
  count: number
  percentage: number
  is_correct: boolean
}

export interface LiveStats {
  total_participants: number
  online_participants: number
  answered_count: number
  unanswered_count: number
  answer_distribution: AnswerDistribution[]
  fastest_answer?: {
    participant_name: string
    response_ms: number
  }
}

// ============================================================
// PRESENCE TYPES
// ============================================================

export interface AdminPresence {
  user_id: string
  name: string
  role: AppRole
  joined_at: number
}

export interface ParticipantPresence {
  participant_id: string
  display_name: string
  session_id: string
  joined_at: number
}

export interface DisplayPresence {
  screen_id: string
  session_id: string
  joined_at: number
}
