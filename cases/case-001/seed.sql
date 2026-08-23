-- ============================================================================
-- CASE 001「消えた100万円」 seed data
--
-- このファイルが唯一の真実。database.sqlite は生成物なので直接編集しない。
--   node tools/build-case-db.mjs cases/case-001
--
-- 方針:
--   * 事件に関わる行はすべて手書きする（下の「鍵となる行」節）。
--     生成に混ぜると、読んだだけでは何が仕込まれているか分からなくなる。
--   * 数を稼ぐためのノイズだけを再帰CTEで決定的に生成する。
--     random() は使わない。ビルドのたびに .sqlite が変わり、CI の差分検出が
--     機能しなくなるため。
--   * ノイズの値域は「事件に絶対に干渉しない」よう構成で保証する。
--       - 取引ノイズ: 平日 09:00-17:59 / 金額 3,000〜479,999 円
--       - ログインノイズ: 平日 08:00-19:59 / 各社員の固定席IPからのみ
--       - 入退室ノイズ: 平日 08:00-09:59 入館 / 17:00-20:59 退館
--     事件は 2026-03-13(金) 夜 〜 2026-03-14(土) 未明に起きるので、
--     平日日中のノイズとは時間帯で完全に分離される。
--
-- 日付メモ: 2026-01-05 は月曜。2026-03-13 は金曜。2026-03-14 は土曜。
--           ノイズは 2026-01-05 から 50 営業日 = 2026-03-13 までに収まる。
-- @see docs/cases/case-001.md
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- employees: 社員名簿（12名 / うち退職者2名）
-- ----------------------------------------------------------------------------
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  department TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK (status IN ('active', 'retired')),
  hired_at   TEXT    NOT NULL
);

INSERT INTO employees (id, name, department, status, hired_at) VALUES
  (1,  '佐藤 健一', '経理部',         'active',  '2019-04-01'),
  (2,  '鈴木 花子', '経理部',         'active',  '2021-10-01'),
  (3,  '高橋 修',   '営業部',         'retired', '2016-04-01'),
  (4,  '渡辺 一郎', '営業部',         'active',  '2022-04-01'),
  (5,  '伊藤 美咲', '人事部',         'active',  '2020-07-01'),
  (6,  '中村 大輔', '情報システム部', 'active',  '2017-04-01'),
  (7,  '山田 咲',   '経理部',         'active',  '2019-09-01'),
  (8,  '小林 涼',   '総務部',         'active',  '2023-04-01'),
  (9,  '加藤 健',   '営業部',         'active',  '2021-04-01'),
  (10, '吉田 直樹', '人事部',         'active',  '2016-04-01'),
  (11, '松本 千夏', '総務部',         'retired', '2015-04-01'),
  (12, '田中 誠',   '情報システム部', 'active',  '2020-01-06');

-- ----------------------------------------------------------------------------
-- transactions: 取引記録
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
  id                  INTEGER PRIMARY KEY,
  employee_id         INTEGER NOT NULL REFERENCES employees(id),
  amount              INTEGER NOT NULL,
  destination_account TEXT    NOT NULL,
  occurred_at         TEXT    NOT NULL,
  memo                TEXT
);

-- 鍵となる行 ----------------------------------------------------------------
-- ★ 事件そのもの。深夜02:14、山田咲(7)のアカウントから100万円。摘要なし。
INSERT INTO transactions (id, employee_id, amount, destination_account, occurred_at, memo) VALUES
  (4821, 7, 1000000, 'ACC-770412', '2026-03-14 02:14:33', NULL);

-- 高額だが正規の取引（ノイズ）。ORDER BY amount DESC LIMIT 1 の一発では
-- 事件に辿り着けないようにし、時刻にも目を向けさせる。
INSERT INTO transactions (id, employee_id, amount, destination_account, occurred_at, memo) VALUES
  (4655, 1, 980000,  'ACC-310288', '2026-02-19 14:22:10', '設備リース料 2月分'),
  (4712, 2, 1250000, 'ACC-559140', '2026-03-02 10:41:55', '外注費支払 2月締'),
  (4788, 1, 1500000, 'ACC-204775', '2026-03-09 15:08:31', '仕入代金 3月第1週');

-- 山田咲(7)名義の正規取引。「山田のアカウント＝すべて不正」ではないことを示す。
INSERT INTO transactions (id, employee_id, amount, destination_account, occurred_at, memo) VALUES
  (4690, 7, 42800,  'ACC-118203', '2026-02-24 11:05:12', '交通費精算'),
  (4735, 7, 187500, 'ACC-664901', '2026-03-04 13:47:39', '消耗品購入'),
  (4801, 7, 63200,  'ACC-118203', '2026-03-11 09:58:04', '交通費精算');

-- ノイズ -------------------------------------------------------------------
-- 平日 09:00-17:59、3,000〜479,999円。在籍中の社員10名に均等に割り振る。
-- 割り当ては CASE で明示する（退職者 3, 11 には取引を作らない）。
-- SQLite は相関サブクエリの OFFSET に外側の列を渡せないので、
-- SELECT ... LIMIT 1 OFFSET n という書き方は使えない。
INSERT INTO transactions (id, employee_id, amount, destination_account, occurred_at, memo)
WITH RECURSIVE n(i) AS (
  SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 179
)
SELECT
  4000 + i,
  CASE ((i * 7) % 10)
    WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 5  WHEN 4 THEN 6
    WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 7 THEN 9 WHEN 8 THEN 10 ELSE 12
  END,
  3000 + ((i * 104729) % 477000),
  'ACC-' || printf('%06d', 100000 + ((i * 65537) % 899999)),
  date('2026-01-05', '+' || (7 * ((i % 50) / 5) + ((i % 50) % 5)) || ' day')
    || printf(' %02d:%02d:%02d', 9 + ((i * 13) % 9), (i * 29) % 60, (i * 47) % 60),
  CASE (i % 6)
    WHEN 0 THEN '備品購入'
    WHEN 1 THEN '交通費精算'
    WHEN 2 THEN '外注費支払'
    WHEN 3 THEN '光熱費'
    WHEN 4 THEN '通信費'
    ELSE '会議費'
  END
FROM n;

-- ----------------------------------------------------------------------------
-- login_logs: ログイン記録（失敗も残る）
--
-- 各社員には固定席の端末があり、IPは 10.0.4.<100 + 社員ID> で固定。
--   山田 咲(7)  → 10.0.4.107
--   田中 誠(12) → 10.0.4.112   ← 事件の鍵
-- ----------------------------------------------------------------------------
CREATE TABLE login_logs (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  ip_address  TEXT    NOT NULL,
  occurred_at TEXT    NOT NULL,
  result      TEXT    NOT NULL CHECK (result IN ('success', 'failure'))
);

-- 鍵となる行 ----------------------------------------------------------------
-- ★ 田中誠(12)が自分のアカウントで自席端末にログイン（犯行の24分前）
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result) VALUES
  (9001, 12, '10.0.4.112', '2026-03-14 01:50:07', 'success');

-- ★ 同じ端末から山田咲(7)のアカウントへ。3回失敗し、4回目で成功。
--   認証情報を試していた痕跡。
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result) VALUES
  (9002, 7, '10.0.4.112', '2026-03-14 02:05:11', 'failure'),
  (9003, 7, '10.0.4.112', '2026-03-14 02:06:02', 'failure'),
  (9004, 7, '10.0.4.112', '2026-03-14 02:07:44', 'failure'),
  (9005, 7, '10.0.4.112', '2026-03-14 02:09:20', 'success');

-- 3/12 深夜のサーバー保守。中村大輔(6)が正規の作業で深夜にログインしている。
-- 「深夜ログイン＝犯人」という短絡を一度外させるためのノイズ。
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result) VALUES
  (8901, 6, '10.0.4.106', '2026-03-12 23:41:16', 'success'),
  (8902, 6, '10.0.4.106', '2026-03-13 00:12:48', 'success'),
  (8903, 6, '10.0.4.106', '2026-03-13 01:55:30', 'success');

-- 日常的に起きるログイン失敗（打ち間違い）。02:05-02:07 の連続失敗だけが
-- 特別ではない、と一度思わせるためのノイズ。ただし平日日中・自席端末から。
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result) VALUES
  (8801, 4,  '10.0.4.104', '2026-01-19 09:03:21', 'failure'),
  (8802, 9,  '10.0.4.109', '2026-02-03 08:47:55', 'failure'),
  (8803, 1,  '10.0.4.101', '2026-02-17 13:22:09', 'failure'),
  (8804, 7,  '10.0.4.107', '2026-02-26 08:59:41', 'failure'),
  (8805, 10, '10.0.4.110', '2026-03-05 09:15:33', 'failure'),
  (8806, 8,  '10.0.4.108', '2026-03-10 14:08:12', 'failure');

-- ノイズ -------------------------------------------------------------------
-- 平日 08:00-19:59、各社員の固定席IPからの成功ログイン。
-- 分・秒に周回番号 (i / 50) を混ぜている。これがないと i と i+300 が
-- 日・社員・時刻まで完全に一致し、まったく同じ記録が2行できてしまう。
INSERT INTO login_logs (id, employee_id, ip_address, occurred_at, result)
WITH RECURSIVE n(i) AS (
  SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 359
),
picked AS (
  SELECT i, CASE ((i * 3) % 10)
           WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 5  WHEN 4 THEN 6
           WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 7 THEN 9 WHEN 8 THEN 10 ELSE 12
         END AS emp
  FROM n
)
SELECT
  9100 + i,
  emp,
  '10.0.4.' || (100 + emp),
  date('2026-01-05', '+' || (7 * ((i % 50) / 5) + ((i % 50) % 5)) || ' day')
    || printf(' %02d:%02d:%02d', 8 + ((i * 17) % 12), ((i * 23) + (i / 50) * 7) % 60, ((i * 41) + (i / 50) * 11) % 60),
  'success'
FROM picked;

-- ----------------------------------------------------------------------------
-- access_logs: 入退室記録
-- ----------------------------------------------------------------------------
CREATE TABLE access_logs (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  gate        TEXT    NOT NULL CHECK (gate IN ('main', 'back')),
  direction   TEXT    NOT NULL CHECK (direction IN ('in', 'out')),
  occurred_at TEXT    NOT NULL
);

-- 鍵となる行 ----------------------------------------------------------------
-- ★ 山田咲(7)は 3/13(金) 19:42 に退館し、以降 in の記録がない。
--   彼女は犯行時刻に社内にいなかった。
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at) VALUES
  (7001, 7, 'main', 'in',  '2026-03-13 08:51:07'),
  (7002, 7, 'main', 'out', '2026-03-13 19:42:18');

-- ★ 田中誠(12)は 3/14(土) 未明に裏口から入館し、送金の24分後に退館している。
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at) VALUES
  (7003, 12, 'back', 'in',  '2026-03-14 01:47:03'),
  (7004, 12, 'back', 'out', '2026-03-14 02:38:51');

-- 3/13(金) の他の社員。全員その日のうちに退館している。
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at) VALUES
  (7011, 1,  'main', 'in',  '2026-03-13 08:32:44'), (7012, 1,  'main', 'out', '2026-03-13 18:05:11'),
  (7013, 2,  'main', 'in',  '2026-03-13 08:58:20'), (7014, 2,  'main', 'out', '2026-03-13 17:48:39'),
  (7015, 4,  'main', 'in',  '2026-03-13 09:12:03'), (7016, 4,  'main', 'out', '2026-03-13 20:31:55'),
  (7017, 5,  'main', 'in',  '2026-03-13 08:45:12'), (7018, 5,  'main', 'out', '2026-03-13 17:22:48'),
  (7019, 6,  'back', 'in',  '2026-03-13 10:04:37'), (7020, 6,  'back', 'out', '2026-03-13 21:14:02'),
  (7021, 8,  'main', 'in',  '2026-03-13 08:38:59'), (7022, 8,  'main', 'out', '2026-03-13 18:47:26'),
  (7023, 9,  'main', 'in',  '2026-03-13 09:21:44'), (7024, 9,  'main', 'out', '2026-03-13 19:03:17'),
  (7025, 10, 'main', 'in',  '2026-03-13 08:27:31'), (7026, 10, 'main', 'out', '2026-03-13 17:59:08'),
  (7027, 12, 'back', 'in',  '2026-03-13 09:47:22'), (7028, 12, 'back', 'out', '2026-03-13 18:12:40');

-- 3/12 深夜のサーバー保守（中村大輔）。深夜の在館者が田中だけではない日もある。
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at) VALUES
  (6901, 6, 'back', 'in',  '2026-03-12 23:30:15'), (6902, 6, 'back', 'out', '2026-03-13 02:08:44');

-- ノイズ -------------------------------------------------------------------
-- 平日の通常出退勤。入館 08:00-09:59 / 退館 17:00-20:59。
-- 3/13 は上で手書きしているので、生成対象は 1/5 〜 3/12 の 48 営業日に限る。
INSERT INTO access_logs (id, employee_id, gate, direction, occurred_at)
WITH RECURSIVE n(i) AS (
  SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 239
),
picked AS (
  SELECT
    i,
    CASE ((i * 9) % 10)
         WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 5  WHEN 4 THEN 6
         WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 7 THEN 9 WHEN 8 THEN 10 ELSE 12
       END AS emp,
    date('2026-01-05', '+' || (7 * ((i % 48) / 5) + ((i % 48) % 5)) || ' day') AS day
  FROM n
)
SELECT
  7100 + i * 2,
  emp,
  CASE WHEN emp IN (6, 12) THEN 'back' ELSE 'main' END,
  'in',
  day || printf(' %02d:%02d:%02d', 8 + ((i * 11) % 2), (i * 37) % 60, (i * 19) % 60)
FROM picked
UNION ALL
SELECT
  7101 + i * 2,
  emp,
  CASE WHEN emp IN (6, 12) THEN 'back' ELSE 'main' END,
  'out',
  day || printf(' %02d:%02d:%02d', 17 + ((i * 31) % 4), (i * 43) % 60, (i * 53) % 60)
FROM picked;
