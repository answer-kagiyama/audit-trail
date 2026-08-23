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

CREATE TABLE login_logs (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  ip_address  TEXT    NOT NULL,
  occurred_at TEXT    NOT NULL,
  result      TEXT    NOT NULL
);
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result) VALUES
  (901, 12, '10.0.4.112', '2026-03-14 01:50:07', 'success'),
  (902, 7,  '10.0.4.112', '2026-03-14 02:05:11', 'failure'),
  (903, 7,  '10.0.4.112', '2026-03-14 02:09:20', 'success'),
  (904, 1,  '10.0.2.31',  '2026-03-13 09:12:44', 'success');

CREATE TABLE access_logs (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  gate        TEXT    NOT NULL,
  direction   TEXT    NOT NULL,
  occurred_at TEXT    NOT NULL
);
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at) VALUES
  (501, 7,  'main', 'out', '2026-03-13 19:42:18'),
  (502, 12, 'back', 'in',  '2026-03-14 01:47:03'),
  (503, 12, 'back', 'out', '2026-03-14 02:38:51');
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

/**
 * デモ用 schema.json。
 *
 * 本来 schema.json は人が書くもの（説明文とリレーションは自動生成できない）だが、
 * このデモは上の SEED とセットで意味を持つので、ズレないよう同じ場所で持つ。
 * Phase 3 の CASE 001 では cases/case-001/schema.json として手書きし、
 * 実DBとの一致を検証テストで担保する。
 */
const SCHEMA = {
  tables: [
    {
      name: 'employees',
      description: '社員名簿。退職者も残っている。',
      // employees を中央に置き、3テーブルを放射状に配置する（線が交差しない）。
      erLayout: { x: 250, y: 210 },
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          nullable: false,
          key: 'pk',
          description: '社員ID（主キー）',
        },
        { name: 'name', type: 'TEXT', nullable: false, description: '氏名' },
        { name: 'department', type: 'TEXT', nullable: false, description: '所属部署' },
        {
          name: 'status',
          type: 'TEXT',
          nullable: false,
          description: "在籍状況。'active' または 'retired'",
        },
        { name: 'note', type: 'TEXT', nullable: true, description: '備考。無い場合は NULL。' },
      ],
      sampleRows: [
        { id: 1, name: '佐藤 健一', department: '経理部', status: 'active', note: null },
        {
          id: 12,
          name: '田中 誠',
          department: '情報システム部',
          status: 'active',
          note: '深夜作業あり',
        },
        { id: 98, name: '高橋 修', department: '営業部', status: 'retired', note: null },
      ],
    },
    {
      name: 'transactions',
      description: '取引記録。金額は円。',
      erLayout: { x: 250, y: 30 },
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          nullable: false,
          key: 'pk',
          description: '取引ID（主キー）',
        },
        {
          name: 'employee_id',
          type: 'INTEGER',
          nullable: false,
          key: 'fk',
          description: '実行アカウントの社員ID',
        },
        { name: 'amount', type: 'INTEGER', nullable: false, description: '金額（円）' },
        {
          name: 'occurred_at',
          type: 'TEXT',
          nullable: false,
          description: "実行日時。'YYYY-MM-DD HH:MM:SS' 形式の文字列。",
        },
      ],
      sampleRows: [
        { id: 4820, employee_id: 1, amount: 32000, occurred_at: '2026-03-13 11:02:10' },
        { id: 4821, employee_id: 7, amount: 1000000, occurred_at: '2026-03-14 02:14:33' },
        { id: 4822, employee_id: 12, amount: 8400, occurred_at: '2026-03-14 09:31:05' },
      ],
    },
    {
      name: 'login_logs',
      description: 'ログイン記録。失敗も残る。',
      erLayout: { x: 560, y: 205 },
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, key: 'pk', description: '主キー' },
        {
          name: 'employee_id',
          type: 'INTEGER',
          nullable: false,
          key: 'fk',
          description: 'ログインを試みたアカウントの社員ID',
        },
        {
          name: 'ip_address',
          type: 'TEXT',
          nullable: false,
          // ここが繋がっていないことが、値で突き合わせる発想の入口になる。
          description: '接続元IP。社内端末の固定IP。どのテーブルとも繋がっていない。',
        },
        {
          name: 'occurred_at',
          type: 'TEXT',
          nullable: false,
          description: "日時。'YYYY-MM-DD HH:MM:SS' 形式の文字列。",
        },
        {
          name: 'result',
          type: 'TEXT',
          nullable: false,
          description: "'success' または 'failure'",
        },
      ],
      sampleRows: [
        {
          id: 901,
          employee_id: 12,
          ip_address: '10.0.4.112',
          occurred_at: '2026-03-14 01:50:07',
          result: 'success',
        },
        {
          id: 902,
          employee_id: 7,
          ip_address: '10.0.4.112',
          occurred_at: '2026-03-14 02:05:11',
          result: 'failure',
        },
        {
          id: 903,
          employee_id: 7,
          ip_address: '10.0.4.112',
          occurred_at: '2026-03-14 02:09:20',
          result: 'success',
        },
      ],
    },
    {
      name: 'access_logs',
      description: '入退室記録。',
      erLayout: { x: 250, y: 390 },
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, key: 'pk', description: '主キー' },
        {
          name: 'employee_id',
          type: 'INTEGER',
          nullable: false,
          key: 'fk',
          description: '入退室した社員のID',
        },
        {
          name: 'gate',
          type: 'TEXT',
          nullable: false,
          description: "ゲート名。'main' または 'back'",
        },
        {
          name: 'direction',
          type: 'TEXT',
          nullable: false,
          description: "'in'（入館）または 'out'（退館）",
        },
        {
          name: 'occurred_at',
          type: 'TEXT',
          nullable: false,
          description: "日時。'YYYY-MM-DD HH:MM:SS' 形式の文字列。",
        },
      ],
      sampleRows: [
        {
          id: 501,
          employee_id: 7,
          gate: 'main',
          direction: 'out',
          occurred_at: '2026-03-13 19:42:18',
        },
        {
          id: 502,
          employee_id: 12,
          gate: 'back',
          direction: 'in',
          occurred_at: '2026-03-14 01:47:03',
        },
        {
          id: 503,
          employee_id: 12,
          gate: 'back',
          direction: 'out',
          occurred_at: '2026-03-14 02:38:51',
        },
      ],
    },
  ],
  relations: [
    {
      id: 'rel-tx-emp',
      from: { table: 'transactions', column: 'employee_id' },
      to: { table: 'employees', column: 'id' },
      cardinality: 'many-to-one',
      label: '実行したアカウント',
      description: '取引を実行したアカウントの社員ID',
    },
    {
      id: 'rel-login-emp',
      from: { table: 'login_logs', column: 'employee_id' },
      to: { table: 'employees', column: 'id' },
      cardinality: 'many-to-one',
      label: '試みたアカウント',
      description: 'ログインを試みたアカウントの社員ID',
    },
    {
      id: 'rel-access-emp',
      from: { table: 'access_logs', column: 'employee_id' },
      to: { table: 'employees', column: 'id' },
      cardinality: 'many-to-one',
      label: '入退室した社員',
      description: '入退室した社員のID',
    },
  ],
  erCanvas: { width: 800, height: 500 },
};

for (const relative of ['src/test/fixtures/demo-schema.json', 'public/fixtures/demo-schema.json']) {
  const target = resolve(root, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(SCHEMA, null, 2)}\n`);
  console.log(`wrote ${relative}`);
}
