// Vitest config for the testdoc_cover frontend suite.
// Run from the frontend/ directory (so npm packages resolve):
//   cd frontend && npx vitest run --config ../testdoc_cover/testcase/frontend/vitest.config.mjs
// The node_modules symlink in this directory lets the test files themselves
// resolve react / @testing-library imports from frontend/node_modules.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@src': resolve(here, '../../../frontend/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    dir: here,
    include: ['**/*.test.{js,jsx}'],
    setupFiles: [resolve(here, 'setup.js')],
  },
})
