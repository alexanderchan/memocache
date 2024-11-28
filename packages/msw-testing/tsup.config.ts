import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  outDir: 'dist',
  clean: true,
  external: [],
})
