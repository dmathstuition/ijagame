// src/app/api/sessions/[sessionId]/live-stats/route.ts
// Returns answer distribution and live counts for admin/display
// Respects privacy_mode: hides distribution until admin unlocks

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import type { AnswerDistribution, LiveStats } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const userClient = await createServerSupabaseClient()
  const serviceClient = createServiceClient()

  // Check if requester is admin
  const { data: { user } } = await userClient.auth.getUser()
  const isAdmin = user ? await checkIsAdmin(serviceClient, user.id) : false

  // Get display state to check privacy mode
  const { data: displayState } = await serviceClient
    .from('display_state')
    .select('answer_window_state, current_question_id, show_distribution, reveal_state')
    .eq('session_id', sessionId)
    .single()

  const { data: session } = await serviceClient
    .from('sessions')
    .select('privacy_mode, show_distribution, show_fastest_answer')
    .eq('id', sessionId)
    .single()

  const currentQuestionId = displayState?.current_question_id

  // Count participants
  const { count: totalCount } = await serviceClient
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  const { count: onlineCount } = await serviceClient
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('is_online', true)

  let answeredCount = 0
  let distribution: AnswerDistribution[] = []
  let fastestAnswer: LiveStats['fastest_answer'] | undefined

  if (currentQuestionId) {
    // Count answered participants
    const { count: ansCount } = await serviceClient
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', currentQuestionId)
      .eq('session_id', sessionId)
      .eq('submission_status', 'submitted')

    answeredCount = ansCount ?? 0

    // Distribution - show only if admin OR (distribution revealed AND not privacy mode)
    const showDist = isAdmin || (displayState?.show_distribution && !session?.privacy_mode)

    if (showDist) {
      // Get options for this question
      const { data: options } = await serviceClient
        .from('question_options')
        .select('id, option_label, option_text, is_correct')
        .eq('question_id', currentQuestionId)
        .order('order_index')

      if (options && answeredCount > 0) {
        for (const opt of options) {
          const { count: optCount } = await serviceClient
            .from('answers')
            .select('*', { count: 'exact', head: true })
            .eq('question_id', currentQuestionId)
            .eq('selected_option_id', opt.id)
            .eq('submission_status', 'submitted')

          distribution.push({
            option_id: opt.id,
            option_label: opt.option_label,
            option_text: opt.option_text,
            count: optCount ?? 0,
            percentage: answeredCount > 0 ? Math.round(((optCount ?? 0) / answeredCount) * 100) : 0,
            // Only reveal is_correct to admins or after answer reveal
            is_correct: isAdmin || displayState?.reveal_state === 'answer_revealed' || displayState?.reveal_state === 'leaderboard_revealed'
              ? opt.is_correct
              : false,
          })
        }
      }
    }

    // Fastest answer - show only if enabled
    if (session?.show_fastest_answer && isAdmin || displayState?.show_distribution) {
      const { data: fastestData } = await serviceClient
        .from('answers')
        .select('response_time_ms, participants(display_name)')
        .eq('question_id', currentQuestionId)
        .eq('is_correct', true)
        .eq('fastest_rank', 1)
        .single()

      if (fastestData) {
        fastestAnswer = {
          participant_name: (fastestData as { participants: { display_name: string } | null }).participants?.display_name ?? 'Unknown',
          response_ms: fastestData.response_time_ms ?? 0,
        }
      }
    }
  }

  const stats: LiveStats = {
    total_participants: totalCount ?? 0,
    online_participants: onlineCount ?? 0,
    answered_count: answeredCount,
    unanswered_count: Math.max(0, (totalCount ?? 0) - answeredCount),
    answer_distribution: distribution,
    fastest_answer: fastestAnswer,
  }

  return NextResponse.json(stats)
}

async function checkIsAdmin(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<boolean> {
  const { data } = await serviceClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  return !!(data?.is_active && ['super_admin', 'quiz_admin', 'moderator'].includes(data.role))
}
