'use client'
// src/app/results/[sessionId]/page.tsx

import { useState, useEffect, use } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { BrandHeaderDark } from '@/components/shared/BrandHeader'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { Session, LeaderboardEntry, Participant } from '@/lib/types'

export default function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  const [session, setSession] = useState<Session | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()
    const participantId = localStorage.getItem('ij_participant_id')

    async function load() {
      const [{ data: sess }, { data: participants }, { data: snapshot }] = await Promise.all([
        supabase.from('sessions').select('*, competition:competitions(title)').eq('id', sessionId).single(),
        supabase.from('participants').select('*').eq('session_id', sessionId).order('total_score', { ascending: false }),
        supabase.from('leaderboard_snapshots').select('*').eq('session_id', sessionId).is('round_id', null).order('created_at', { ascending: false }).limit(1).single(),
      ])

      setSession(sess as Session)

      // Build leaderboard from snapshot or live data
      if (snapshot?.snapshot_data) {
        setLeaderboard(snapshot.snapshot_data as LeaderboardEntry[])
      } else if (participants) {
        setLeaderboard(
          participants.map((p, idx) => ({
            rank: idx + 1,
            participant_id: p.id,
            display_name: p.display_name,
            total_score: p.total_score,
            correct_count: p.correct_count,
            wrong_count: p.wrong_count,
            avg_response_ms: p.avg_response_ms,
          }))
        )
      }

      if (participantId) {
        const found = participants?.find(p => p.id === participantId)
        if (found) setMyParticipant(found as Participant)
      }

      setIsLoading(false)
    }

    load()
  }, [sessionId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--ij-navy)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    )
  }

  const myRank = leaderboard.find(e => e.participant_id === myParticipant?.id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--ij-navy-deep)] via-[var(--ij-navy)] to-[var(--ij-navy-mid)]">
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/10">
        <BrandHeaderDark size="md" className="[&_h1]:text-white [&_p]:text-[var(--ij-gold-light)]" />
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏆</div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">Final Results</h1>
          {session && (
            <p className="text-white/50 text-sm">{session.title}</p>
          )}
        </div>

        {/* My result card */}
        {myParticipant && myRank && (
          <div className="bg-[var(--ij-gold)]/20 border border-[var(--ij-gold)]/40 rounded-2xl p-6 mb-6 text-center animate-slide-up">
            <p className="text-[var(--ij-gold-light)] text-sm font-body mb-2">Your Result</p>
            <div className="font-display font-bold text-white text-2xl mb-1">{myParticipant.display_name}</div>
            <div className="flex items-center justify-center gap-6 mt-3">
              <div>
                <div className="font-mono font-bold text-3xl text-[var(--ij-gold)]">#{myRank.rank}</div>
                <div className="text-white/50 text-xs">Rank</div>
              </div>
              <div className="w-px h-12 bg-white/20" />
              <div>
                <div className="font-mono font-bold text-3xl text-white">{myParticipant.total_score}</div>
                <div className="text-white/50 text-xs">Points</div>
              </div>
              <div className="w-px h-12 bg-white/20" />
              <div>
                <div className="font-mono font-bold text-3xl text-white">{myParticipant.correct_count}</div>
                <div className="text-white/50 text-xs">Correct</div>
              </div>
            </div>
          </div>
        )}

        {/* Full leaderboard */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-display font-bold text-white text-lg mb-4">Leaderboard</h2>
          <Leaderboard
            entries={leaderboard}
            variant="results"
            maxShow={20}
            highlight={myParticipant?.id}
          />
        </div>

        {/* Export button (admin only — check localStorage role) */}
        <div className="mt-6 flex gap-3 justify-center">
          <a
            href={`/join`}
            className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors"
          >
            Join Another Session
          </a>
        </div>
      </main>
    </div>
  )
}
