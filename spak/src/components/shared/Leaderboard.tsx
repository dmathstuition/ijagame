// src/components/shared/Leaderboard.tsx
'use client'

import type { LeaderboardEntry } from '@/lib/types'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  variant?: 'admin' | 'screen' | 'results'
  maxShow?: number
  highlight?: string // participant_id to highlight
}

const MEDAL_COLORS = {
  1: { bg: 'bg-yellow-400', text: 'text-yellow-900', ring: 'ring-yellow-300', label: '🥇' },
  2: { bg: 'bg-slate-300', text: 'text-slate-800', ring: 'ring-slate-200', label: '🥈' },
  3: { bg: 'bg-amber-600', text: 'text-amber-100', ring: 'ring-amber-400', label: '🥉' },
}

export function Leaderboard({
  entries,
  variant = 'admin',
  maxShow = 10,
  highlight,
}: LeaderboardProps) {
  const isScreen = variant === 'screen'
  const isResults = variant === 'results'
  const displayEntries = entries.slice(0, maxShow)

  if (!entries.length) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p className="text-lg">No scores yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {displayEntries.map((entry, idx) => {
        const medal = MEDAL_COLORS[entry.rank as keyof typeof MEDAL_COLORS]
        const isHighlighted = highlight && entry.participant_id === highlight
        const isTop3 = entry.rank <= 3

        return (
          <div
            key={entry.participant_id}
            className={`
              flex items-center gap-3 rounded-xl transition-all duration-300
              ${isScreen ? 'px-5 py-3.5' : 'px-4 py-2.5'}
              ${isHighlighted
                ? 'bg-[var(--ij-gold-pale)] border-2 border-[var(--ij-gold)] ring-4 ring-[var(--ij-gold)] ring-opacity-30'
                : isTop3 && isScreen
                ? 'bg-white/10 border border-white/20'
                : 'bg-white border border-slate-100 hover:border-slate-200'
              }
              animate-slide-up
            `}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Rank */}
            <div
              className={`
                flex-shrink-0 rounded-lg flex items-center justify-center font-mono font-bold
                ${isScreen ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm'}
                ${medal
                  ? `${medal.bg} ${medal.text}`
                  : 'bg-slate-100 text-slate-600'
                }
              `}
            >
              {medal ? medal.label : `#${entry.rank}`}
            </div>

            {/* Name / Team */}
            <div className="flex-1 min-w-0">
              <div
                className={`
                  font-body font-semibold truncate
                  ${isScreen ? 'text-xl text-white' : 'text-sm text-navy'}
                  ${isHighlighted ? 'text-[var(--ij-navy)]' : ''}
                `}
              >
                {entry.display_name}
              </div>
              {entry.team_name && (
                <div className={`truncate ${isScreen ? 'text-sm text-white/60' : 'text-xs text-slate-500'}`}>
                  {entry.team_name}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {!isScreen && (
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-slate-400">Correct</div>
                  <div className="text-sm font-semibold text-emerald-600">{entry.correct_count}</div>
                </div>
              )}
              {!isScreen && entry.avg_response_ms && (
                <div className="text-right hidden md:block">
                  <div className="text-xs text-slate-400">Avg Time</div>
                  <div className="text-sm font-mono text-slate-600">
                    {(entry.avg_response_ms / 1000).toFixed(1)}s
                  </div>
                </div>
              )}

              {/* Score - most prominent */}
              <div
                className={`
                  text-right font-display font-bold
                  ${isScreen ? 'text-3xl text-[var(--ij-gold-light)]' : 'text-lg text-[var(--ij-navy)]'}
                  ${isHighlighted ? 'text-[var(--ij-gold)]' : ''}
                `}
              >
                {entry.total_score.toFixed(entry.total_score % 1 !== 0 ? 1 : 0)}
                {!isScreen && <span className="text-xs font-body text-slate-400 ml-0.5">pts</span>}
              </div>
            </div>
          </div>
        )
      })}

      {entries.length > maxShow && (
        <p className={`text-center ${isScreen ? 'text-white/50 text-sm' : 'text-slate-400 text-xs'} py-2`}>
          + {entries.length - maxShow} more participants
        </p>
      )}
    </div>
  )
}
