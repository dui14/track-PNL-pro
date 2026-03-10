import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  transpilePackages: ['@supabase/supabase-js', '@supabase/ssr'],
  experimental: {
    serverActions: {
      bodySizeLimit: '1024kb',
    },
  },
}

export default nextConfig
