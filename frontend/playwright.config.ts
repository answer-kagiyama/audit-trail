import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright が同梱を期待する Chromium と、実行環境に置かれている Chromium の
 * ビルド番号がずれている場合に、実行ファイルを直接指す。
 *
 * 通常の CI では `npx playwright install chromium` で揃うので不要。
 * ブラウザを自前で用意しているサンドボックス向けの逃げ道。
 */
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

/**
 * E2E は「開始からクリアまで通しで遊べる」ことだけを守る。
 *
 * ユニットテスト（Vitest）が判定・進行・CASEデータの整合性を細かく押さえているので、
 * ここで細部を重ねてもコストが増えるだけ。実ブラウザでしか壊れないもの
 * ——Worker、CodeMirror、ダイアログ、テーマ、localStorage——に絞る。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 本番と同じ成果物を配信して確かめる。dev サーバーでは通らない問題がある。
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
