'use client'
// src/app/admin/live/[sessionId]/page.tsx
// Admin live session control panel

import { useState, useEffect, useCallback, use } from 'react'
import { useSessionRealtime } from '@/hooks/useSessionRealtime'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { AnswerDistributionChart } from '@/components/shared/AnswerDistribution'
import { Leaderboard } from '@/components/shared/Leaderboard'
import { BrandHeaderDark } from '@/components/shared/BrandHeader'
import type { Round, Question, Session, DisplayState, LeaderboardEntry, LiveStats, AuditLog } from '@/lib/types'
import { getSupabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'

type ControlAction =
  | 'start_session' | 'pause_session' | 'resume_session' | 'end_session'
  | 'open_answering' | 'lock_answering' | 'reveal_answer' | 'reveal_distribution'
  | 'reveal_leaderboard' | 'next_question' | 'prev_question' | 'start_round'

export default function AdminLivePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  const [rounds, setRounds] = useState<Round[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [isControlling, setIsControlling] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'control' | 'participants' | 'audit'>('control')

  const { displayState, session, participants, isConnected, latestLeaderboard } = useSessionRealtime({
    sessionId,
  })

  // Load rounds
  useEffect(() => {
    const supabase = getSupabaseClient()
    supabase
      .from('rounds')
      .select('*, questions(*)')
      .eq('session_id', sessionId)
      .order('order_index')
      .then(({ data }) => {
        if (data) {
          const rs = data as Round[]
          setRounds(rs)
          // Set current round from display state or first
          if (displayState?.current_round_id) {
            const r = rs.find(r => r.id === displayState.current_round_id)
            if (r) setCurrentRound(r)
          } else if (rs.length > 0) {
            setCurrentRound(rs[0])
          }
        }
      })
  }, [sessionId, displayState?.current_round_id])

  // Update current question from display state
  useEffect(() => {
    if (!displayState?.current_question_id || !currentRound) return
    const q = currentRound.questions?.find(q => q.id === displayState.current_question_id)
    if (q) setCurrentQuestion(q)
  }, [displayState?.current_question_id, currentRound])

  // Fetch live stats
  useEffect(() => {
    if (!displayState) return
    const fetchStats = async () => {
      const res = await fetch(`/api/sessions/${sessionId}/live-stats`)
      if (res.ok) setLiveStats(await res.json())
    }
    fetchStats()
    const interval = setInterval(fetchStats, 2000)
    return () => clearInterval(interval)
  }, [sessionId, displayState?.answer_window_state])

  // Update leaderboard
  useEffect(() => {
    if (latestLeaderboard?.snapshot_data) {
      setLeaderboard(latestLeaderboard.snapshot_data as LeaderboardEntry[])
    }
  }, [latestLeaderboard])

  // Fetch audit logs
  useEffect(() => {
    const supabase = getSupabaseClient()
    supabase
      .from('audit_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setAuditLogs((data ?? []) as AuditLog[]))
  }, [sessionId, displayState?.updated_at])

  const sendControl = useCallback(async (action: ControlAction, payload?: Record<string, unknown>) => {
    setIsControlling(true)
    setControlError(null)

    try {
      const res = await fetch('/api/sessions/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, session_id: sessionId, payload }),
      })

      const data = await res.json()
      if (!res.ok) {
        setControlError(data.error ?? 'Control action failed')
      }
    } catch {
      setControlError('Network error')
    } finally {
      setIsControlling(false)
    }
  }, [sessionId])

  const handleNextQuestion = useCallback(() => {
    if (!currentRound?.questions) return
    const sortedQs = [...(currentRound.questions)].sort((a, b) => a.order_index - b.order_index)
    const nextIdx = currentQuestionIndex + 1

    if (nextIdx >= sortedQs.length) {
      // Move to next round?
      const roundIdx = rounds.findIndex(r => r.id === currentRound.id)
      const nextRound = rounds[roundIdx + 1]
      if (nextRound) {
        sendControl('start_round', { round_id: nextRound.id })
        setCurrentRound(nextRound)
        setCurrentQuestionIndex(0)
      }
      return
    }

    const nextQ = sortedQs[nextIdx]
    setCurrentQuestionIndex(nextIdx)
    sendControl('next_question', {
      round_id: currentRound.id,
      question_id: nextQ.id,
    })
  }, [currentRound, currentQuestionIndex, rounds, sendControl])

  const handleOpenAnswering = useCallback(() => {
    if (!currentQuestion || !currentRound) return
    const timeLimitSeconds = currentQuestion.time_limit_seconds ?? currentRound.time_limit_seconds ?? 30
    sendControl('open_answering', {
      current_question_id: currentQuestion.id,
      timer_seconds: timeLimitSeconds,
    })
  }, [currentQuestion, currentRound, sendControl])

  const windowState = displayState?.answer_window_state ?? 'closed'
  const sessionStatus = session?.status ?? 'draft'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-[var(--ij-navy)] text-white px-6 py-3 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-white/60 hover:text-white text-sm">
            ← Dashboard
          </Link>
          <BrandHeaderDark size="sm" className="[&_h1]:text-white [&_p]:text-[var(--ij-gold-light)]" />
          {session && (
            <div className="ml-4 pl-4 border-l border-white/20">
              <div className="text-white font-semibold text-sm">{session.title}</div>
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-xs font-mono">{session.session_code}</span>
                <SessionStatusPill status={sessionStatus} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-white/40 text-xs">Participants</div>
            <div className="text-white font-mono font-bold">{liveStats?.total_participants ?? 0}</div>
          </div>
          <div className="text-right">
            <div className="text-white/40 text-xs">Online</div>
            <div className="text-green-400 font-mono font-bold">{liveStats?.online_participants ?? 0}</div>
          </div>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />

          {/* Screen link */}
          <a
            href={`/screen/${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-[var(--ij-gold)] text-white rounded-lg text-xs font-semibold hover:brightness-110"
          >
            Open Screen ↗
          </a>
        </div>
      </header>

      {/* Error bar */}
      {controlError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-red-700 text-sm flex items-center justify-between">
          <span>⚠️ {controlError}</span>
          <button onClick={() => setControlError(null)} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Main grid */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Session controls */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-y-auto flex-shrink-0">
          {/* Session lifecycle */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Session Control</p>
            <div className="grid grid-cols-2 gap-2">
              {sessionStatus === 'draft' && (
                <button
                  className="col-span-2 admin-btn bg-green-600 text-white hover:bg-green-700"
                  onClick={() => sendControl('start_session')}
                  disabled={isControlling}
                >
                  ▶ Start Session
                </button>
              )}
              {sessionStatus === 'lobby' && (
                <button
                  className="col-span-2 admin-btn bg-green-600 text-white hover:bg-green-700"
                  onClick={() => sendControl('start_session')}
                  disabled={isControlling}
                >
                  ▶ Start Session
                </button>
              )}
              {sessionStatus === 'active' && (
                <>
                  <button
                    className="admin-btn bg-amber-500 text-white hover:bg-amber-600"
                    onClick={() => sendControl('pause_session')}
                    disabled={isControlling}
                  >
                    ⏸ Pause
                  </button>
                  <button
                    className="admin-btn bg-red-600 text-white hover:bg-red-700"
                    onClick={() => confirm('End this session?') && sendControl('end_session')}
                    disabled={isControlling}
                  >
                    ⏹ End
                  </button>
                </>
              )}
              {sessionStatus === 'paused' && (
                <>
                  <button
                    className="admin-btn bg-green-600 text-white hover:bg-green-700"
                    onClick={() => sendControl('resume_session')}
                    disabled={isControlling}
                  >
                    ▶ Resume
                  </button>
                  <button
                    className="admin-btn bg-red-600 text-white hover:bg-red-700"
                    onClick={() => confirm('End this session?') && sendControl('end_session')}
                    disabled={isControlling}
                  >
                    ⏹ End
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Answering control */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Answering</p>
            <div className="space-y-2">
              <button
                className={`w-full admin-btn ${windowState === 'open' ? 'bg-slate-200 text-slate-500' : 'bg-green-600 text-white hover:bg-green-700'}`}
                onClick={handleOpenAnswering}
                disabled={isControlling || windowState === 'open' || !currentQuestion || sessionStatus !== 'active'}
              >
                🔓 Open Answering
              </button>
              <button
                className={`w-full admin-btn ${windowState !== 'open' ? 'bg-slate-200 text-slate-500' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                onClick={() => sendControl('lock_answering')}
                disabled={isControlling || windowState !== 'open'}
              >
                🔒 Lock Answering
              </button>
            </div>
          </div>

          {/* Reveal controls */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Reveal</p>
            <div className="space-y-2">
              <button
                className="w-full admin-btn border border-slate-200 bg-white text-navy hover:bg-slate-50"
                onClick={() => sendControl('reveal_distribution')}
                disabled={isControlling || windowState === 'open'}
              >
                📊 Show Distribution
              </button>
              <button
                className="w-full admin-btn bg-[var(--ij-navy)] text-white hover:bg-[var(--ij-navy-deep)]"
                onClick={() => currentQuestion && sendControl('reveal_answer', { question_id: currentQuestion.id })}
                disabled={isControlling || windowState === 'open' || !currentQuestion}
              >
                ✓ Reveal Answer
              </button>
              <button
                className="w-full admin-btn bg-[var(--ij-gold)] text-white hover:brightness-110"
                onClick={() => sendControl('reveal_leaderboard', { round_id: currentRound?.id, question_id: currentQuestion?.id })}
                disabled={isControlling}
              >
                🏆 Show Leaderboard
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Navigation</p>
            <button
              className="w-full admin-btn bg-[var(--ij-navy)] text-white hover:bg-[var(--ij-navy-deep)]"
              onClick={handleNextQuestion}
              disabled={isControlling || sessionStatus !== 'active'}
            >
              Next Question →
            </button>
          </div>

          {/* Round selector */}
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Rounds</p>
            <div className="space-y-1">
              {rounds.map((round) => (
                <button
                  key={round.id}
                  onClick={() => {
                    setCurrentRound(round)
                    setCurrentQuestionIndex(0)
                    sendControl('start_round', { round_id: round.id })
                  }}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg text-sm font-body transition-colors
                    ${currentRound?.id === round.id
                      ? 'bg-[var(--ij-navy)] text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                    }
                  `}
                >
                  <div className="font-semibold">{round.title}</div>
                  <div className={`text-xs mt-0.5 ${currentRound?.id === round.id ? 'text-white/60' : 'text-slate-400'}`}>
                    {round.mode.replace('_', ' ')} · {round.questions?.length ?? 0}Q
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: Live state */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-slate-200 bg-white px-6 flex gap-0">
            {(['control', 'participants', 'audit'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-3 text-sm font-semibold font-body border-b-2 transition-colors capitalize
                  ${activeTab === tab
                    ? 'border-[var(--ij-navy)] text-[var(--ij-navy)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                  }
                `}
              >
                {tab === 'control' ? 'Live Control' : tab === 'participants' ? `Participants (${liveStats?.total_participants ?? 0})` : 'Audit Log'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'control' && (
              <LiveControlTab
                displayState={displayState}
                currentQuestion={currentQuestion}
                currentRound={currentRound}
                liveStats={liveStats}
              />
            )}
            {activeTab === 'participants' && (
              <ParticipantsTab participants={Array.from(participants.values())} />
            )}
            {activeTab === 'audit' && (
              <AuditTab logs={auditLogs} />
            )}
          </div>
        </div>

        {/* RIGHT: Leaderboard */}
        <div className="w-72 bg-white border-l border-slate-200 overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leaderboard</p>
          </div>
          <div className="p-4">
            <Leaderboard entries={leaderboard} variant="admin" maxShow={15} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LiveControlTab({
  displayState,
  currentQuestion,
  currentRound,
  liveStats,
}: {
  displayState: DisplayState | null
  currentQuestion: Question | null
  currentRound: Round | null
  liveStats: LiveStats | null
}) {
  return (
    <div className="space-y-6">
      {/* Current state overview */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Answered" value={liveStats?.answered_count ?? 0} sub={`of ${liveStats?.total_participants ?? 0}`} />
        <StatCard label="Unanswered" value={liveStats?.unanswered_count ?? 0} />
        <StatCard
          label="Window"
          value={displayState?.answer_window_state ?? '—'}
          badge
          badgeColor={displayState?.answer_window_state === 'open' ? 'green' : displayState?.answer_window_state === 'locked' ? 'amber' : 'gray'}
        />
      </div>

      {/* Current question */}
      {currentQuestion ? (
        <div className="ij-card p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Current Question</p>
            {currentRound && (
              <span className="text-xs bg-[var(--ij-navy)] text-white px-2 py-0.5 rounded font-body">
                {currentRound.title}
              </span>
            )}
          </div>
          <p className="font-display font-semibold text-navy text-lg leading-snug">
            {currentQuestion.question_text}
          </p>

          {/* Timer */}
          {displayState && (
            <div className="mt-4 flex items-center gap-3">
              <CountdownTimer
                timerStartedAt={displayState.timer_started_at}
                timerDurationSeconds={displayState.timer_duration_seconds}
                timerPausedAt={displayState.timer_paused_at}
                variant="admin"
              />
              <div className={`status-badge ${displayState.reveal_state}`}>
                {displayState.reveal_state.replace('_', ' ')}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="ij-card p-8 text-center text-slate-400">
          <p>No question selected. Open answering to activate a question.</p>
        </div>
      )}

      {/* Answer distribution */}
      {liveStats && liveStats.answer_distribution.length > 0 && (
        <div className="ij-card p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Answer Distribution</p>
          <AnswerDistributionChart
            distribution={liveStats.answer_distribution}
            totalAnswered={liveStats.answered_count}
            revealed={displayState?.reveal_state === 'answer_revealed' || displayState?.reveal_state === 'leaderboard_revealed'}
            variant="admin"
          />
        </div>
      )}

      {/* Fastest answer */}
      {liveStats?.fastest_answer && (
        <div className="ij-card p-4 bg-amber-50 border-amber-200">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">⚡ Fastest Correct Answer</p>
          <p className="font-display font-bold text-navy text-lg">{liveStats.fastest_answer.participant_name}</p>
          <p className="text-slate-500 text-sm">{(liveStats.fastest_answer.response_ms / 1000).toFixed(2)}s</p>
        </div>
      )}
    </div>
  )
}

function ParticipantsTab({ participants }: { participants: import('@/lib/types').Participant[] }) {
  return (
    <div className="space-y-2">
      {participants.length === 0 && (
        <p className="text-slate-400 text-center py-8">No participants yet</p>
      )}
      {participants
        .sort((a, b) => b.total_score - a.total_score)
        .map((p) => (
          <div key={p.id} className="ij-card px-4 py-3 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.is_online ? 'bg-green-400' : 'bg-slate-300'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-navy text-sm truncate">{p.display_name}</div>
              <div className="text-xs text-slate-400">
                {p.correct_count}✓ {p.wrong_count}✗
                {p.is_eliminated && ' · Eliminated'}
              </div>
            </div>
            <div className="font-mono font-bold text-navy">{p.total_score}</div>
          </div>
        ))}
    </div>
  )
}

function AuditTab({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="space-y-2">
      {logs.length === 0 && (
        <p className="text-slate-400 text-center py-8">No audit logs yet</p>
      )}
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-slate-100">
          <div className="font-mono text-slate-400 text-xs flex-shrink-0 mt-0.5">
            {new Date(log.created_at).toLocaleTimeString()}
          </div>
          <div className="flex-1">
            <span className="font-semibold text-navy">{log.action.replace(/_/g, ' ')}</span>
            {log.entity_type && (
              <span className="text-slate-400 ml-2 text-xs">({log.entity_type})</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatCard({
  label, value, sub, badge, badgeColor,
}: {
  label: string
  value: string | number
  sub?: string
  badge?: boolean
  badgeColor?: 'green' | 'amber' | 'gray'
}) {
  const bgColors = { green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700', gray: 'bg-slate-100 text-slate-600' }

  return (
    <div className="ij-card p-4 text-center">
      <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">{label}</div>
      {badge ? (
        <div className={`inline-block px-2 py-1 rounded text-sm font-semibold capitalize ${bgColors[badgeColor ?? 'gray']}`}>
          {value}
        </div>
      ) : (
        <div className="font-mono font-bold text-2xl text-navy">{value}</div>
      )}
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function SessionStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-600',
    lobby: 'bg-blue-500',
    active: 'bg-green-500',
    paused: 'bg-amber-500',
    completed: 'bg-slate-500',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full text-white font-semibold capitalize ${colors[status] ?? 'bg-slate-500'}`}>
      {status}
    </span>
  )
}
