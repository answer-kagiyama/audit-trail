/**
 * cases/ を frontend/public/cases/ にコピーする。
 *
 * CASEデータはアプリのコードではなくコンテンツなのでリポジトリ直下に置き、
 * 配信のためにビルド前でここへ複製する（docs/architecture.md §4）。
 * コピー先は生成物なので git に入れない。
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..');
const source = resolve(frontendRoot, '../cases');
const target = resolve(frontendRoot, 'public/cases');

if (!existsSync(source)) {
  console.error(`cases/ が見つかりません: ${source}`);
  process.exit(1);
}

// 消してから入れ直す。CASEを削除・改名したときに古い実体が残らないようにする。
await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

console.log(`synced cases → public/cases`);
