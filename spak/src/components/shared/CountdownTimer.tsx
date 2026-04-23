// src/components/shared/CountdownTimer.tsx
'use client'

import { useCountdown } from '@/hooks/useSessionRealtime'

interface CountdownTimerProps {
  timerStartedAt: string | null
  timerDurationSeconds: number | null
  timerPausedAt: string | null
  variant?: 'participant' | 'admin' | 'screen'
  onExpire?: () => void
}

export function CountdownTimer({
  timerStartedAt,
  timerDurationSeconds,
  timerPausedAt,
  variant = 'participant',
  onExpire,
}: CountdownTimerProps) {
  const { timeLeft, isRunning } = useCountdown({
    timerStartedAt,
    timerDurationSeconds,
    timerPausedAt,
    onExpire,
  })

  if (timeLeft === null || timerDurationSeconds === null) {
    return null
  }

  const percentage = Math.max(0, Math.min(100, (timeLeft / timerDurationSeconds) * 100))
  const isWarning = timeLeft <= 10
  const isCritical = timeLeft <= 5

  const colorClass = isCritical
    ? 'text-red-600'
    : isWarning
    ? 'text-amber-600'
    : 'text-navy'

  // Stroke dash
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - percentage / 100)

  if (variant === 'screen') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative" style={{ width: 160, height: 160 }}>
          {/* Background ring */}
          <svg className="absolute inset-0 -rotate-90" width="160" height="160" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#C9922E'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`screen-timer font-mono font-bold text-white ${
                isCritical ? 'animate-timer-tick' : ''
              }`}
              style={{ fontSize: '3rem' }}
            >
              {timeLeft}
            </span>
          </div>
        </div>
        {!isRunning && timerPausedAt && (
          <span className="text-amber-400 text-sm font-semibold uppercase tracking-wider">Paused</span>
        )}
      </div>
    )
  }

  if (variant === 'admin') {
    return (
      <div className="flex items-center gap-2">
        <div className={`font-mono font-bold text-2xl tabular-nums ${colorClass}`}>
          {timeLeft}s
        </div>
        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-[var(--ij-navy)]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    )
  }

  // Participant variant
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 80 }}>
        <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(13,43,94,0.1)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={isCritical ? '#EF4444' : isWarning ? '#F59E0B' : 'var(--ij-navy)'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-mono font-bold text-xl tabular-nums ${colorClass} ${isCritical ? 'animate-timer-tick' : ''}`}>
            {timeLeft}
          </span>
        </div>
      </div>
      <span className="text-xs text-slate-500 mt-1">seconds</span>
    </div>
  )
}
