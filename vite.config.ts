import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { rolldownOptions: { input: { main: 'index.html', styleGuide: 'style-guide.html' } } },
  test: { include: ['src/**/*.test.ts'], environment: 'node', css: { include: [/[?&]raw(?:&|$)/] } },
})
