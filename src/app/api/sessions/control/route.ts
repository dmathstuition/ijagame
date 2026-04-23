// src/app/api/sessions/control/route.ts
// Admin session control - start, pause, next question, reveal, etc.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import type { AdminSessionControlRequest } from '@/lib/types'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active || !['super_admin', 'quiz_admin', 'moderator'].includes(profile.role)) {
    throw new Error('Forbidden')
  }

  return { user, profile }
}

async function writeAuditLog(
  serviceClient: ReturnType<typeof createServiceClient>,
  sessionId: string,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  afterData?: Record<string, unknown>
) {
  await serviceClient.from('audit_logs').insert({
    session_id: sessionId,
    performed_by: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_data: afterData,
  })
}

export async function POST(request: NextRequest) {
  const userClient = await createServerSupabaseClient()
  const serviceClient = createServiceClient()

  let adminUser: { id: string } | null = null

  try {
    const { user } = await requireAdmin(userClient)
    adminUser = user
  } catch (err: unknown) {
    const error = err as Error
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  let body: AdminSessionControlRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { action, session_id, payload } = body

  if (!action || !session_id) {
    return NextResponse.json({ error: 'Missing action or session_id' }, { status: 400 })
  }

  // Fetch current session
  const { data: session, error: sessErr } = await serviceClient
    .from('sessions')
    .select('*, display_state(*), rounds(*)')
    .eq('id', session_id)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  try {
    switch (action) {
      // ── START SESSION ──────────────────────────────────────────────────────
      case 'start_session': {
        if (session.status !== 'draft' && session.status !== 'lobby') {
          return NextResponse.json({ error: 'Session cannot be started' }, { status: 409 })
        }

        const firstRound = session.rounds?.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)[0]

        await serviceClient
          .from('sessions')
          .update({
            status: 'active',
            started_at: now,
            current_round_id: firstRound?.id ?? null,
          })
          .eq('id', session_id)

        if (firstRound) {
          await serviceClient
            .from('rounds')
            .update({ status: 'active', started_at: now })
            .eq('id', firstRound.id)
        }

        // Initialize display state
        await serviceClient
          .from('display_state')
          .upsert({
            session_id,
            current_round_id: firstRound?.id ?? null,
            current_question_id: null,
            reveal_state: 'hidden',
            answer_window_state: 'closed',
            show_leaderboard: false,
            show_distribution: false,
            show_fastest: false,
          })

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'start_session')
        break
      }

      // ── PAUSE SESSION ──────────────────────────────────────────────────────
      case 'pause_session': {
        await serviceClient
          .from('sessions')
          .update({ status: 'paused' })
          .eq('id', session_id)

        await serviceClient
          .from('display_state')
          .update({
            answer_window_state: 'locked',
            timer_paused_at: now,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'pause_session')
        break
      }

      // ── RESUME SESSION ─────────────────────────────────────────────────────
      case 'resume_session': {
        await serviceClient
          .from('sessions')
          .update({ status: 'active' })
          .eq('id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'resume_session')
        break
      }

      // ── END SESSION ────────────────────────────────────────────────────────
      case 'end_session': {
        await serviceClient
          .from('sessions')
          .update({ status: 'completed', ended_at: now })
          .eq('id', session_id)

        await serviceClient
          .from('display_state')
          .update({
            answer_window_state: 'locked',
            reveal_state: 'leaderboard_revealed',
            show_leaderboard: true,
          })
          .eq('session_id', session_id)

        // Generate final leaderboard snapshot
        await generateLeaderboard(serviceClient, session_id, null, null)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'end_session')
        break
      }

      // ── OPEN ANSWERING ─────────────────────────────────────────────────────
      case 'open_answering': {
        const { current_question_id, timer_seconds } = payload as {
          current_question_id: string
          timer_seconds: number
        }

        await serviceClient
          .from('display_state')
          .update({
            answer_window_state: 'open',
            current_question_id,
            reveal_state: 'hidden',
            timer_started_at: now,
            timer_duration_seconds: timer_seconds,
            timer_paused_at: null,
            show_fastest: false,
            show_distribution: false,
            fastest_participant_id: null,
            fastest_response_ms: null,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'open_answering', 'questions', current_question_id)
        break
      }

      // ── LOCK ANSWERING ─────────────────────────────────────────────────────
      case 'lock_answering': {
        await serviceClient
          .from('display_state')
          .update({
            answer_window_state: 'locked',
            timer_paused_at: now,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'lock_answering')
        break
      }

      // ── REVEAL ANSWER ──────────────────────────────────────────────────────
      case 'reveal_answer': {
        const { question_id: revealQId } = payload as { question_id: string }

        // Score all answers for this question
        await scoreQuestion(serviceClient, revealQId, session_id)

        await serviceClient
          .from('display_state')
          .update({
            reveal_state: 'answer_revealed',
            show_distribution: true,
            show_fastest: session.show_fastest_answer,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'reveal_answer', 'questions', revealQId)
        break
      }

      // ── REVEAL DISTRIBUTION ONLY ───────────────────────────────────────────
      case 'reveal_distribution': {
        await serviceClient
          .from('display_state')
          .update({
            reveal_state: 'distribution_only',
            show_distribution: true,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'reveal_distribution')
        break
      }

      // ── REVEAL LEADERBOARD ─────────────────────────────────────────────────
      case 'reveal_leaderboard': {
        const { round_id: lb_round_id, question_id: lb_q_id } = (payload as { round_id?: string; question_id?: string }) ?? {}
        await generateLeaderboard(serviceClient, session_id, lb_round_id ?? null, lb_q_id ?? null)

        await serviceClient
          .from('display_state')
          .update({
            reveal_state: 'leaderboard_revealed',
            show_leaderboard: true,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'reveal_leaderboard')
        break
      }

      // ── NEXT QUESTION ──────────────────────────────────────────────────────
      case 'next_question': {
        const { round_id, question_id } = payload as { round_id: string; question_id: string }

        await serviceClient
          .from('display_state')
          .update({
            current_question_id: question_id,
            current_round_id: round_id,
            answer_window_state: 'closed',
            reveal_state: 'hidden',
            show_leaderboard: false,
            show_distribution: false,
            show_fastest: false,
            timer_started_at: null,
            timer_duration_seconds: null,
            timer_paused_at: null,
            fastest_participant_id: null,
            fastest_response_ms: null,
          })
          .eq('session_id', session_id)

        await serviceClient
          .from('sessions')
          .update({ current_question_index: session.current_question_index + 1 })
          .eq('id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'next_question', 'questions', question_id)
        break
      }

      // ── START ROUND ────────────────────────────────────────────────────────
      case 'start_round': {
        const { round_id: newRoundId } = payload as { round_id: string }

        await serviceClient
          .from('rounds')
          .update({ status: 'active', started_at: now })
          .eq('id', newRoundId)

        await serviceClient
          .from('sessions')
          .update({ current_round_id: newRoundId, current_question_index: 0 })
          .eq('id', session_id)

        await serviceClient
          .from('display_state')
          .update({
            current_round_id: newRoundId,
            current_question_id: null,
            answer_window_state: 'closed',
            reveal_state: 'hidden',
            show_leaderboard: false,
          })
          .eq('session_id', session_id)

        await writeAuditLog(serviceClient, session_id, adminUser.id, 'start_round', 'rounds', newRoundId)
        break
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, action })
  } catch (err) {
    console.error(`Session control error [${action}]:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================
// HELPER: Score all answers for a question
// ============================================================
async function scoreQuestion(
  serviceClient: ReturnType<typeof createServiceClient>,
  questionId: string,
  sessionId: string
) {
  // Get correct option
  const { data: correctOption } = await serviceClient
    .from('question_options')
    .select('id')
    .eq('question_id', questionId)
    .eq('is_correct', true)
    .single()

  if (!correctOption) return

  // Get all answers for this question
  const { data: answers } = await serviceClient
    .from('answers')
    .select('id, participant_id, selected_option_id, submitted_at_server, response_time_ms')
    .eq('question_id', questionId)
    .eq('submission_status', 'submitted')
    .order('submitted_at_server', { ascending: true })

  if (!answers) return

  // Get round config
  const { data: dsState } = await serviceClient
    .from('display_state')
    .select('current_round_id')
    .eq('session_id', sessionId)
    .single()

  const { data: round } = await serviceClient
    .from('rounds')
    .select('base_points, allow_negative, negative_value, allow_speed_bonus, speed_bonus_max, time_limit_seconds')
    .eq('id', dsState?.current_round_id!)
    .single()

  const { data: question } = await serviceClient
    .from('questions')
    .select('base_points, time_limit_seconds')
    .eq('id', questionId)
    .single()

  const basePoints = question?.base_points ?? round?.base_points ?? 10
  const timeLimitMs = ((question?.time_limit_seconds ?? round?.time_limit_seconds ?? 30)) * 1000

  let correctRank = 0

  for (const answer of answers) {
    const isCorrect = answer.selected_option_id === correctOption.id
    let points = 0

    if (isCorrect) {
      correctRank++
      points = basePoints

      if (round?.allow_speed_bonus && round.speed_bonus_max > 0 && answer.response_time_ms !== null) {
        const ratio = Math.max(0, 1 - answer.response_time_ms / timeLimitMs)
        points += Math.round(round.speed_bonus_max * ratio * 10) / 10
      }
    } else if (round?.allow_negative && round.negative_value > 0) {
      points = -Math.abs(round.negative_value)
    }

    await serviceClient
      .from('answers')
      .update({
        is_correct: isCorrect,
        awarded_points: points,
        fastest_rank: isCorrect ? correctRank : null,
      })
      .eq('id', answer.id)

    // Update participant score atomically
    await serviceClient.rpc('update_participant_score', {
      p_participant_id: answer.participant_id,
      p_points_delta: points,
      p_is_correct: isCorrect,
      p_response_ms: answer.response_time_ms,
    })
  }
}

// ============================================================
// HELPER: Generate leaderboard snapshot
// ============================================================
async function generateLeaderboard(
  serviceClient: ReturnType<typeof createServiceClient>,
  sessionId: string,
  roundId: string | null,
  questionId: string | null
) {
  const { data: participants } = await serviceClient
    .from('participants')
    .select('id, display_name, total_score, correct_count, wrong_count, avg_response_ms, team_id, teams(team_name)')
    .eq('session_id', sessionId)
    .order('total_score', { ascending: false })
    .order('correct_count', { ascending: false })
    .order('avg_response_ms', { ascending: true })

  if (!participants) return

  const snapshot = participants.map((p, idx) => ({
    rank: idx + 1,
    participant_id: p.id,
    display_name: p.display_name,
    team_name: (p as { teams?: { team_name: string } }).teams?.team_name,
    total_score: p.total_score,
    correct_count: p.correct_count,
    wrong_count: p.wrong_count,
    avg_response_ms: p.avg_response_ms,
  }))

  await serviceClient.from('leaderboard_snapshots').insert({
    session_id: sessionId,
    round_id: roundId,
    question_id: questionId,
    snapshot_data: snapshot,
  })
}
