'use client'
// src/hooks/useSessionRealtime.ts

import { useEffect, useRef, useState, useCallback } from 'react'
import { SessionChannel } from '@/lib/realtime/session-channel'
import type {
  DisplayState,
  Session,
  Participant,
  LeaderboardSnapshot,
  ParticipantPresence,
  AdminPresence,
} from '@/lib/types'

type PresencePayload = ParticipantPresence | AdminPresence | null

interface UseSessionRealtimeOptions {
  sessionId: string
  presencePayload?: PresencePayload
  onDisplayStateChange?: (state: DisplayState) => void
  onSessionChange?: (session: Session) => void
  onAnswerSubmitted?: (payload: { question_id: string; participant_id: string }) => void
}

interface UseSessionRealtimeReturn {
  displayState: DisplayState | null
  session: Session | null
  participants: Map<string, Participant>
  latestLeaderboard: LeaderboardSnapshot | null
  onlineCount: number
  isConnected: boolean
  updateDisplayState: (state: DisplayState) => void
}

export function useSessionRealtime({
  sessionId,
  presencePayload,
  onDisplayStateChange,
  onSessionChange,
  onAnswerSubmitted,
}: UseSessionRealtimeOptions): UseSessionRealtimeReturn {
  const [displayState, setDisplayState] = useState<DisplayState | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map())
  const [latestLeaderboard, setLatestLeaderboard] = useState<LeaderboardSnapshot | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  const channelRef = useRef<SessionChannel | null>(null)

  const updateDisplayState = useCallback((state: DisplayState) => {
    setDisplayState(state)
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const channel = new SessionChannel(sessionId, {
      onDisplayStateChange: (state) => {
        setDisplayState(state)
        onDisplayStateChange?.(state)
      },
      onSessionChange: (s) => {
        setSession(s)
        onSessionChange?.(s)
      },
      onParticipantChange: (participant) => {
        setParticipants((prev) => {
          const next = new Map(prev)
          next.set(participant.id, participant)
          return next
        })
      },
      onLeaderboardChange: (snapshot) => {
        setLatestLeaderboard(snapshot)
      },
      onPresenceSync: (presences) => {
        const count = Object.keys(presences).length
        setOnlineCount(count)
        setIsConnected(true)
      },
      onPresenceJoin: () => {
        setOnlineCount((prev) => prev + 1)
      },
      onPresenceLeave: () => {
        setOnlineCount((prev) => Math.max(0, prev - 1))
      },
      onAnswerSubmitted,
    })

    channel.subscribe(presencePayload ?? undefined)
    channelRef.current = channel
    setIsConnected(true)

    return () => {
      channel.unsubscribe()
      channelRef.current = null
      setIsConnected(false)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    displayState,
    session,
    participants,
    latestLeaderboard,
    onlineCount,
    isConnected,
    updateDisplayState,
  }
}

// ============================================================
// COUNTDOWN TIMER HOOK
// ============================================================
// Server-authoritative: uses timer_started_at from display_state

interface UseCountdownOptions {
  timerStartedAt: string | null
  timerDurationSeconds: number | null
  timerPausedAt: string | null
  onExpire?: () => void
}

export function useCountdown({
  timerStartedAt,
  timerDurationSeconds,
  timerPausedAt,
  onExpire,
}: UseCountdownOptions) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    expiredRef.current = false

    if (!timerStartedAt || timerDurationSeconds == null) {
      setTimeLeft(null)
      setIsRunning(false)
      return
    }

    const calculateTimeLeft = () => {
      const start = new Date(timerStartedAt).getTime()
      const now = timerPausedAt ? new Date(timerPausedAt).getTime() : Date.now()
      const elapsed = (now - start) / 1000
      const remaining = Math.max(0, timerDurationSeconds - elapsed)
      return remaining
    }

    const initial = calculateTimeLeft()
    setTimeLeft(Math.ceil(initial))
    setIsRunning(!timerPausedAt && initial > 0)

    if (timerPausedAt || initial <= 0) return

    intervalRef.current = setInterval(() => {
      const remaining = calculateTimeLeft()
      const ceil = Math.ceil(remaining)
      setTimeLeft(ceil)

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        setIsRunning(false)
        clearInterval(intervalRef.current!)
        onExpire?.()
      }
    }, 200)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerStartedAt, timerDurationSeconds, timerPausedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  return { timeLeft, isRunning }
}

// ============================================================
// PARTICIPANT SESSION HOOK
// ============================================================

interface UseParticipantSessionOptions {
  sessionId: string
  participantId: string
  joinCode: string
}

export function useParticipantSession({
  sessionId,
  participantId,
  joinCode,
}: UseParticipantSessionOptions) {
  const presencePayload: ParticipantPresence = {
    participant_id: participantId,
    display_name: '',
    session_id: sessionId,
    joined_at: Date.now(),
  }

  return useSessionRealtime({
    sessionId,
    presencePayload,
  })
}
