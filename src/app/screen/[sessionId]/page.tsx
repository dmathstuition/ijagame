'use client'
// src/app/screen/[sessionId]/page.tsx
// Projector-optimized display — no interaction, just live state

import { useState, useEffect, use } from 'react'
import { useSessionRealtime } from '@/hooks/useSessionRealtime'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { AnswerDistributionChart } from '@/components/shared/AnswerDistribution'
import { Leaderboard } from '@/components/shared/Leaderboard'
import { BrandHeader } from '@/components/shared/BrandHeader'
import type { DisplayState, Question, QuestionOptionPublic, LeaderboardEntry, AnswerDistribution, LiveStats } from '@/lib/types'
import { getSupabaseClient } from '@/lib/supabase/client'

const OPTION_COLORS = [
  { border: 'border-blue-400', bg: 'bg-blue-500/20', text: 'text-blue-200', label: 'bg-blue-500' },
  { border: 'border-purple-400', bg: 'bg-purple-500/20', text: 'text-purple-200', label: 'bg-purple-500' },
  { border: 'border-amber-400', bg: 'bg-amber-500/20', text: 'text-amber-200', label: 'bg-amber-500' },
  { border: 'border-emerald-400', bg: 'bg-emerald-500/20', text: 'text-emerald-200', label: 'bg-emerald-500' },
]

export default function ScreenPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<QuestionOptionPublic[]>([])
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const { displayState, session, isConnected, latestLeaderboard } = useSessionRealtime({
    sessionId,
    presencePayload: { screen_id: `screen-${sessionId}`, session_id: sessionId, joined_at: Date.now() } as unknown as undefined,
  })

  // Fetch question when display state changes
  useEffect(() => {
    if (!displayState?.current_question_id) {
      setCurrentQuestion(null)
      setOptions([])
      setCorrectOptionIds([])
      return
    }

    async function fetchQuestion() {
      const supabase = getSupabaseClient()

      const [{ data: question }, { data: opts }] = await Promise.all([
        supabase.from('questions').select('*').eq('id', displayState!.current_question_id!).single(),
        supabase.from('question_options').select('id, option_label, option_text, order_index, is_correct').eq('question_id', displayState!.current_question_id!).order('order_index'),
      ])

      setCurrentQuestion(question as Question | null)
      setOptions(opts?.map(o => ({ id: o.id, question_id: displayState!.current_question_id!, option_label: o.option_label, option_text: o.option_text, order_index: o.order_index })) ?? [])

      // Store correct IDs for reveal state
      setCorrectOptionIds(opts?.filter(o => o.is_correct).map(o => o.id) ?? [])
    }

    fetchQuestion()
  }, [displayState?.current_question_id])

  // Fetch live stats periodically when answering is open
  useEffect(() => {
    if (!displayState?.answer_window_state) return

    let interval: NodeJS.Timeout

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/live-stats`)
        if (res.ok) {
          const data = await res.json()
          setLiveStats(data)
        }
      } catch {
        // Silently fail
      }
    }

    if (displayState.answer_window_state === 'open') {
      fetchStats()
      interval = setInterval(fetchStats, 2000) // Poll every 2s when open
    } else {
      fetchStats() // One final fetch on lock/reveal
    }

    return () => clearInterval(interval)
  }, [displayState?.answer_window_state, displayState?.reveal_state, sessionId])

  // Update leaderboard from snapshot
  useEffect(() => {
    if (latestLeaderboard?.snapshot_data) {
      setLeaderboard(latestLeaderboard.snapshot_data as LeaderboardEntry[])
    }
  }, [latestLeaderboard])

  const isAnswerRevealed = displayState?.reveal_state === 'answer_revealed' || displayState?.reveal_state === 'leaderboard_revealed'
  const isLeaderboardShowing = displayState?.reveal_state === 'leaderboard_revealed' && displayState.show_leaderboard

  const currentRoundMode = 'classic_mcq' // TODO: fetch from rounds

  return (
    <div className="min-h-screen screen-mode bg-gradient-to-br from-[var(--ij-navy-deep)] via-[var(--ij-navy)] to-[var(--ij-navy-mid)] flex flex-col overflow-hidden">

      {/* TOP HEADER BAR */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/10 flex-shrink-0">
        <BrandHeader size="md" subtitle="Inter-House Science Quiz 2025" />

        <div className="flex items-center gap-6">
          {/* Online count */}
          <div className="text-right">
            <div className="text-white/40 text-xs uppercase tracking-wider font-body">Participants</div>
            <div className="text-white font-mono font-bold text-xl">
              {liveStats?.online_participants ?? liveStats?.total_participants ?? '—'}
            </div>
          </div>

          {/* Session code */}
          <div className="text-right">
            <div className="text-white/40 text-xs uppercase tracking-wider font-body">Join Code</div>
            <div className="text-[var(--ij-gold)] font-mono font-bold text-xl tracking-widest">
              {session?.session_code ?? '——'}
            </div>
          </div>

          {/* Connection */}
          <div className={`flex items-center gap-1.5 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-xs font-body">{isConnected ? 'Live' : 'Reconnecting'}</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* LEADERBOARD VIEW */}
        {isLeaderboardShowing && leaderboard.length > 0 ? (
          <LeaderboardScreen leaderboard={leaderboard} />
        ) : (
          /* QUESTION VIEW */
          <QuestionScreen
            displayState={displayState}
            currentQuestion={currentQuestion}
            options={options}
            correctOptionIds={correctOptionIds}
            isAnswerRevealed={isAnswerRevealed}
            liveStats={liveStats}
            session={session}
          />
        )}
      </main>

      {/* BOTTOM BAR */}
      <footer className="flex items-center justify-between px-8 py-3 border-t border-white/10 flex-shrink-0">
        <div className="text-white/30 text-xs font-body">
          Infant Jesus SPAK Competition Platform
        </div>
        <div className="flex items-center gap-4">
          {displayState && (
            <SessionStatusBar displayState={displayState} />
          )}
        </div>
      </footer>
    </div>
  )
}

// ── Sub-screens ─────────────────────────────────────────────────────────────

function QuestionScreen({
  displayState,
  currentQuestion,
  options,
  correctOptionIds,
  isAnswerRevealed,
  liveStats,
  session,
}: {
  displayState: DisplayState | null
  currentQuestion: Question | null
  options: QuestionOptionPublic[]
  correctOptionIds: string[]
  isAnswerRevealed: boolean
  liveStats: LiveStats | null
  session: unknown
}) {
  const windowState = displayState?.answer_window_state ?? 'closed'

  if (!currentQuestion) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <svg className="w-12 h-12 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="font-display text-4xl text-white font-bold mb-2">
            {displayState?.answer_window_state === undefined ? 'Welcome' : 'Standby'}
          </h2>
          <p className="text-white/40 text-lg font-body">
            {displayState ? 'Admin is preparing the next question...' : 'Waiting for session to start...'}
          </p>
        </div>
        {session && (
          <div className="text-center mt-4">
            <p className="text-white/30 text-sm font-body">Join with code:</p>
            <p className="text-[var(--ij-gold)] font-mono font-bold text-4xl tracking-widest mt-1">
              {(session as { session_code?: string }).session_code}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-6 p-6 overflow-hidden">
      {/* LEFT: Question + Answers */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Window state badge */}
        <div className="flex items-center justify-between">
          <div className={`
            inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider font-body
            ${windowState === 'open'
              ? 'bg-green-500/20 text-green-300 border border-green-400/30'
              : windowState === 'locked'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
              : 'bg-white/10 text-white/50 border border-white/10'
            }
          `}>
            {windowState === 'open' && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            {windowState === 'open' ? 'Answering Open' : windowState === 'locked' ? '🔒 Locked' : 'Preparing...'}
          </div>

          {/* Answer progress */}
          {liveStats && (
            <div className="text-white/50 text-sm font-body">
              {liveStats.answered_count} / {liveStats.total_participants} answered
            </div>
          )}
        </div>

        {/* Question text */}
        <div className="bg-white/8 backdrop-blur rounded-2xl border border-white/10 p-6 flex-shrink-0">
          <p className="screen-question text-white font-display font-semibold leading-snug">
            {currentQuestion.question_text}
          </p>
          {currentQuestion.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentQuestion.image_url}
              alt="Question"
              className="mt-4 rounded-xl max-h-48 object-contain"
            />
          )}
        </div>

        {/* Answer options grid */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          {options.map((opt, idx) => {
            const color = OPTION_COLORS[idx % OPTION_COLORS.length]
            const isCorrect = isAnswerRevealed && correctOptionIds.includes(opt.id)
            const statForOpt = liveStats?.answer_distribution.find(d => d.option_id === opt.id)

            return (
              <div
                key={opt.id}
                className={`
                  relative overflow-hidden rounded-xl border-2 flex items-center gap-4 p-4 transition-all duration-500
                  ${isCorrect
                    ? 'border-green-400 bg-green-500/20 animate-reveal-glow'
                    : isAnswerRevealed
                    ? 'border-white/10 bg-white/5 opacity-50'
                    : `${color.border} ${color.bg}`
                  }
                `}
              >
                {/* Progress bar underlay */}
                {statForOpt && displayState?.show_distribution && (
                  <div
                    className="absolute inset-0 bg-white/5 transition-all duration-700"
                    style={{ width: `${statForOpt.percentage}%` }}
                  />
                )}

                <div className={`
                  flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                  font-mono font-bold text-lg text-white relative z-10
                  ${isCorrect ? 'bg-green-500' : color.label}
                `}>
                  {opt.option_label}
                </div>

                <div className="flex-1 min-w-0 relative z-10">
                  <span className={`
                    screen-answer font-body font-medium leading-tight block
                    ${isCorrect ? 'text-green-200' : isAnswerRevealed ? 'text-white/40' : 'text-white'}
                  `}>
                    {opt.option_text}
                  </span>
                </div>

                {/* Count badge */}
                {statForOpt && displayState?.show_distribution && (
                  <div className="flex-shrink-0 text-right relative z-10">
                    <div className="text-white font-mono font-bold text-xl">{statForOpt.percentage}%</div>
                    <div className="text-white/40 text-xs">{statForOpt.count}</div>
                  </div>
                )}

                {isCorrect && (
                  <div className="flex-shrink-0 text-2xl relative z-10">✓</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Fastest answer spotlight */}
        {isAnswerRevealed && displayState?.show_fastest && liveStats?.fastest_answer && (
          <div className="bg-[var(--ij-gold)]/20 border border-[var(--ij-gold)]/40 rounded-xl px-5 py-3 flex items-center gap-3 animate-slide-up">
            <span className="text-2xl">⚡</span>
            <div>
              <span className="text-[var(--ij-gold-light)] font-bold text-lg font-display">
                {liveStats.fastest_answer.participant_name}
              </span>
              <span className="text-white/50 text-sm font-body ml-2">
                first correct in {(liveStats.fastest_answer.response_ms / 1000).toFixed(2)}s
              </span>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Timer + Stats sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-4">
        {/* Timer */}
        {displayState && windowState !== 'closed' && (
          <div className="bg-white/8 border border-white/10 rounded-2xl p-4 flex items-center justify-center">
            <CountdownTimer
              timerStartedAt={displayState.timer_started_at}
              timerDurationSeconds={displayState.timer_duration_seconds}
              timerPausedAt={displayState.timer_paused_at}
              variant="screen"
            />
          </div>
        )}

        {/* Live answer progress */}
        {liveStats && (
          <div className="bg-white/8 border border-white/10 rounded-2xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider font-body mb-3">Responses</p>
            <div className="text-center">
              <div className="font-mono font-bold text-4xl text-white">
                {liveStats.answered_count}
              </div>
              <div className="text-white/40 text-sm font-body">
                of {liveStats.total_participants}
              </div>
            </div>
            <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--ij-gold)] rounded-full transition-all duration-500"
                style={{
                  width: liveStats.total_participants > 0
                    ? `${(liveStats.answered_count / liveStats.total_participants) * 100}%`
                    : '0%'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LeaderboardScreen({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  return (
    <div className="flex-1 flex flex-col px-12 py-6 overflow-hidden animate-fade-in">
      <h2 className="font-display text-4xl font-bold text-white mb-6 text-center">
        <span className="gold-shimmer">🏆 Leaderboard</span>
      </h2>
      <div className="flex-1 overflow-y-auto">
        <Leaderboard entries={leaderboard} variant="screen" maxShow={10} />
      </div>
    </div>
  )
}

function SessionStatusBar({ displayState }: { displayState: DisplayState }) {
  const stateLabels: Record<string, string> = {
    hidden: 'Hidden',
    distribution_only: 'Distribution Visible',
    answer_revealed: 'Answer Revealed',
    leaderboard_revealed: 'Leaderboard',
  }

  return (
    <div className="text-white/30 text-xs font-body">
      Reveal: {stateLabels[displayState.reveal_state] ?? '—'}
    </div>
  )
}
