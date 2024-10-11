import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  passWithNoTests: true,
  globals: true,
  include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  plugins: [tsconfigPaths()],
})
