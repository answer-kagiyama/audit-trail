/**
 * CASE 003「戻らなかった試作機」の検証。
 *
 * CASE 001 / 002 と同じく「CASEデータを直したせいでクリアできなくなったことを、
 * 人間より先に検出する」ためのテスト。各 Objective について
 *   - 複数の正解例が「すべて」通ること
 *   - 明らかな不正解（全件ダンプ・惜しいが違う絞り込み）が「通らない」こと
 *
 * このCASEに固有の役目がもう一つある。
 * **Window関数を使わない解も通ることを固定する**こと。
 * 難易度は構文の珍しさでは上げない、と決めた（docs/game-design.md §3）。
 * その約束は文章で書いても守れないので、obj-03 と obj-06 の両方について
 * 「LAG/LEAD 版」と「段階5までの版」が同じ答えを返すことをテストで縛る。
 *
 * @see docs/cases/case-003.md
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { evaluateChecks, evaluateFinalAnswer } from './checks.ts';
import { loadCase } from '../test/caseFixture.ts';
import type { LoadedCase } from '../test/caseFixture.ts';

let c: LoadedCase;

beforeAll(async () => {
  c = await loadCase('case-003');
});

afterAll(() => {
  c.dispose();
});

function achieves(objectiveId: string, sql: string): boolean {
  const checks = c.solution.checks[objectiveId];
  if (!checks) throw new Error(`checks がありません: ${objectiveId}`);
  return evaluateChecks(checks, c.run(sql)).passed;
}

function reasonFor(objectiveId: string, sql: string): string | undefined {
  const checks = c.solution.checks[objectiveId];
  if (!checks) throw new Error(`checks がありません: ${objectiveId}`);
  return evaluateChecks(checks, c.run(sql)).reason;
}

function expectAllSolve(objectiveId: string, queries: Record<string, string>): void {
  for (const [label, sql] of Object.entries(queries)) {
    const passed = achieves(objectiveId, sql);
    if (!passed) {
      throw new Error(
        `${objectiveId} の正解例「${label}」が達成判定されませんでした。\n` +
          `  理由: ${reasonFor(objectiveId, sql) ?? '(不明)'}\n  SQL: ${sql}`,
      );
    }
    expect(passed).toBe(true);
  }
}

function expectNoneSolve(objectiveId: string, queries: Record<string, string>): void {
  for (const [label, sql] of Object.entries(queries)) {
    const passed = achieves(objectiveId, sql);
    if (passed) {
      throw new Error(`${objectiveId} の不正解例「${label}」が通ってしまいました。\n  SQL: ${sql}`);
    }
    expect(passed).toBe(false);
  }
}

/** 記録の無い通行があった時刻。obj-06 の基準点。 */
const T = '2026-06-13 02:47:00';

/** 「同じ扉で、直前の記録と同じ向き」を Window関数なしで拾う。 */
const ADJACENT_SAME_DIRECTION = `
  SELECT c.card_number, a.occurred_at, a.direction
  FROM access_logs a
  JOIN access_logs b
    ON  b.card_id = a.card_id AND b.door_id = a.door_id
    AND b.occurred_at < a.occurred_at AND b.direction = a.direction
  JOIN cards c ON c.id = a.card_id
  WHERE NOT EXISTS (
    SELECT 1 FROM access_logs m
    WHERE m.card_id = a.card_id AND m.door_id = a.door_id
      AND m.occurred_at > b.occurred_at AND m.occurred_at < a.occurred_at)`;

/** 同じことを LAG で書いたもの。結果が一致することを下で確かめる。 */
const ADJACENT_SAME_DIRECTION_LAG = `
  SELECT c.card_number, x.occurred_at, x.direction FROM (
    SELECT card_id, occurred_at, direction,
           LAG(direction) OVER (PARTITION BY card_id, door_id ORDER BY occurred_at) AS prev
    FROM access_logs) x
  JOIN cards c ON c.id = x.card_id
  WHERE x.prev = x.direction`;

/** 指定時刻に館内にいる人。Window関数なし。 */
const INSIDE_AT = `
  SELECT s.name
  FROM access_logs a
  JOIN doors d ON d.id = a.door_id
  JOIN cards c ON c.id = a.card_id
  JOIN staff s ON s.id = c.holder_id
  WHERE d.door_name = '正面玄関' AND a.direction = 'in' AND a.occurred_at <= '${T}'
    AND a.occurred_at = (
      SELECT MAX(a2.occurred_at) FROM access_logs a2
      JOIN doors d2 ON d2.id = a2.door_id
      WHERE a2.card_id = a.card_id AND d2.door_name = '正面玄関'
        AND a2.occurred_at <= '${T}')`;

/** 同じことを LEAD で書いたもの。 */
const INSIDE_AT_LEAD = `
  WITH gate AS (
    SELECT c.holder_id, a.card_id, a.direction, a.occurred_at,
           LEAD(a.occurred_at) OVER (PARTITION BY a.card_id ORDER BY a.occurred_at) AS next_at
    FROM access_logs a
    JOIN doors d ON d.id = a.door_id
    JOIN cards c ON c.id = a.card_id
    WHERE d.door_name = '正面玄関')
  SELECT s.name FROM gate g JOIN staff s ON s.id = g.holder_id
  WHERE g.direction = 'in' AND g.occurred_at <= '${T}'
    AND (g.next_at IS NULL OR g.next_at > '${T}')`;

describe('obj-01 消えた試作機の台帳を確かめる', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-01', {
      資産番号で絞る: `
        SELECT e.asset_tag, s.name, c.checked_out_at, c.returned_at
        FROM checkouts c
        JOIN equipment e ON e.id = c.equipment_id
        JOIN staff s ON s.id = c.staff_id
        WHERE e.asset_tag = 'TX-7'`,
      試作機だけに絞る: `
        SELECT e.asset_tag, c.returned_at
        FROM checkouts c JOIN equipment e ON e.id = c.equipment_id
        WHERE e.category = 'prototype' AND e.asset_tag LIKE 'TX-7'`,
      サブクエリで機材IDを引く: `
        SELECT e.asset_tag, c.returned_at
        FROM checkouts c JOIN equipment e ON e.id = c.equipment_id
        WHERE c.equipment_id = (SELECT id FROM equipment WHERE asset_tag = 'TX-7')`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-01', {
      台帳の全件ダンプ: `
        SELECT e.asset_tag, c.returned_at
        FROM checkouts c JOIN equipment e ON e.id = c.equipment_id`,
      別の試作機: `
        SELECT e.asset_tag, c.returned_at
        FROM checkouts c JOIN equipment e ON e.id = c.equipment_id
        WHERE e.asset_tag = 'TX-5'`,
      資産番号を出していない: `SELECT returned_at FROM checkouts WHERE equipment_id = 1`,
    });
  });
});

describe('obj-02 その夜、第3研究室を通ったカードを洗い出す', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-02', {
      扉名と期間で絞る: `
        SELECT DISTINCT c.card_number
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '第3研究室'
          AND a.occurred_at >= '2026-06-13 00:00:00'
          AND a.occurred_at <  '2026-06-13 06:00:00'`,
      全4行を出す: `
        SELECT c.card_number, a.direction, a.occurred_at
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '第3研究室' AND a.occurred_at LIKE '2026-06-13 0%'
        ORDER BY a.occurred_at`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-02', {
      '期間で絞っていない（日中の森本が混ざる）': `
        SELECT DISTINCT c.card_number
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '第3研究室'`,
      扉で絞っていない: `
        SELECT DISTINCT c.card_number FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        WHERE a.occurred_at >= '2026-06-13 00:00:00' AND a.occurred_at < '2026-06-13 06:00:00'`,
      '研究棟ぜんぶ（早瀬が混ざる）': `
        SELECT DISTINCT c.card_number
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.building = '研究棟'
          AND a.occurred_at >= '2026-06-13 00:00:00'
          AND a.occurred_at <  '2026-06-13 06:00:00'`,
    });
  });
});

describe('obj-03 記録が交互になっていない箇所を探す', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-03', {
      '自己結合 + NOT EXISTS（段階5まで）': ADJACENT_SAME_DIRECTION,
      'LAG（短く書ける道具）': ADJACENT_SAME_DIRECTION_LAG,
      相関サブクエリで直前の向きを引く: `
        SELECT c.card_number, a.occurred_at
        FROM access_logs a JOIN cards c ON c.id = a.card_id
        WHERE a.direction = (
          SELECT b.direction FROM access_logs b
          WHERE b.card_id = a.card_id AND b.door_id = a.door_id
            AND b.occurred_at < a.occurred_at
          ORDER BY b.occurred_at DESC LIMIT 1)`,
    });
  });

  it('扉ごとに区切らないと通らない（無関係な4枚が混ざる）', () => {
    expectNoneSolve('obj-03', {
      カードだけで区切る: `
        SELECT DISTINCT c.card_number FROM (
          SELECT card_id, direction,
                 LAG(direction) OVER (PARTITION BY card_id ORDER BY occurred_at) AS prev
          FROM access_logs) x
        JOIN cards c ON c.id = x.card_id
        WHERE x.prev = x.direction`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-03', {
      入退記録の全件ダンプ: `
        SELECT c.card_number, a.occurred_at
        FROM access_logs a JOIN cards c ON c.id = a.card_id`,
      深夜の記録を並べただけ: `
        SELECT DISTINCT c.card_number FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        WHERE a.occurred_at >= '2026-06-13 02:00:00' AND a.occurred_at < '2026-06-13 04:00:00'`,
    });
  });
});

describe('obj-04 失効し忘れているカードを洗い出す', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-04', {
      'GROUP BY + HAVING': `
        SELECT s.name, COUNT(*) AS active_cards
        FROM cards c JOIN staff s ON s.id = c.holder_id
        WHERE c.revoked_on IS NULL
        GROUP BY s.id, s.name HAVING COUNT(*) >= 2`,
      相関サブクエリで数える: `
        SELECT s.name FROM staff s
        WHERE (SELECT COUNT(*) FROM cards c
               WHERE c.holder_id = s.id AND c.revoked_on IS NULL) > 1`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-04', {
      '失効の条件を入れていない（里見も混ざる）': `
        SELECT s.name FROM cards c JOIN staff s ON s.id = c.holder_id
        GROUP BY s.id, s.name HAVING COUNT(*) >= 2`,
      有効なカードを持つ人の全件: `
        SELECT DISTINCT s.name FROM cards c JOIN staff s ON s.id = c.holder_id
        WHERE c.revoked_on IS NULL`,
      職員の全件ダンプ: `SELECT name FROM staff`,
    });
  });
});

describe('obj-05 森本本人がその夜どこにいたかを調べる', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-05', {
      カード番号と扉名で絞る: `
        SELECT c.card_number, a.direction, a.occurred_at
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE c.card_number = 'C-1187' AND d.door_name = '正面玄関'
        ORDER BY a.occurred_at`,
      回転扉で絞る: `
        SELECT c.card_number, a.direction, a.occurred_at
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE c.card_number = 'C-1187' AND d.gate_type = '回転扉'`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-05', {
      旧カードを見ている: `
        SELECT c.card_number, a.direction, a.occurred_at
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE c.card_number = 'C-1042' AND d.door_name = '正面玄関'`,
      正面玄関の全件ダンプ: `
        SELECT c.card_number, a.direction, a.occurred_at
        FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '正面玄関'`,
      向きを出していない: `
        SELECT c.card_number, a.occurred_at FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        WHERE c.card_number = 'C-1187' AND a.door_id = 1`,
    });
  });
});

describe('obj-06 02:47 に建物の中にいた人物を割り出す', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-06', {
      '直前の記録が in（段階5まで）': INSIDE_AT,
      'LEAD で在館区間を作る（短く書ける道具）': INSIDE_AT_LEAD,
      'NOT EXISTS で「後により新しい記録が無い」': `
        SELECT s.name
        FROM access_logs a
        JOIN doors d ON d.id = a.door_id
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        WHERE d.door_name = '正面玄関' AND a.direction = 'in' AND a.occurred_at <= '${T}'
          AND NOT EXISTS (
            SELECT 1 FROM access_logs a2 JOIN doors d2 ON d2.id = a2.door_id
            WHERE a2.card_id = a.card_id AND d2.door_name = '正面玄関'
              AND a2.occurred_at > a.occurred_at AND a2.occurred_at <= '${T}')`,
    });
  });

  it('境界を雑に扱うと通らない', () => {
    expectNoneSolve('obj-06', {
      'その日に正面玄関を通った人（里見と阿久津が混ざる）': `
        SELECT DISTINCT s.name FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '正面玄関' AND a.occurred_at LIKE '2026-06-13%'`,
      '02:47 より前に入館した人（すでに帰った人が混ざる）': `
        SELECT DISTINCT s.name FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '正面玄関' AND a.direction = 'in' AND a.occurred_at <= '${T}'`,
      '日付で区切る（前日から居残っている人が消える）': `
        SELECT DISTINCT s.name FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '正面玄関' AND a.direction = 'in'
          AND a.occurred_at >= '2026-06-13 00:00:00' AND a.occurred_at <= '${T}'`,
    });
  });
});

describe('obj-07 研究棟に記録が無い人物を特定する', () => {
  it('正解例が通る', () => {
    expectAllSolve('obj-07', {
      'NOT EXISTS': `
        SELECT s.name FROM staff s
        WHERE s.name IN ('久我山 慧', '早瀬 拓')
          AND NOT EXISTS (
            SELECT 1 FROM access_logs a
            JOIN cards c ON c.id = a.card_id
            JOIN doors d ON d.id = a.door_id
            WHERE c.holder_id = s.id AND d.building = '研究棟')`,
      'LEFT JOIN + IS NULL': `
        SELECT s.name
        FROM staff s
        LEFT JOIN cards c ON c.holder_id = s.id
        LEFT JOIN access_logs a ON a.card_id = c.id
        LEFT JOIN doors d ON d.id = a.door_id AND d.building = '研究棟'
        WHERE s.name IN ('久我山 慧', '早瀬 拓')
        GROUP BY s.id, s.name
        HAVING COUNT(d.id) = 0`,
      'NOT IN': `
        SELECT s.name FROM staff s
        WHERE s.name IN ('久我山 慧', '早瀬 拓')
          AND s.id NOT IN (
            SELECT c.holder_id FROM access_logs a
            JOIN cards c ON c.id = a.card_id
            JOIN doors d ON d.id = a.door_id
            WHERE d.building = '研究棟')`,
    });
  });

  it('不正解例は通らない', () => {
    expectNoneSolve('obj-07', {
      館内にいた2人をそのまま出す: `
        SELECT name FROM staff WHERE name IN ('久我山 慧', '早瀬 拓')`,
      '記録が「ある」人を出してしまう': `
        SELECT DISTINCT s.name FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.building = '研究棟' AND s.name IN ('久我山 慧', '早瀬 拓')`,
      '2人に絞っていない（無関係な人まで出る）': `
        SELECT s.name FROM staff s
        WHERE NOT EXISTS (
          SELECT 1 FROM access_logs a
          JOIN cards c ON c.id = a.card_id
          JOIN doors d ON d.id = a.door_id
          WHERE c.holder_id = s.id AND d.building = '研究棟')`,
    });
  });
});

describe('最終回答', () => {
  const DELAY = '持ち出し台帳に偽の返却が登録されていたため';

  it('正しい組み合わせで正解になる', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '久我山 慧',
        card: 'C-1042',
        delay: DELAY,
      }),
    ).toBe(true);
  });

  it('記録上の名義人（森本）では不正解', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '森本 涼',
        card: 'C-1042',
        delay: DELAY,
      }),
    ).toBe(false);
  });

  it('obj-06 で止まった答え（早瀬）では不正解', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '早瀬 拓',
        card: 'C-1042',
        delay: DELAY,
      }),
    ).toBe(false);
  });

  it('新しいカードを選ぶと不正解', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '久我山 慧',
        card: 'C-1187',
        delay: DELAY,
      }),
    ).toBe(false);
  });
});

/**
 * seed.sql の不変条件。
 *
 * 正解例が通ることだけを見ていても、ここは守れない。
 * データを1行足したせいで「数えれば分かってしまう」ようになっても、
 * 正解例は通り続けるため。
 */
describe('seed.sql の不変条件', () => {
  const one = (sql: string): unknown => c.run(sql).rows[0]?.[0];
  const col = (sql: string): unknown[] => c.run(sql).rows.map((row) => row[0]);

  it('C-1042 の in / out はカードごとに釣り合っている（数えても異常が出ない）', () => {
    expect(
      c.run(`
        SELECT direction, COUNT(*) FROM access_logs
        WHERE card_id = (SELECT id FROM cards WHERE card_number = 'C-1042')
        GROUP BY direction ORDER BY direction`).rows,
    ).toEqual([
      ['in', 3],
      ['out', 3],
    ]);
  });

  it('カード×扉ごとにも釣り合っている', () => {
    expect(
      c.run(`
        SELECT d.door_name, a.direction, COUNT(*)
        FROM access_logs a JOIN doors d ON d.id = a.door_id
        WHERE a.card_id = (SELECT id FROM cards WHERE card_number = 'C-1042')
        GROUP BY d.door_name, a.direction ORDER BY d.door_name, a.direction`).rows,
    ).toEqual([
      ['研究棟連絡通路', 'in', 1],
      ['研究棟連絡通路', 'out', 1],
      ['第3研究室', 'in', 2],
      ['第3研究室', 'out', 2],
    ]);
  });

  it('扉ごとに区切ると、違反は C-1042 の2行だけ', () => {
    expect(c.run(`${ADJACENT_SAME_DIRECTION} ORDER BY a.occurred_at`).rows).toEqual([
      ['C-1042', '2026-06-13 02:47:00', 'in'],
      ['C-1042', '2026-06-13 03:16:00', 'out'],
    ]);
  });

  it('カードだけで区切ると無関係なカードが混ざる（扉で区切る必然性）', () => {
    const cards = col(`
      SELECT DISTINCT c.card_number FROM (
        SELECT card_id, direction,
               LAG(direction) OVER (PARTITION BY card_id ORDER BY occurred_at) AS prev
        FROM access_logs) x
      JOIN cards c ON c.id = x.card_id
      WHERE x.prev = x.direction ORDER BY c.card_number`);
    expect(cards).toContain('C-1042');
    expect(cards.length).toBeGreaterThan(1);
  });

  it('Window関数を使わない解が、LAG 版と同じ答えを返す', () => {
    const plain = c.run(`${ADJACENT_SAME_DIRECTION} ORDER BY a.occurred_at`).rows;
    const lag = c.run(`${ADJACENT_SAME_DIRECTION_LAG} ORDER BY x.occurred_at`).rows;
    expect(plain).toEqual(lag);
  });

  it('Window関数を使わない解が、LEAD 版と同じ答えを返す', () => {
    const plain = c.run(`${INSIDE_AT} ORDER BY s.name`).rows;
    const lead = c.run(`${INSIDE_AT_LEAD} ORDER BY s.name`).rows;
    expect(plain).toEqual(lead);
    expect(plain).toEqual([['久我山 慧'], ['早瀬 拓']]);
  });

  it('境界のノイズが効いている（雑に絞ると4名になる）', () => {
    expect(
      col(`
        SELECT DISTINCT s.name FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE d.door_name = '正面玄関' AND a.occurred_at LIKE '2026-06-13%'`).length,
    ).toBe(4);
  });

  it('久我山は研究棟の扉に自分のカードの記録が1件も無い', () => {
    expect(
      one(`
        SELECT COUNT(*) FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN staff s ON s.id = c.holder_id
        JOIN doors d ON d.id = a.door_id
        WHERE s.name = '久我山 慧' AND d.building = '研究棟'`),
    ).toBe(0);
  });

  it('早瀬には研究棟の記録がある（obj-07 で2人が分かれる）', () => {
    expect(
      Number(
        one(`
          SELECT COUNT(*) FROM access_logs a
          JOIN cards c ON c.id = a.card_id
          JOIN staff s ON s.id = c.holder_id
          JOIN doors d ON d.id = a.door_id
          WHERE s.name = '早瀬 拓' AND d.building = '研究棟'`),
      ),
    ).toBeGreaterThan(0);
  });

  it('C-1042 には正面玄関の記録が無い（館内から動き出している）', () => {
    expect(
      one(`
        SELECT COUNT(*) FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE c.card_number = 'C-1042' AND d.door_name = '正面玄関'`),
    ).toBe(0);
  });

  it('有効なカードを2枚以上持つのは森本だけ', () => {
    expect(
      col(`
        SELECT s.name FROM cards c JOIN staff s ON s.id = c.holder_id
        WHERE c.revoked_on IS NULL GROUP BY s.id, s.name HAVING COUNT(*) >= 2`),
    ).toEqual(['森本 涼']);
  });

  it('里見の旧カードは正しく失効している（森本との対比）', () => {
    expect(one(`SELECT revoked_on FROM cards WHERE card_number = 'C-1033'`)).toBe('2026-02-20');
  });

  it('退職者のカードは失効漏れだが、記録が1件も無い（行き止まりのノイズ）', () => {
    expect(one(`SELECT revoked_on FROM cards WHERE card_number = 'C-0990'`)).toBe(null);
    expect(
      one(`
        SELECT COUNT(*) FROM access_logs a JOIN cards c ON c.id = a.card_id
        WHERE c.card_number = 'C-0990'`),
    ).toBe(0);
  });

  it('偽の返却時刻に、森本は建物の中にいない', () => {
    const returnedAt = one(`
      SELECT c.returned_at FROM checkouts c
      JOIN equipment e ON e.id = c.equipment_id WHERE e.asset_tag = 'TX-7'`);
    expect(returnedAt).toBe('2026-06-13 03:12:00');

    // 森本のどのカードも、その時刻より前の最後の正面玄関の記録が 'out'。
    expect(
      col(`
        SELECT a.direction FROM access_logs a
        JOIN cards c ON c.id = a.card_id
        JOIN doors d ON d.id = a.door_id
        WHERE c.holder_id = (SELECT id FROM staff WHERE name = '森本 涼')
          AND d.door_name = '正面玄関'
          AND a.occurred_at <= '2026-06-13 03:12:00'
        ORDER BY a.occurred_at DESC LIMIT 1`),
    ).toEqual(['out']);
  });

  it('日付の引き算をしなくても解ける（時刻は ISO 形式の TEXT）', () => {
    expect(one(`SELECT typeof(occurred_at) FROM access_logs LIMIT 1`)).toBe('text');
    expect(one(`SELECT occurred_at FROM access_logs ORDER BY occurred_at LIMIT 1`)).toBe(
      '2026-06-12 08:40:00',
    );
  });
});
