import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    // Worker も ESM で出力する。sql.js を Worker 内で import するため。
    format: 'es',
  },
  test: {
    // game core / engine の大半は DOM を必要としない純粋TSなので、
    // 既定は node 環境で速く回す（architecture.md §10）。
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
