/**
 * Node（Vitest）から sql.js を叩くためのヘルパー。
 *
 * ブラウザも Worker も起動せずに SQL 実行そのものをテストできる。
 * Phase 3 の CASE 検証テストはこの上に載る。
 *
 * @see docs/architecture.md#10-テスト戦略
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqlJsCore } from '../engine/sqlJsCore.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Node 上では wasm をファイルパスで渡す。 */
export function nodeLocateFile(): string {
  return require.resolve('sql.js/dist/sql-wasm.wasm');
}

export function createNodeCore(): SqlJsCore {
  return new SqlJsCore({ locateFile: nodeLocateFile });
}

export const DEMO_FIXTURE = resolve(here, 'fixtures/demo.sqlite');

export async function readFixture(path: string = DEMO_FIXTURE): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

/** 初期化済み・DBロード済みの SqlJsCore を返す。 */
export async function createLoadedCore(path: string = DEMO_FIXTURE): Promise<SqlJsCore> {
  const core = createNodeCore();
  await core.init();
  core.loadDatabase(await readFixture(path));
  return core;
}
