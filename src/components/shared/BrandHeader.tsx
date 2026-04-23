// src/components/shared/BrandHeader.tsx
'use client'

interface BrandHeaderProps {
  size?: 'sm' | 'md' | 'lg' | 'screen'
  subtitle?: string
  className?: string
}

export function BrandHeader({ size = 'md', subtitle, className = '' }: BrandHeaderProps) {
  const sizes = {
    sm: { crest: 32, title: 'text-sm', sub: 'text-xs' },
    md: { crest: 44, title: 'text-xl', sub: 'text-sm' },
    lg: { crest: 64, title: 'text-3xl', sub: 'text-base' },
    screen: { crest: 80, title: 'text-5xl', sub: 'text-xl' },
  }

  const s = sizes[size]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Crest placeholder - replace with actual SVG/image */}
      <div
        className="flex-shrink-0 rounded-full bg-white border-2 border-[var(--ij-gold)] flex items-center justify-center shadow-md"
        style={{ width: s.crest, height: s.crest }}
      >
        <svg
          width={s.crest * 0.6}
          height={s.crest * 0.6}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Simple cross/star crest placeholder */}
          <path
            d="M20 4L22.5 14H32L24.3 20.1L27.2 30L20 24L12.8 30L15.7 20.1L8 14H17.5L20 4Z"
            fill="var(--ij-gold)"
          />
          <circle cx="20" cy="20" r="6" fill="var(--ij-navy)" />
          <path d="M20 15V25M15 20H25" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <div>
        <h1
          className={`font-display font-bold text-white leading-tight ${s.title}`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
        >
          Infant Jesus
        </h1>
        <p className={`text-[var(--ij-gold-light)] font-body font-medium ${s.sub} leading-tight`}>
          {subtitle || 'SPAK Competition Platform'}
        </p>
      </div>
    </div>
  )
}

// Dark version for light backgrounds
export function BrandHeaderDark({ size = 'md', subtitle, className = '' }: BrandHeaderProps) {
  const sizes = {
    sm: { crest: 32, title: 'text-sm', sub: 'text-xs' },
    md: { crest: 44, title: 'text-xl', sub: 'text-sm' },
    lg: { crest: 64, title: 'text-3xl', sub: 'text-base' },
    screen: { crest: 80, title: 'text-5xl', sub: 'text-xl' },
  }
  const s = sizes[size]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex-shrink-0 rounded-full border-2 border-[var(--ij-gold)] bg-[var(--ij-navy)] flex items-center justify-center shadow-md"
        style={{ width: s.crest, height: s.crest }}
      >
        <svg width={s.crest * 0.6} height={s.crest * 0.6} viewBox="0 0 40 40" fill="none">
          <path d="M20 4L22.5 14H32L24.3 20.1L27.2 30L20 24L12.8 30L15.7 20.1L8 14H17.5L20 4Z" fill="var(--ij-gold)" />
          <circle cx="20" cy="20" r="6" fill="white" />
          <path d="M20 15V25M15 20H25" stroke="var(--ij-navy)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <div>
        <h1 className={`font-display font-bold text-navy leading-tight ${s.title}`}>
          Infant Jesus
        </h1>
        <p className={`text-[var(--ij-slate)] font-body font-medium ${s.sub} leading-tight`}>
          {subtitle || 'SPAK Competition Platform'}
        </p>
      </div>
    </div>
  )
}
