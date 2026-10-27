import { defineConfig } from 'vitest/config'

const css = { include: [/[?&]raw(?:&|$)/] }
const setupFiles = ['src/reader/test-setup.ts']

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.db.test.ts', 'node_modules/**'],
          environment: 'node',
          setupFiles,
          css,
        },
      },
      {
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          environment: 'node',
          fileParallelism: false,
          setupFiles,
          css,
        },
      },
    ],
  },
})
