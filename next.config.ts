import type { NextConfig } from 'next'

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/style-guide.html', destination: '/style-guide' }]
  },
}

export default config
