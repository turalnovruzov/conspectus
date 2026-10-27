import { vi } from 'vitest'

vi.stubGlobal('fetch', () => {
  throw new Error('network in tests')
})
