import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { boothDevPlugin } from './server/boothDevPlugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), boothDevPlugin()],
  resolve: {
    alias: {
      '@shared': path.resolve(process.cwd(), 'supabase/functions/_shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
})
