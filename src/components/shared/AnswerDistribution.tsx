// src/components/shared/AnswerDistribution.tsx
'use client'

import type { AnswerDistribution } from '@/lib/types'

interface AnswerDistributionProps {
  distribution: AnswerDistribution[]
  totalAnswered: number
  revealed: boolean
  variant?: 'admin' | 'screen'
}

const OPTION_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  A: { bg: 'bg-blue-50', bar: 'bg-blue-600', text: 'text-blue-700' },
  B: { bg: 'bg-purple-50', bar: 'bg-purple-600', text: 'text-purple-700' },
  C: { bg: 'bg-amber-50', bar: 'bg-amber-500', text: 'text-amber-700' },
  D: { bg: 'bg-emerald-50', bar: 'bg-emerald-600', text: 'text-emerald-700' },
}

export function AnswerDistributionChart({
  distribution,
  totalAnswered,
  revealed,
  variant = 'admin',
}: AnswerDistributionProps) {
  if (!distribution.length) {
    return (
      <div className="text-center text-slate-400 py-4 text-sm">
        No answers yet
      </div>
    )
  }

  const isScreen = variant === 'screen'

  return (
    <div className={`space-y-3 ${isScreen ? 'space-y-4' : ''}`}>
      {distribution.map((item) => {
        const colors = OPTION_COLORS[item.option_label] ?? OPTION_COLORS.A
        const isCorrect = revealed && item.is_correct
        const isWrong = revealed && !item.is_correct

        return (
          <div key={item.option_id} className="animate-slide-up">
            <div
              className={`
                relative overflow-hidden rounded-lg border-2 transition-all duration-500
                ${isCorrect
                  ? 'border-green-500 bg-green-50'
                  : isWrong
                  ? 'border-slate-200 bg-slate-50 opacity-70'
                  : `border-slate-200 ${colors.bg}`
                }
              `}
            >
              {/* Progress bar background */}
              <div
                className={`
                  absolute inset-y-0 left-0 transition-all duration-700 ease-out
                  ${isCorrect ? 'bg-green-200' : isWrong ? 'bg-slate-200' : colors.bar.replace('bg-', 'bg-').replace('-600', '-100').replace('-500', '-100')}
                `}
                style={{ width: `${item.percentage}%` }}
              />

              <div className={`relative flex items-center justify-between ${isScreen ? 'px-5 py-3.5' : 'px-4 py-2.5'}`}>
                <div className="flex items-center gap-3">
                  {/* Option label */}
                  <div
                    className={`
                      flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                      font-mono font-bold text-sm
                      ${isCorrect
                        ? 'bg-green-500 text-white'
                        : isWrong
                        ? 'bg-slate-300 text-slate-500'
                        : `${colors.bar} text-white`
                      }
                    `}
                  >
                    {item.option_label}
                  </div>

                  {/* Option text */}
                  <span
                    className={`
                      font-body font-medium truncate
                      ${isScreen ? 'text-lg' : 'text-sm'}
                      ${isCorrect ? 'text-green-800' : isWrong ? 'text-slate-400' : 'text-slate-700'}
                    `}
                  >
                    {item.option_text}
                    {isCorrect && (
                      <span className="ml-2 text-green-600 text-sm">✓ Correct</span>
                    )}
                  </span>
                </div>

                {/* Count and percentage */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <span
                    className={`
                      font-mono font-bold
                      ${isScreen ? 'text-xl' : 'text-base'}
                      ${isCorrect ? 'text-green-700' : isWrong ? 'text-slate-400' : 'text-slate-700'}
                    `}
                  >
                    {item.percentage}%
                  </span>
                  <span className={`text-slate-400 ${isScreen ? 'text-base' : 'text-xs'}`}>
                    ({item.count})
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div className={`text-right font-body ${isScreen ? 'text-base' : 'text-xs'} text-slate-500 pt-1`}>
        {totalAnswered} {totalAnswered === 1 ? 'response' : 'responses'}
      </div>
    </div>
  )
}
