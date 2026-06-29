import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    include: ['../../packages/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      '@content': fileURLToPath(new URL('../../packages/content/src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../../packages/sim/src', import.meta.url)),
    },
  },
})
