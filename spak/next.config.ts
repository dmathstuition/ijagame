// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow Supabase storage images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },

  // Reduce payload for projector screen
  compress: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/screen/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
