import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  // satellite.js ships an optional WASM build whose worker uses top-level await; ES-format workers allow it.
  worker: { format: 'es' },
  // The Python planner runs separately in development (npm run dev:api); the browser only ever calls /api.
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
