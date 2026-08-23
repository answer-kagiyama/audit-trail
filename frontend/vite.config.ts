import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    // Worker も ESM で出力する。sql.js を Worker 内で import するため。
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * CodeMirror を別チャンクに切り出す。
         *
         * 初回ロードには sql.js の wasm（約660KB）が必ず乗る。
         * エディタは起動直後に使うので遅延ロードはしないが、
         * 分けておけば CASEデータやアプリ本体の更新でエディタまで
         * 再ダウンロードさせずに済む（ブラウザキャッシュが効く）。
         */
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lang-sql',
            '@lezer/highlight',
          ],
        },
      },
    },
  },
  test: {
    // game core / engine の大半は DOM を必要としない純粋TSなので、
    // 既定は node 環境で速く回す（architecture.md §10）。
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
