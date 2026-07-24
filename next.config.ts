import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  // Prevent webpack bundling these — they rely on native binaries that must
  // be loaded at runtime from the real node_modules path, not as chunks.
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg'],
  experimental: {
    // Ensure the ffmpeg binary is copied into the standalone output so it's
    // available at /var/task/node_modules/ffmpeg-static/ffmpeg on Vercel.
    // @ts-expect-error — option exists at runtime but missing from types in this Next.js version
    outputFileTracingIncludes: {
      '/api/inngest': ['./node_modules/ffmpeg-static/**/*'],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.blob.vercel-storage.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
}

export default withNextIntl(nextConfig)
