// src/lib/realtime/session-channel.ts
// Manages realtime subscriptions for a competition session

import { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../supabase/client'
import type {
  DisplayState,
  Session,
  Participant,
  LeaderboardSnapshot,
  ParticipantPresence,
  AdminPresence,
} from '../types'

type PresenceState = ParticipantPresence | AdminPresence

interface SessionChannelCallbacks {
  onDisplayStateChange?: (state: DisplayState) => void
  onSessionChange?: (session: Session) => void
  onParticipantChange?: (participant: Participant) => void
  onLeaderboardChange?: (snapshot: LeaderboardSnapshot) => void
  onPresenceSync?: (presences: Record<string, PresenceState[]>) => void
  onPresenceJoin?: (key: string, presence: PresenceState) => void
  onPresenceLeave?: (key: string, presence: PresenceState) => void
  onAnswerSubmitted?: (payload: { question_id: string; participant_id: string }) => void
}

export class SessionChannel {
  private channel: RealtimeChannel | null = null
  private sessionId: string
  private callbacks: SessionChannelCallbacks
  private reconnectTimer: NodeJS.Timeout | null = null
  private isSubscribed = false

  constructor(sessionId: string, callbacks: SessionChannelCallbacks) {
    this.sessionId = sessionId
    this.callbacks = callbacks
  }

  subscribe(presencePayload?: PresenceState) {
    const supabase = getSupabaseClient()

    // Cleanup existing subscription
    this.unsubscribe()

    const channelName = `session:${this.sessionId}`

    this.channel = supabase
      .channel(channelName, {
        config: {
          presence: {
            key: presencePayload
              ? 'participant_id' in presencePayload
                ? presencePayload.participant_id
                : presencePayload.user_id
              : 'display',
          },
        },
      })
      // Display state changes (main driver of all 3 UIs)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'display_state',
          filter: `session_id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (payload.new && this.callbacks.onDisplayStateChange) {
            this.callbacks.onDisplayStateChange(payload.new as DisplayState)
          }
        }
      )
      // Session status changes
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (payload.new && this.callbacks.onSessionChange) {
            this.callbacks.onSessionChange(payload.new as Session)
          }
        }
      )
      // Participant changes (score updates, elimination)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (payload.new && this.callbacks.onParticipantChange) {
            this.callbacks.onParticipantChange(payload.new as Participant)
          }
        }
      )
      // Leaderboard snapshot changes
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leaderboard_snapshots',
          filter: `session_id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (payload.new && this.callbacks.onLeaderboardChange) {
            this.callbacks.onLeaderboardChange(payload.new as LeaderboardSnapshot)
          }
        }
      )
      // Answer submissions (for admin answer count tracking)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
          filter: `session_id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (payload.new && this.callbacks.onAnswerSubmitted) {
            this.callbacks.onAnswerSubmitted({
              question_id: (payload.new as { question_id: string }).question_id,
              participant_id: (payload.new as { participant_id: string }).participant_id,
            })
          }
        }
      )
      // Presence tracking
      .on('presence', { event: 'sync' }, () => {
        if (this.channel && this.callbacks.onPresenceSync) {
          const state = this.channel.presenceState() as Record<string, PresenceState[]>
          this.callbacks.onPresenceSync(state)
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (this.callbacks.onPresenceJoin && newPresences[0]) {
          this.callbacks.onPresenceJoin(key, newPresences[0] as PresenceState)
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (this.callbacks.onPresenceLeave && leftPresences[0]) {
          this.callbacks.onPresenceLeave(key, leftPresences[0] as PresenceState)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true
          if (presencePayload) {
            await this.channel?.track(presencePayload)
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.isSubscribed = false
          this.scheduleReconnect(presencePayload)
        }
      })

    return this
  }

  private scheduleReconnect(presencePayload?: PresenceState) {
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.isSubscribed) {
        this.subscribe(presencePayload)
      }
    }, 3000)
  }

  unsubscribe() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.channel) {
      const supabase = getSupabaseClient()
      supabase.removeChannel(this.channel)
      this.channel = null
      this.isSubscribed = false
    }
  }

  getPresenceState(): Record<string, PresenceState[]> {
    if (!this.channel) return {}
    return this.channel.presenceState() as Record<string, PresenceState[]>
  }
}
