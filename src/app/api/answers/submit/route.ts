// src/app/api/answers/submit/route.ts
// Server-authoritative answer submission
// This is the most critical endpoint - handles timing, idempotency, scoring

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { SubmitAnswerRequest } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const serverReceiveTime = new Date() // Capture server time FIRST

  let body: SubmitAnswerRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { question_id, selected_option_id, participant_join_code, client_timestamp } = body

  if (!question_id || !selected_option_id || !participant_join_code) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── 1. Validate participant via join_code ──────────────────────────────────
  const { data: participant, error: partErr } = await supabase
    .from('participants')
    .select('id, session_id, is_eliminated, display_name')
    .eq('join_code', participant_join_code)
    .single()

  if (partErr || !participant) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
  }

  if (participant.is_eliminated) {
    return NextResponse.json({ error: 'Participant is eliminated' }, { status: 403 })
  }

  // ── 2. Validate session is active and answering is open ────────────────────
  const { data: displayState, error: dsErr } = await supabase
    .from('display_state')
    .select('answer_window_state, current_question_id, current_round_id, timer_started_at, timer_duration_seconds')
    .eq('session_id', participant.session_id)
    .single()

  if (dsErr || !displayState) {
    return NextResponse.json({ error: 'Session state not found' }, { status: 404 })
  }

  if (displayState.answer_window_state !== 'open') {
    return NextResponse.json(
      { error: 'Answering is not currently open', code: 'WINDOW_CLOSED' },
      { status: 409 }
    )
  }

  // ── 3. Validate this is the current question ───────────────────────────────
  if (displayState.current_question_id !== question_id) {
    return NextResponse.json(
      { error: 'This question is no longer active', code: 'WRONG_QUESTION' },
      { status: 409 }
    )
  }

  // ── 4. Check timer hasn't expired (server-side) ────────────────────────────
  if (displayState.timer_started_at && displayState.timer_duration_seconds) {
    const timerStart = new Date(displayState.timer_started_at).getTime()
    const timerEnd = timerStart + displayState.timer_duration_seconds * 1000
    // Add 500ms grace for network latency
    if (serverReceiveTime.getTime() > timerEnd + 500) {
      return NextResponse.json(
        { error: 'Time has expired', code: 'TIMER_EXPIRED' },
        { status: 409 }
      )
    }
  }

  // ── 5. Idempotency check: one answer per participant per question ──────────
  const { data: existing } = await supabase
    .from('answers')
    .select('id, submission_status')
    .eq('participant_id', participant.id)
    .eq('question_id', question_id)
    .single()

  if (existing && existing.submission_status === 'submitted') {
    return NextResponse.json(
      { error: 'Answer already submitted', code: 'DUPLICATE_SUBMISSION' },
      { status: 409 }
    )
  }

  // ── 6. Validate selected option belongs to this question ──────────────────
  const { data: option, error: optErr } = await supabase
    .from('question_options')
    .select('id, is_correct, question_id')
    .eq('id', selected_option_id)
    .eq('question_id', question_id)
    .single()

  if (optErr || !option) {
    return NextResponse.json({ error: 'Invalid option for this question' }, { status: 400 })
  }

  // ── 7. Get round config for scoring ───────────────────────────────────────
  const { data: round } = await supabase
    .from('rounds')
    .select('id, mode, base_points, allow_negative, negative_value, allow_speed_bonus, speed_bonus_max, time_limit_seconds')
    .eq('id', displayState.current_round_id!)
    .single()

  // ── 8. Get question-specific overrides ────────────────────────────────────
  const { data: question } = await supabase
    .from('questions')
    .select('base_points, time_limit_seconds')
    .eq('id', question_id)
    .single()

  // ── 9. Calculate response time (server-authoritative) ─────────────────────
  let responseTimeMs: number | null = null
  if (displayState.timer_started_at) {
    responseTimeMs = serverReceiveTime.getTime() - new Date(displayState.timer_started_at).getTime()
  }

  // ── 10. Calculate points ──────────────────────────────────────────────────
  const effectiveBasePoints = question?.base_points ?? round?.base_points ?? 10
  const effectiveTimeLimit = (question?.time_limit_seconds ?? round?.time_limit_seconds ?? 30) * 1000

  let awardedPoints = 0

  if (option.is_correct) {
    awardedPoints = effectiveBasePoints

    // Speed bonus: scales linearly from full bonus at t=0 to 0 at t=timeLimit
    if (round?.allow_speed_bonus && round.speed_bonus_max > 0 && responseTimeMs !== null) {
      const ratio = Math.max(0, 1 - responseTimeMs / effectiveTimeLimit)
      const speedBonus = Math.round(round.speed_bonus_max * ratio * 10) / 10
      awardedPoints += speedBonus
    }
  } else if (round?.allow_negative && round.negative_value > 0) {
    awardedPoints = -Math.abs(round.negative_value)
  }

  // ── 11. Determine fastest correct rank for this question ──────────────────
  let fastestRank: number | null = null
  if (option.is_correct) {
    const { count } = await supabase
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', question_id)
      .eq('is_correct', true)
      .eq('submission_status', 'submitted')

    fastestRank = (count ?? 0) + 1 // This submission will be #(count+1)
  }

  // ── 12. Insert answer (use upsert for race safety) ─────────────────────────
  const { data: answer, error: insertErr } = await supabase
    .from('answers')
    .upsert(
      {
        participant_id: participant.id,
        session_id: participant.session_id,
        round_id: displayState.current_round_id!,
        question_id,
        selected_option_id,
        submitted_at_server: serverReceiveTime.toISOString(),
        response_time_ms: responseTimeMs,
        is_correct: option.is_correct,
        awarded_points: awardedPoints,
        submission_status: 'submitted',
        fastest_rank: fastestRank,
      },
      {
        onConflict: 'participant_id,question_id',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single()

  if (insertErr) {
    console.error('Answer insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to record answer' }, { status: 500 })
  }

  // ── 13. Update participant scores ─────────────────────────────────────────
  // Use RPC to atomically update scores to avoid race conditions
  const { error: scoreErr } = await supabase.rpc('update_participant_score', {
    p_participant_id: participant.id,
    p_points_delta: awardedPoints,
    p_is_correct: option.is_correct,
    p_response_ms: responseTimeMs,
  })

  if (scoreErr) {
    // Non-fatal: score will be recalculated on leaderboard refresh
    console.error('Score update error:', scoreErr)
  }

  // ── 14. Update fastest answer on display state if fastest_finger mode ─────
  if (round?.mode === 'fastest_finger' && option.is_correct && fastestRank === 1) {
    await supabase
      .from('display_state')
      .update({
        fastest_participant_id: participant.id,
        fastest_response_ms: responseTimeMs,
      })
      .eq('session_id', participant.session_id)
  }

  // ── 15. Audit log ─────────────────────────────────────────────────────────
  await supabase.from('audit_logs').insert({
    session_id: participant.session_id,
    action: 'answer_submitted',
    entity_type: 'answers',
    entity_id: answer?.id,
    after_data: {
      participant_id: participant.id,
      question_id,
      is_correct: option.is_correct,
      awarded_points: awardedPoints,
      response_time_ms: responseTimeMs,
    },
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
  })

  return NextResponse.json({
    success: true,
    answer_id: answer?.id,
    message: option.is_correct ? 'Correct!' : 'Submitted',
    // Don't expose is_correct here — participant UI reads from display_state reveal
  })
}
