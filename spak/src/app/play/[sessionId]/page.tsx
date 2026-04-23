'use client'
// src/app/play/[sessionId]/page.tsx
// Participant competition interface - mobile-first

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionRealtime, useCountdown } from '@/hooks/useSessionRealtime'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { BrandHeader } from '@/components/shared/BrandHeader'
import type { DisplayState, Question, QuestionOptionPublic, Participant } from '@/lib/types'
import { getSupabaseClient } from '@/lib/supabase/client'

const OPTION_STYLES = [
  { base: 'border-blue-300 bg-blue-50 text-blue-800', label: 'bg-blue-600 text-white', selected: 'ring-blue-400 border-blue-500' },
  { base: 'border-purple-300 bg-purple-50 text-purple-800', label: 'bg-purple-600 text-white', selected: 'ring-purple-400 border-purple-500' },
  { base: 'border-amber-300 bg-amber-50 text-amber-800', label: 'bg-amber-500 text-white', selected: 'ring-amber-400 border-amber-500' },
  { base: 'border-emerald-300 bg-emerald-50 text-emerald-800', label: 'bg-emerald-600 text-white', selected: 'ring-emerald-400 border-emerald-500' },
]

interface ParticipantState {
  joinCode: string
  participantId: string
  sessionId: string
  displayName: string
}

export default function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const router = useRouter()

  const [pState, setPState] = useState<ParticipantState | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<QuestionOptionPublic[]>([])
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [myAnswer, setMyAnswer] = useState<{ is_correct?: boolean; awarded_points?: number } | null>(null)
  const [score, setScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)

  // Load participant state from localStorage
  useEffect(() => {
    const joinCode = localStorage.getItem('ij_join_code')
    const participantId = localStorage.getItem('ij_participant_id')
    const storedSessionId = localStorage.getItem('ij_session_id')
    const displayName = localStorage.getItem('ij_display_name')

    if (!joinCode || !participantId || storedSessionId !== sessionId) {
      router.push(`/join?code=`)
      return
    }

    setPState({ joinCode, participantId, sessionId, displayName: displayName ?? 'Participant' })
  }, [sessionId, router])

  // Realtime subscription
  const { displayState, session, isConnected } = useSessionRealtime({
    sessionId,
    presencePayload: pState
      ? { participant_id: pState.participantId, display_name: pState.displayName, session_id: sessionId, joined_at: Date.now() }
      : undefined,
  })

  // Fetch question when display state changes
  useEffect(() => {
    if (!displayState?.current_question_id) {
      setCurrentQuestion(null)
      setOptions([])
      return
    }

    // Reset answer state when question changes
    setSelectedOptionId(null)
    setHasSubmitted(false)
    setMyAnswer(null)
    setSubmitError(null)

    // Check if we already answered this question
    async function fetchQuestion() {
      const supabase = getSupabaseClient()

      const { data: question } = await supabase
        .from('questions')
        .select('*')
        .eq('id', displayState!.current_question_id!)
        .single()

      if (!question) return

      const { data: opts } = await supabase
        .from('question_options')
        .select('id, option_label, option_text, order_index')
        .eq('question_id', displayState!.current_question_id!)
        .order('order_index')

      setCurrentQuestion(question as Question)
      setOptions(opts ?? [])

      // Check for existing answer
      if (pState?.participantId) {
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('selected_option_id, is_correct, awarded_points')
          .eq('participant_id', pState.participantId)
          .eq('question_id', displayState!.current_question_id!)
          .single()

        if (existingAnswer) {
          setSelectedOptionId(existingAnswer.selected_option_id)
          setHasSubmitted(true)
          if (existingAnswer.is_correct !== null) {
            setMyAnswer({ is_correct: existingAnswer.is_correct, awarded_points: existingAnswer.awarded_points })
          }
        }
      }
    }

    fetchQuestion()
  }, [displayState?.current_question_id, pState?.participantId])

  // Fetch my score
  useEffect(() => {
    if (!pState?.participantId) return

    const supabase = getSupabaseClient()
    supabase
      .from('participants')
      .select('total_score, correct_count')
      .eq('id', pState.participantId)
      .single()
      .then(({ data }) => {
        if (data) {
          setScore(data.total_score)
          setCorrectCount(data.correct_count)
        }
      })
  }, [displayState?.reveal_state, pState?.participantId])

  const handleSubmit = useCallback(async (optionId: string) => {
    if (!pState || hasSubmitted || displayState?.answer_window_state !== 'open') return

    setSelectedOptionId(optionId)
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/answers/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: displayState.current_question_id,
          selected_option_id: optionId,
          participant_join_code: pState.joinCode,
          client_timestamp: Date.now(),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setHasSubmitted(true)
      } else {
        if (data.code === 'DUPLICATE_SUBMISSION') {
          setHasSubmitted(true)
        } else {
          setSubmitError(data.error ?? 'Failed to submit')
          setSelectedOptionId(null)
        }
      }
    } catch {
      setSubmitError('Network error. Please try again.')
      setSelectedOptionId(null)
    } finally {
      setIsSubmitting(false)
    }
  }, [pState, hasSubmitted, displayState])

  // Determine answer reveal state
  const isAnswerRevealed = displayState?.reveal_state === 'answer_revealed' || displayState?.reveal_state === 'leaderboard_revealed'

  // Get option correctness info from the correct answer being shown in display state
  async function getCorrectOptionId(): Promise<string | null> {
    if (!currentQuestion || !isAnswerRevealed) return null
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('question_options')
      .select('id')
      .eq('question_id', currentQuestion.id)
      .eq('is_correct', true)
      .single()
    return data?.id ?? null
  }

  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null)
  useEffect(() => {
    if (isAnswerRevealed && currentQuestion) {
      getCorrectOptionId().then(setCorrectOptionId)
    } else {
      setCorrectOptionId(null)
    }
  }, [isAnswerRevealed, currentQuestion?.id])

  const windowState = displayState?.answer_window_state ?? 'closed'

  if (!pState) {
    return (
      <div className="min-h-screen bg-[var(--ij-navy)] flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--ij-navy-deep)] to-[var(--ij-navy)] flex flex-col">
      {/* Top bar */}
      <header className="bg-[var(--ij-navy-deep)]/80 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <BrandHeader size="sm" />
        <div className="flex items-center gap-3">
          {/* Score */}
          <div className="text-right">
            <div className="text-white/60 text-xs font-body">Score</div>
            <div className="text-[var(--ij-gold)] font-mono font-bold text-lg leading-tight">
              {score}
            </div>
          </div>

          {/* Connection indicator */}
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col px-4 py-5 max-w-lg mx-auto w-full">

        {/* Session name */}
        {session && (
          <div className="mb-4">
            <p className="text-white/50 text-xs font-body uppercase tracking-wider">
              {(session as unknown as { competition?: { title?: string } }).competition?.title ?? 'Competition'}
            </p>
            <p className="text-white/80 text-sm font-body">{session.title}</p>
          </div>
        )}

        {/* STATUS BAR */}
        <StatusBadge
          windowState={windowState}
          hasSubmitted={hasSubmitted}
          isAnswerRevealed={isAnswerRevealed}
        />

        {/* TIMER */}
        {displayState && windowState === 'open' && !hasSubmitted && (
          <div className="flex justify-center my-5">
            <CountdownTimer
              timerStartedAt={displayState.timer_started_at}
              timerDurationSeconds={displayState.timer_duration_seconds}
              timerPausedAt={displayState.timer_paused_at}
              variant="participant"
            />
          </div>
        )}

        {/* QUESTION */}
        {currentQuestion ? (
          <div className="space-y-4 flex-1 flex flex-col">
            {/* Question text */}
            <div className="bg-white rounded-2xl p-5 shadow-lg border border-white/10">
              <p className="font-body text-navy font-medium leading-relaxed text-base">
                {currentQuestion.question_text}
              </p>
              {currentQuestion.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentQuestion.image_url}
                  alt="Question image"
                  className="mt-3 rounded-lg w-full object-cover max-h-48"
                />
              )}
            </div>

            {/* Answer options */}
            <div className="space-y-3 stagger-children">
              {options.map((opt, idx) => {
                const style = OPTION_STYLES[idx % OPTION_STYLES.length]
                const isSelected = selectedOptionId === opt.id
                const isCorrect = isAnswerRevealed && correctOptionId === opt.id
                const isWrong = isAnswerRevealed && isSelected && correctOptionId !== opt.id
                const isDisabled = hasSubmitted || windowState !== 'open' || isSubmitting

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSubmit(opt.id)}
                    disabled={isDisabled}
                    className={`
                      answer-btn
                      ${isCorrect
                        ? 'correct'
                        : isWrong
                        ? 'incorrect'
                        : isSelected
                        ? `${style.base} ring-4 ${style.selected} scale-[1.01]`
                        : style.base
                      }
                      ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]'}
                    `}
                  >
                    <div className={`answer-label ${isCorrect ? 'bg-green-500 text-white' : isWrong ? 'bg-red-400 text-white' : style.label}`}>
                      {opt.option_label}
                    </div>
                    <span className="font-body text-sm font-medium flex-1 text-left">
                      {opt.option_text}
                    </span>
                    {isSelected && !isAnswerRevealed && (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isCorrect && (
                      <span className="text-green-600 font-bold text-lg">✓</span>
                    )}
                    {isWrong && (
                      <span className="text-red-500 font-bold text-lg">✗</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Submission feedback */}
            {hasSubmitted && !isAnswerRevealed && (
              <div className="bg-white/10 rounded-xl p-4 text-center animate-slide-up">
                <p className="text-white font-semibold">Answer submitted ✓</p>
                <p className="text-white/60 text-sm mt-1">Waiting for admin to reveal...</p>
              </div>
            )}

            {/* Answer revealed feedback */}
            {isAnswerRevealed && hasSubmitted && correctOptionId && (
              <div className={`rounded-xl p-4 text-center animate-reveal-glow animate-slide-up ${
                selectedOptionId === correctOptionId
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}>
                <p className="font-bold text-lg">
                  {selectedOptionId === correctOptionId ? '🎉 Correct!' : '✗ Wrong answer'}
                </p>
                {selectedOptionId === correctOptionId && (
                  <p className="text-sm opacity-90 mt-1">
                    +{myAnswer?.awarded_points ?? 0} points
                  </p>
                )}
              </div>
            )}

            {/* Error message */}
            {submitError && (
              <div className="bg-red-100 text-red-700 rounded-lg p-3 text-sm text-center">
                {submitError}
              </div>
            )}
          </div>
        ) : (
          /* Waiting state */
          <WaitingState windowState={windowState} session={session} displayState={displayState} />
        )}
      </main>

      {/* Bottom safe area spacer */}
      <div className="h-6" />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({
  windowState,
  hasSubmitted,
  isAnswerRevealed,
}: {
  windowState: string
  hasSubmitted: boolean
  isAnswerRevealed: boolean
}) {
  if (isAnswerRevealed) {
    return <div className="status-badge revealed mx-auto mb-3">Answer Revealed</div>
  }
  if (hasSubmitted) {
    return <div className="status-badge submitted mx-auto mb-3">✓ Submitted — Waiting</div>
  }
  if (windowState === 'open') {
    return (
      <div className="status-badge active mx-auto mb-3">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        Answer Now!
      </div>
    )
  }
  if (windowState === 'locked') {
    return <div className="status-badge locked mx-auto mb-3">🔒 Answering Closed</div>
  }
  return <div className="status-badge waiting mx-auto mb-3">Waiting for question...</div>
}

function WaitingState({
  windowState,
  session,
  displayState,
}: {
  windowState: string
  session: unknown
  displayState: DisplayState | null
}) {
  if (displayState?.reveal_state === 'leaderboard_revealed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8 animate-fade-in">
        <div className="text-6xl">🏆</div>
        <h2 className="font-display text-2xl text-white font-bold">Leaderboard</h2>
        <p className="text-white/60 text-sm">Check the main screen to see rankings</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12">
      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h3 className="text-white font-semibold text-lg">Waiting for next question</h3>
        <p className="text-white/50 text-sm mt-1">Stay ready! The admin will open answering soon.</p>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-white/30 animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
