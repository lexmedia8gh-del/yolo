/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  env: {
    NEXT_PUBLIC_APP_URL: (() => {
      const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
      if (raw && (raw.includes('vercel.com') && !raw.includes('.vercel.app'))) {
        return ''
      }
      return raw
    })(),
    NEXT_PUBLIC_VERCEL_URL: (() => {
      const raw =
        process.env.NEXT_PUBLIC_VERCEL_URL ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_BRANCH_URL ||
        process.env.VERCEL_URL ||
        ''
      return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    })(),
  },
}

module.exports = nextConfig
