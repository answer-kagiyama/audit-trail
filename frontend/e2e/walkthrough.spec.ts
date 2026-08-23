import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** 各 Objective を解く正解SQL。進行の通しを再現する。 */
const WALKTHROUGH: [string, string][] = [
  ['obj-01', `SELECT * FROM transactions WHERE amount >= 1000000`],
  [
    'obj-02',
    `SELECT e.name, t.amount FROM transactions t JOIN employees e ON e.id = t.employee_id WHERE t.id = 4821`,
  ],
  ['obj-03', `SELECT * FROM login_logs WHERE occurred_at LIKE '2026-03-14 02%'`],
  ['obj-04', `SELECT * FROM access_logs WHERE employee_id = 7 ORDER BY occurred_at DESC`],
  [
    'obj-05',
    `WITH last_move AS (SELECT employee_id, direction, ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY occurred_at DESC) AS rn FROM access_logs WHERE occurred_at <= '2026-03-14 02:14:33') SELECT e.name FROM last_move l JOIN employees e ON e.id = l.employee_id WHERE l.rn = 1 AND l.direction = 'in'`,
  ],
  [
    'obj-06',
    `SELECT e.name, l.ip_address FROM login_logs l JOIN employees e ON e.id = l.employee_id WHERE l.ip_address = '10.0.4.112'`,
  ],
  ['obj-07', `SELECT * FROM login_logs WHERE employee_id = 7 AND result = 'failure'`],
];

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.getByText('深夜0214')).toBeVisible({ timeout: 60_000 });
}

async function runSql(page: Page, sql: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await editor.fill(sql);
  await page.keyboard.press('ControlOrMeta+Enter');
}

/** Story パネルの「n / 7」を読む。 */
function progress(page: Page) {
  return page.locator('section').filter({ hasText: 'STORY' }).first();
}

test('CASE 001 を最初から最後まで通しでクリアできる', async ({ page }) => {
  await boot(page);
  await expect(progress(page)).toContainText('0 / 7');
  await expect(page.getByText('不審な高額送金を特定する')).toBeVisible();

  for (const [id, sql] of WALKTHROUGH) {
    await runSql(page, sql);
    // 達成すると演出が出る。これが出ることそのものが確認対象。
    await expect(page.getByText('調査目的 達成'), `${id} の達成演出`).toBeVisible({
      timeout: 30_000,
    });
    await page.getByText('調査目的 達成').click();
    await expect(page.getByText('調査目的 達成')).toBeHidden();
  }

  await expect(progress(page)).toContainText('7 / 7');

  // 最終回答: まず誤答。どこが違うかは言わない。
  await page.getByRole('button', { name: '事件を解決する' }).click();
  await page.locator('#final-culprit').selectOption('山田 咲');
  await page.locator('#final-method').selectOption('他人のアカウントの認証情報を使って送金した');
  await page.getByRole('button', { name: 'この推理で提出する' }).click();
  await expect(page.getByText('その推理では説明できない点があります')).toBeVisible();

  // 正答でエピローグ。
  await page.locator('#final-culprit').selectOption('田中 誠');
  await page.getByRole('button', { name: 'この推理で提出する' }).click();
  await expect(page.getByText('解決', { exact: true })).toBeVisible();
  await expect(page.getByText('送金を実行したのは、田中 誠。')).toBeVisible();
});

test('進捗がリロードで復元され、リセットで消える', async ({ page }) => {
  await boot(page);
  await runSql(page, WALKTHROUGH[0]![1]);
  await expect(progress(page)).toContainText('1 / 7');

  await page.reload();
  await expect(progress(page)).toContainText('1 / 7', { timeout: 60_000 });

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '最初からやり直す' }).click();
  await expect(progress(page)).toContainText('0 / 7');
});

test('書き込み系SQLは世界観に沿って拒否され、進行に影響しない', async ({ page }) => {
  await boot(page);
  await runSql(page, 'UPDATE transactions SET amount = 0');
  // 同じ文言は「元のエラーメッセージ」の中にも出るので、先頭（翻訳文）だけを見る。
  await expect(page.getByText('捜査資料を書き換えることはできません').first()).toBeVisible();
  await expect(progress(page)).toContainText('0 / 7');
});

test('SQLエラーが日本語化され「もしかして」が出る', async ({ page }) => {
  await boot(page);
  await runSql(page, 'SELECT * FROM employee');
  await expect(page.getByText('テーブル `employee` は存在しません')).toBeVisible();
  await expect(page.getByText('もしかして:')).toBeVisible();
});

test('ライト / ダークを切り替えられ、リロード後も保たれる', async ({ page }) => {
  await boot(page);
  const root = page.locator('html');

  // 既定はダーク。ダークはアートディレクションなので OS には追従しない。
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'ライト' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  // light-dark() が効いて地の色が明るくなること。
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole('button', { name: 'ダーク' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).not.toBe(dark);

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark', { timeout: 60_000 });

  // OS 追従を選ぶと data-theme が外れ、prefers-color-scheme に委ねられる。
  await page.getByRole('button', { name: 'OSの設定に従う' }).click();
  await expect(root).not.toHaveAttribute('data-theme', /.*/);
});

test('ER図が描画され、箱をクリックすると詳細が開く', async ({ page }) => {
  await boot(page);
  const diagram = page.locator('svg[role="img"]');
  await expect(diagram).toBeVisible();
  await expect(diagram.locator('g[role="button"]')).toHaveCount(4);

  await diagram.locator('g[role="button"]').first().click();
  await expect(page.getByText('サンプル行').first()).toBeVisible();
});

test('モバイル幅ではタブになり、非選択タブの中身は隠れる', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 850 });
  await boot(page);

  await page.getByRole('tab', { name: 'Database' }).click();
  await expect(page.locator('svg[role="img"]')).toBeVisible();
  await expect(page.locator('.cm-content')).toBeHidden();

  await page.getByRole('tab', { name: 'SQL' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
});
