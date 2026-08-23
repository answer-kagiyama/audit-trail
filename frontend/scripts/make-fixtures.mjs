/**
 * テスト・PoC 用の小さな SQLite DB を生成する。
 *
 * Phase 3 の tools/build-case-db.mjs（Issue #15）と同じ考え方の縮小版:
 * SQL が正であり、.sqlite は生成物。生成物は git に入れない。
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const SEED = `
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  department TEXT    NOT NULL,
  status     TEXT    NOT NULL,
  note       TEXT
);
INSERT INTO employees (id, name, department, status, note) VALUES
  (1,  '佐藤 健一', '経理部',       'active',  NULL),
  (7,  '山田 咲',   '経理部',       'active',  NULL),
  (12, '田中 誠',   '情報システム部', 'active',  '深夜作業あり'),
  (98, '高橋 修',   '営業部',       'retired', NULL);

CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount      INTEGER NOT NULL,
  occurred_at TEXT    NOT NULL
);
INSERT INTO transactions (id, employee_id, amount, occurred_at) VALUES
  (4820, 1,  32000,   '2026-03-13 11:02:10'),
  (4821, 7,  1000000, '2026-03-14 02:14:33'),
  (4822, 12, 8400,    '2026-03-14 09:31:05');
`;

const sqlJs = await initSqlJs({
  locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
});

const db = new sqlJs.Database();
db.run(SEED);
const bytes = Buffer.from(db.export());
db.close();

for (const relative of ['src/test/fixtures/demo.sqlite', 'public/fixtures/demo.sqlite']) {
  const target = resolve(root, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`wrote ${relative} (${bytes.length} bytes)`);
}
