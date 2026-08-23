/**
 * CASE 001「消えた100万円」の検証。
 *
 * このテストが守っているのは一点だけ:
 * **CASEデータを直したせいでクリアできなくなったことを、人間より先に検出する。**
 *
 * そのために各 Objective について
 *   - 素朴な書き方 / JOIN版 / サブクエリ版 など複数の正解例が「すべて」通ること
 *   - 明らかな不正解（全件ダンプ、別テーブル、惜しいが違う絞り込み）が「通らない」こと
 * を確かめる。
 *
 * @see docs/case-format.md#8-case追加時のチェックリスト
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { evaluateChecks, evaluateFinalAnswer } from './checks.ts';
import { loadCase } from '../test/caseFixture.ts';
import type { LoadedCase } from '../test/caseFixture.ts';

let c: LoadedCase;

beforeAll(async () => {
  c = await loadCase('case-001');
});

afterAll(() => {
  c.dispose();
});

/** その Objective の checks に対して、SQL の実行結果が達成判定されるか。 */
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

/** 正解例は「すべて」通らなければならない。落ちたら理由を出す。 */
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
      throw new Error(
        `${objectiveId} の不正解例「${label}」が達成判定されてしまいました。\n  SQL: ${sql}`,
      );
    }
    expect(passed).toBe(false);
  }
}

// ============================================================================
// obj-01 不審な高額送金を特定する（SELECT / WHERE / ORDER BY）
// ============================================================================
describe('obj-01 不審な高額送金を特定する', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-01', {
      金額ちょうどで絞る: `SELECT id, amount FROM transactions WHERE amount = 1000000`,
      範囲で絞る: `SELECT * FROM transactions WHERE amount >= 1000000`,
      並べ替えて上位を見る: `SELECT * FROM transactions ORDER BY amount DESC LIMIT 5`,
      深夜に絞る: `SELECT * FROM transactions WHERE time(occurred_at) < '06:00:00'`,
      摘要なしの高額: `SELECT id, amount, occurred_at FROM transactions
                         WHERE memo IS NULL AND amount >= 500000`,
    });
  });

  it('全件ダンプでは通らない（絞り込めていない）', () => {
    expectNoneSolve('obj-01', {
      全件: `SELECT * FROM transactions`,
      全件を並べ替えただけ: `SELECT * FROM transactions ORDER BY occurred_at DESC`,
    });
  });

  it('惜しいが違う絞り込みでは通らない', () => {
    expectNoneSolve('obj-01', {
      '100万円を含まない範囲': `SELECT * FROM transactions WHERE amount > 1000000`,
      別の高額取引だけ: `SELECT * FROM transactions WHERE id = 4788`,
      金額列が無い: `SELECT id FROM transactions WHERE amount = 1000000`,
    });
  });
});

// ============================================================================
// obj-02 送金アカウントの持ち主を突き止める（JOIN）
// ============================================================================
describe('obj-02 送金アカウントの持ち主を突き止める', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-02', {
      'INNER JOIN': `SELECT e.name, t.amount FROM transactions t
                     JOIN employees e ON e.id = t.employee_id WHERE t.id = 4821`,
      旧式のカンマ結合: `SELECT e.name, t.amount FROM transactions t, employees e
                          WHERE e.id = t.employee_id AND t.amount = 1000000`,
      'LEFT JOIN': `SELECT e.name, t.amount FROM transactions t
                    LEFT JOIN employees e ON e.id = t.employee_id WHERE t.id = 4821`,
      サブクエリで名前を引く: `SELECT
          (SELECT name FROM employees WHERE id = t.employee_id) AS name, t.amount
        FROM transactions t WHERE t.id = 4821`,
      全列を出す: `SELECT * FROM transactions t JOIN employees e ON e.id = t.employee_id
                     WHERE t.amount >= 1000000`,
    });
  });

  it('JOIN していない結果では通らない（名前と金額が揃わない）', () => {
    expectNoneSolve('obj-02', {
      名前だけ: `SELECT name FROM employees WHERE id = 7`,
      取引だけ: `SELECT * FROM transactions WHERE id = 4821`,
      結合しているが全件: `SELECT e.name, t.amount FROM transactions t
                             JOIN employees e ON e.id = t.employee_id`,
      別人を結合: `SELECT e.name, t.amount FROM transactions t
                     JOIN employees e ON e.id = t.employee_id WHERE t.id = 4788`,
    });
  });
});

// ============================================================================
// obj-03 送金直前のログイン記録を洗う（時刻の範囲条件）
// ============================================================================
describe('obj-03 送金直前のログイン記録を洗う', () => {
  it('時刻の絞り方が違っても到達できる', () => {
    expectAllSolve('obj-03', {
      'LIKE で時台を指定': `SELECT * FROM login_logs WHERE occurred_at LIKE '2026-03-14 02%'`,
      'BETWEEN で挟む': `SELECT * FROM login_logs
        WHERE occurred_at BETWEEN '2026-03-14 02:00:00' AND '2026-03-14 02:15:00'`,
      不等号で挟む: `SELECT * FROM login_logs
        WHERE occurred_at >= '2026-03-14 00:00:00' AND occurred_at < '2026-03-15 00:00:00'`,
      'date() を使う': `SELECT * FROM login_logs WHERE date(occurred_at) = '2026-03-14'`,
      成功だけに絞る: `SELECT * FROM login_logs
        WHERE occurred_at LIKE '2026-03-14%' AND result = 'success'`,
    });
  });

  it('全件や別の日では通らない', () => {
    expectNoneSolve('obj-03', {
      全件: `SELECT * FROM login_logs`,
      前日: `SELECT * FROM login_logs WHERE date(occurred_at) = '2026-03-13'`,
      失敗だけ: `SELECT * FROM login_logs
        WHERE occurred_at LIKE '2026-03-14%' AND result = 'failure'`,
    });
  });
});

// ============================================================================
// obj-04 山田咲は本当に社内にいたのか
// ============================================================================
describe('obj-04 山田咲の在館を確認する', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-04', {
      IDで絞って新しい順: `SELECT * FROM access_logs WHERE employee_id = 7
                             ORDER BY occurred_at DESC`,
      最新1件だけ: `SELECT * FROM access_logs WHERE employee_id = 7
                      ORDER BY occurred_at DESC LIMIT 1`,
      '名前で絞る（JOIN）': `SELECT a.direction, a.occurred_at FROM access_logs a
        JOIN employees e ON e.id = a.employee_id WHERE e.name = '山田 咲'
        ORDER BY a.occurred_at DESC`,
      サブクエリで社員を引く: `SELECT * FROM access_logs
        WHERE employee_id = (SELECT id FROM employees WHERE name = '山田 咲')
        ORDER BY occurred_at DESC`,
      事件前後に絞る: `SELECT * FROM access_logs
        WHERE employee_id = 7 AND occurred_at >= '2026-03-13'`,
    });
  });

  it('全件ダンプや別人では通らない', () => {
    expectNoneSolve('obj-04', {
      全件: `SELECT * FROM access_logs`,
      別人: `SELECT * FROM access_logs WHERE employee_id = 12`,
      入館だけ: `SELECT * FROM access_logs WHERE employee_id = 7 AND direction = 'in'`,
    });
  });
});

// ============================================================================
// obj-05 犯行時刻に在館していた人物を割り出す（サブクエリ / GROUP BY）
// ============================================================================
describe('obj-05 犯行時刻の在館者を割り出す', () => {
  it('集計でもウィンドウ関数でも到達できる', () => {
    expectAllSolve('obj-05', {
      'GROUP BY + MAX でサブクエリ': `
        SELECT e.name
        FROM access_logs a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.occurred_at <= '2026-03-14 02:14:33'
          AND a.occurred_at = (
            SELECT MAX(occurred_at) FROM access_logs
            WHERE employee_id = a.employee_id AND occurred_at <= '2026-03-14 02:14:33'
          )
          AND a.direction = 'in'`,
      ウィンドウ関数: `
        WITH last_move AS (
          SELECT employee_id, direction,
                 ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY occurred_at DESC) AS rn
          FROM access_logs WHERE occurred_at <= '2026-03-14 02:14:33'
        )
        SELECT e.name FROM last_move l JOIN employees e ON e.id = l.employee_id
        WHERE l.rn = 1 AND l.direction = 'in'`,
      入館数と退館数を比べる: `
        SELECT e.name
        FROM access_logs a JOIN employees e ON e.id = a.employee_id
        WHERE a.occurred_at <= '2026-03-14 02:14:33'
        GROUP BY e.name
        HAVING SUM(CASE WHEN a.direction = 'in' THEN 1 ELSE -1 END) > 0`,
      当日の入館者から退館者を除く: `
        SELECT e.name FROM employees e
        WHERE e.id IN (SELECT employee_id FROM access_logs
                       WHERE direction = 'in' AND occurred_at BETWEEN '2026-03-14 00:00:00' AND '2026-03-14 02:14:33')
          AND e.id NOT IN (SELECT employee_id FROM access_logs
                       WHERE direction = 'out' AND occurred_at BETWEEN '2026-03-14 00:00:00' AND '2026-03-14 02:14:33')`,
    });
  });

  it('絞り込みが甘いと通らない（在館者は一人だけのはず）', () => {
    expectNoneSolve('obj-05', {
      全社員: `SELECT name FROM employees`,
      在籍者全員: `SELECT name FROM employees WHERE status = 'active'`,
      情シス部員: `SELECT name FROM employees WHERE department = '情報システム部'`,
      '3/13に入館した全員': `SELECT DISTINCT e.name FROM access_logs a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.direction = 'in' AND date(a.occurred_at) = '2026-03-13'`,
      時刻の条件を忘れている: `
        WITH last_move AS (
          SELECT employee_id, direction,
                 ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY occurred_at DESC) AS rn
          FROM access_logs
        )
        SELECT e.name FROM last_move l JOIN employees e ON e.id = l.employee_id
        WHERE l.rn = 1 AND l.direction = 'in'`,
    });
  });
});

// ============================================================================
// obj-06 端末 10.0.4.112 の持ち主を調べる
// ============================================================================
describe('obj-06 端末の持ち主を調べる', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-06', {
      IPで絞ってJOIN: `SELECT e.name, l.ip_address FROM login_logs l
        JOIN employees e ON e.id = l.employee_id WHERE l.ip_address = '10.0.4.112'`,
      成功だけ: `SELECT e.name, l.ip_address, l.occurred_at FROM login_logs l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.ip_address = '10.0.4.112' AND l.result = 'success'`,
      利用者を数える: `SELECT e.name, l.ip_address, COUNT(*) AS c FROM login_logs l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.ip_address = '10.0.4.112' GROUP BY e.name, l.ip_address`,
      'LIKE で絞る': `SELECT e.name, l.ip_address FROM login_logs l
        JOIN employees e ON e.id = l.employee_id WHERE l.ip_address LIKE '%.112'`,
    });
  });

  it('IPで絞らない・JOINしないと通らない', () => {
    expectNoneSolve('obj-06', {
      全件JOIN: `SELECT e.name, l.ip_address FROM login_logs l
        JOIN employees e ON e.id = l.employee_id`,
      名前がない: `SELECT * FROM login_logs WHERE ip_address = '10.0.4.112'`,
      別の端末: `SELECT e.name, l.ip_address FROM login_logs l
        JOIN employees e ON e.id = l.employee_id WHERE l.ip_address = '10.0.4.107'`,
    });
  });
});

// ============================================================================
// obj-07 不正アクセスの痕跡を見つける
// ============================================================================
describe('obj-07 不正アクセスの痕跡を見つける', () => {
  it('生ログでも到達できる', () => {
    expectAllSolve('obj-07', {
      山田の失敗を並べる: `SELECT * FROM login_logs WHERE employee_id = 7 AND result = 'failure'
        ORDER BY occurred_at`,
      当日の失敗: `SELECT * FROM login_logs
        WHERE result = 'failure' AND occurred_at LIKE '2026-03-14%'`,
      失敗を全部見る: `SELECT * FROM login_logs WHERE result = 'failure' ORDER BY occurred_at`,
      端末で絞る: `SELECT occurred_at, result FROM login_logs
        WHERE ip_address = '10.0.4.112' AND result = 'failure'`,
      名前で絞る: `SELECT l.occurred_at, l.result FROM login_logs l
        JOIN employees e ON e.id = l.employee_id
        WHERE e.name = '山田 咲' AND l.result = 'failure'`,
    });
  });

  it('成功だけ・全件では通らない', () => {
    expectNoneSolve('obj-07', {
      全件: `SELECT * FROM login_logs`,
      成功だけ: `SELECT * FROM login_logs WHERE employee_id = 7 AND result = 'success'`,
      別人の失敗: `SELECT * FROM login_logs WHERE employee_id = 12 AND result = 'failure'`,
    });
  });
});

// ============================================================================
// 最終回答
// ============================================================================
describe('最終回答', () => {
  it('正解を受理する', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '田中 誠',
        method: '他人のアカウントの認証情報を使って送金した',
      }),
    ).toBe(true);
  });

  it('犯人だけ合っていても受理しない', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '田中 誠',
        method: '自分のアカウントで送金した',
      }),
    ).toBe(false);
  });

  it('記録上の実行者（山田 咲）を答えても受理しない', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '山田 咲',
        method: '他人のアカウントの認証情報を使って送金した',
      }),
    ).toBe(false);
  });

  it('すべての誤答候補を拒否する', () => {
    const [culpritField, methodField] = c.solution.finalAnswer.fields;
    if (!culpritField || !methodField) throw new Error('finalAnswer のフィールドが足りません');

    for (const culprit of culpritField.options) {
      for (const method of methodField.options) {
        const correct = culprit === culpritField.correct && method === methodField.correct;
        expect(evaluateFinalAnswer(c.solution.finalAnswer, { culprit, method })).toBe(correct);
      }
    }
  });

  it('総当たりが現実的でない選択肢数を保つ', () => {
    const combinations = c.solution.finalAnswer.fields.reduce(
      (total, field) => total * field.options.length,
      1,
    );
    expect(combinations).toBeGreaterThanOrEqual(30);
  });
});
