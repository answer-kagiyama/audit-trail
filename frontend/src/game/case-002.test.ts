/**
 * CASE 002「改ざんされた在庫」の検証。
 *
 * CASE 001 と同じく「CASEデータを直したせいでクリアできなくなったことを、
 * 人間より先に検出する」ためのテスト。各 Objective について
 *   - 複数の正解例が「すべて」通ること
 *   - 明らかな不正解（全件ダンプ・別テーブル・惜しいが違う絞り込み）が「通らない」こと
 * を確かめる。
 *
 * このCASEにはもう一つ、CASE 001 に無かった役目がある。
 * **データの不変条件そのものを検算する**こと（末尾の describe）。
 * 棚卸しとの突き合わせ・マイナス在庫・遡及登録の3つは、seed.sql の1行が
 * ずれただけで判定が割れる。正解例が通ることだけを見ていても気づけない。
 *
 * @see docs/cases/case-002.md
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { evaluateFinalAnswer } from './checks.ts';
import { objectiveAssertions } from '../test/objectiveAssertions.ts';
import { loadCase } from '../test/caseFixture.ts';
import type { LoadedCase } from '../test/caseFixture.ts';

let c: LoadedCase;

beforeAll(async () => {
  c = await loadCase('case-002');
});

afterAll(() => {
  c.dispose();
});

const { expectAllSolve, expectNoneSolve } = objectiveAssertions(() => c);

/** 各時点の帳簿在庫。obj-03 の想定解でも、検算でも使う。 */
const LEDGER = `
  WITH ledger AS (
    SELECT product_id, occurred_at,
           SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END)
             OVER (PARTITION BY product_id ORDER BY occurred_at) AS book_qty
    FROM movements
  )`;

// ============================================================================
// obj-01 棚卸しの記録を確かめる（JOIN の復習）
// ============================================================================
describe('obj-01 棚卸しの記録を確かめる', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-01', {
      型番で絞る: `SELECT p.code, s.counted_at, s.counted_quantity
        FROM stocktakes s JOIN products p ON p.id = s.product_id
        WHERE p.code = 'SX-400' ORDER BY s.counted_at`,
      商品IDで絞る: `SELECT counted_at, counted_quantity FROM stocktakes WHERE product_id = 1`,
      サブクエリで絞る: `SELECT counted_at, counted_quantity FROM stocktakes
        WHERE product_id = (SELECT id FROM products WHERE code = 'SX-400')`,
      直近の棚卸しだけ: `SELECT p.code, s.counted_at, s.counted_quantity
        FROM stocktakes s JOIN products p ON p.id = s.product_id
        WHERE s.counted_at = '2026-06-16'`,
    });
  });

  it('全件ダンプでは通らない', () => {
    expectNoneSolve('obj-01', {
      棚卸し全件: `SELECT * FROM stocktakes`,
      並べ替えただけ: `SELECT * FROM stocktakes ORDER BY counted_at DESC`,
    });
  });

  it('別商品・別の回では通らない', () => {
    expectNoneSolve('obj-01', {
      別商品: `SELECT counted_at, counted_quantity FROM stocktakes WHERE product_id = 2`,
      過去の回だけ: `SELECT counted_at, counted_quantity FROM stocktakes
        WHERE product_id = 1 AND counted_at < '2026-01-01'`,
      数量列が無い: `SELECT counted_at FROM stocktakes WHERE product_id = 1`,
    });
  });
});

// ============================================================================
// obj-02 SX-400 の在庫がどう動いたか洗い出す
// ============================================================================
describe('obj-02 SX-400 の在庫がどう動いたか洗い出す', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-02', {
      全行を出す: `SELECT m.* FROM movements m
        JOIN products p ON p.id = m.product_id WHERE p.code = 'SX-400'`,
      商品IDで絞って全行: `SELECT * FROM movements WHERE product_id = 1`,
      サブクエリで絞る: `SELECT * FROM movements
        WHERE product_id = (SELECT id FROM products WHERE code = 'SX-400')`,
      列を選んで出す: `SELECT id, kind, quantity, occurred_at, created_at
        FROM movements WHERE product_id = 1`,
    });
  });

  it('全商品を混ぜると通らない（行数が多すぎる）', () => {
    expectNoneSolve('obj-02', {
      全件: `SELECT * FROM movements`,
      種類だけ全商品: `SELECT * FROM movements WHERE kind IN ('in', 'out', 'disposal')`,
    });
  });

  it('種類が欠けていると通らない', () => {
    expectNoneSolve('obj-02', {
      入出庫のみ: `SELECT * FROM movements WHERE product_id = 1 AND kind <> 'disposal'`,
      廃棄のみ: `SELECT * FROM movements WHERE product_id = 1 AND kind = 'disposal'`,
      // 5商品すべてが in/out/disposal をそろえているので、種類だけでは商品を特定できない。
      // SX-400 固有の廃棄数量（7個・6個）まで見て初めて絞り込めたと言える。
      別商品: `SELECT * FROM movements WHERE product_id = 4`,
      種類だけで数量が無い: `SELECT DISTINCT kind FROM movements WHERE product_id = 1`,
    });
  });
});

// ============================================================================
// obj-03 在庫の推移を再現する（Window Function / このCASEの主役）
// ============================================================================
describe('obj-03 在庫の推移を再現する', () => {
  it('累積和の書き方が違っても到達できる', () => {
    expectAllSolve('obj-03', {
      'CTE + PARTITION BY': `${LEDGER}
        SELECT occurred_at, book_qty FROM ledger WHERE book_qty < 0 ORDER BY occurred_at`,
      サブクエリに入れる: `SELECT occurred_at, book_qty FROM (
          SELECT occurred_at,
                 SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END)
                   OVER (PARTITION BY product_id ORDER BY occurred_at) AS book_qty
          FROM movements
        ) WHERE book_qty < 0`,
      'SX-400 に絞ってから累積': `SELECT occurred_at, running FROM (
          SELECT occurred_at,
                 SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END)
                   OVER (ORDER BY occurred_at) AS running
          FROM movements WHERE product_id = 1
        ) WHERE running < 0`,
      商品名も一緒に出す: `${LEDGER}
        SELECT l.occurred_at, p.code, l.book_qty FROM ledger l
        JOIN products p ON p.id = l.product_id WHERE l.book_qty < 0`,
      'ROWS 指定を明示': `SELECT occurred_at, q FROM (
          SELECT occurred_at,
                 SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END)
                   OVER (PARTITION BY product_id ORDER BY occurred_at
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS q
          FROM movements
        ) WHERE q < 0`,
    });
  });

  it('集計しただけでは通らない（途中経過が消える）', () => {
    expectNoneSolve('obj-03', {
      商品ごとの合計: `SELECT product_id,
          SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END) AS book_qty
        FROM movements GROUP BY product_id`,
      期末在庫がマイナスの商品: `SELECT product_id,
          SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END) AS book_qty
        FROM movements GROUP BY product_id
        HAVING SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END) < 0`,
    });
  });

  it('累積は出せていても絞り込めていないと通らない', () => {
    expectNoneSolve('obj-03', {
      推移を全部出しただけ: `${LEDGER} SELECT occurred_at, book_qty FROM ledger`,
      並び順を間違えた累積: `SELECT occurred_at, q FROM (
          SELECT occurred_at,
                 SUM(CASE WHEN kind = 'in' THEN quantity ELSE -quantity END)
                   OVER (PARTITION BY product_id ORDER BY id) AS q
          FROM movements WHERE product_id = 3
        ) WHERE q < 0`,
      符号を付け替えていない: `SELECT occurred_at, q FROM (
          SELECT occurred_at, SUM(quantity) OVER (ORDER BY occurred_at) AS q
          FROM movements WHERE product_id = 1
        ) WHERE q < 0`,
    });
  });
});

// ============================================================================
// obj-04 破損廃棄に偏りがないか調べる
// ============================================================================
describe('obj-04 破損廃棄に偏りがないか調べる', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-04', {
      比率の降順で先頭: `SELECT p.code,
          SUM(CASE WHEN m.kind = 'disposal' THEN m.quantity ELSE 0 END) AS disposed,
          SUM(CASE WHEN m.kind = 'in' THEN m.quantity ELSE 0 END) AS received
        FROM movements m JOIN products p ON p.id = m.product_id
        GROUP BY p.code ORDER BY 1.0 * disposed / received DESC LIMIT 1`,
      'HAVING で閾値': `SELECT p.code FROM movements m
        JOIN products p ON p.id = m.product_id GROUP BY p.code
        HAVING 1.0 * SUM(CASE WHEN m.kind = 'disposal' THEN m.quantity ELSE 0 END)
             / SUM(CASE WHEN m.kind = 'in' THEN m.quantity ELSE 0 END) > 0.05`,
      廃棄数の降順で先頭: `SELECT p.code, SUM(m.quantity) AS disposed
        FROM movements m JOIN products p ON p.id = m.product_id
        WHERE m.kind = 'disposal' GROUP BY p.code ORDER BY disposed DESC LIMIT 1`,
      廃棄の件数で先頭: `SELECT p.code, COUNT(*) AS n
        FROM movements m JOIN products p ON p.id = m.product_id
        WHERE m.kind = 'disposal' GROUP BY p.code ORDER BY n DESC LIMIT 1`,
    });
  });

  it('絞り込めていないと通らない', () => {
    expectNoneSolve('obj-04', {
      全商品を並べただけ: `SELECT p.code,
          SUM(CASE WHEN m.kind = 'disposal' THEN m.quantity ELSE 0 END) AS disposed
        FROM movements m JOIN products p ON p.id = m.product_id GROUP BY p.code`,
      商品マスタ全件: `SELECT code FROM products`,
      出庫量で選んでしまう: `SELECT p.code, SUM(m.quantity) AS shipped
        FROM movements m JOIN products p ON p.id = m.product_id
        WHERE m.kind = 'out' GROUP BY p.code ORDER BY shipped DESC LIMIT 1`,
      単価で選んでしまう: `SELECT code FROM products ORDER BY unit_price DESC LIMIT 1`,
    });
  });
});

// ============================================================================
// obj-05 承認されていない廃棄を洗い出す（LEFT JOIN + IS NULL）
// ============================================================================
describe('obj-05 承認されていない廃棄を洗い出す', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-05', {
      'LEFT JOIN + IS NULL': `SELECT m.id FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        WHERE m.kind = 'disposal' AND a.id IS NULL`,
      'NOT EXISTS': `SELECT id FROM movements m WHERE m.kind = 'disposal'
        AND NOT EXISTS (SELECT 1 FROM disposal_approvals a WHERE a.movement_id = m.id)`,
      'NOT IN': `SELECT id FROM movements WHERE kind = 'disposal'
        AND id NOT IN (SELECT movement_id FROM disposal_approvals)`,
      詳細も一緒に出す: `SELECT m.id, m.occurred_at, m.created_at, s.name
        FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        JOIN staff s ON s.id = m.recorded_by
        WHERE m.kind = 'disposal' AND a.id IS NULL`,
    });
  });

  it('全件ダンプ・普通の JOIN では通らない', () => {
    expectNoneSolve('obj-05', {
      廃棄全件: `SELECT id FROM movements WHERE kind = 'disposal'`,
      '普通の JOIN（承認があるものだけ）': `SELECT m.id FROM movements m
        JOIN disposal_approvals a ON a.movement_id = m.id`,
      全movement: `SELECT id FROM movements`,
    });
  });

  it('おとりを取りこぼすと通らない', () => {
    expectNoneSolve('obj-05', {
      'SX-400 に絞ってしまう': `SELECT m.id FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        WHERE m.kind = 'disposal' AND a.id IS NULL AND m.product_id = 1`,
      遡及登録だけ: `SELECT m.id FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        WHERE m.kind = 'disposal' AND a.id IS NULL AND m.created_at > m.occurred_at`,
    });
  });
});

// ============================================================================
// obj-06 後から書き足された記録を洗い出す（列どうしの比較）
// ============================================================================
describe('obj-06 後から書き足された記録を洗い出す', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-06', {
      列どうしを比べるだけ: `SELECT id FROM movements WHERE created_at > occurred_at`,
      廃棄に絞る: `SELECT id FROM movements
        WHERE kind = 'disposal' AND created_at > occurred_at`,
      承認なしかつ遡及: `SELECT m.id FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        WHERE m.kind = 'disposal' AND a.id IS NULL AND m.created_at > m.occurred_at`,
      不一致で探す: `SELECT id FROM movements WHERE created_at <> occurred_at`,
      詳細も一緒に出す: `SELECT m.id, m.occurred_at, m.created_at, s.name
        FROM movements m JOIN staff s ON s.id = m.recorded_by
        WHERE m.created_at > m.occurred_at ORDER BY m.id`,
    });
  });

  it('おとり（その場で登録した無承認廃棄）が混ざると通らない', () => {
    expectNoneSolve('obj-06', {
      承認なしを全部: `SELECT m.id FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        WHERE m.kind = 'disposal' AND a.id IS NULL`,
      廃棄全件: `SELECT id FROM movements WHERE kind = 'disposal'`,
    });
  });

  it('比較の向きを間違えると通らない', () => {
    expectNoneSolve('obj-06', {
      向きが逆: `SELECT id FROM movements WHERE created_at < occurred_at`,
      一致するものを取る: `SELECT id FROM movements WHERE created_at = occurred_at`,
    });
  });
});

// ============================================================================
// obj-07 無承認廃棄を繰り返している人物を特定する
// ============================================================================
describe('obj-07 無承認廃棄を繰り返している人物を特定する', () => {
  it('複数の書き方で到達できる', () => {
    expectAllSolve('obj-07', {
      'HAVING で2件以上': `SELECT s.name FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        JOIN staff s ON s.id = m.recorded_by
        WHERE m.kind = 'disposal' AND a.id IS NULL
        GROUP BY s.name HAVING COUNT(*) > 1`,
      件数の降順で先頭: `SELECT s.name, COUNT(*) AS n FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        JOIN staff s ON s.id = m.recorded_by
        WHERE m.kind = 'disposal' AND a.id IS NULL
        GROUP BY s.name ORDER BY n DESC LIMIT 1`,
      遡及登録から辿る: `SELECT DISTINCT s.name FROM movements m
        JOIN staff s ON s.id = m.recorded_by WHERE m.created_at > m.occurred_at`,
    });
  });

  it('おとりを含めてしまうと通らない', () => {
    expectNoneSolve('obj-07', {
      承認なしの記録者を全部: `SELECT DISTINCT s.name FROM movements m
        LEFT JOIN disposal_approvals a ON a.movement_id = m.id
        JOIN staff s ON s.id = m.recorded_by
        WHERE m.kind = 'disposal' AND a.id IS NULL`,
      スタッフ全員: `SELECT name FROM staff`,
      倉庫係全員: `SELECT name FROM staff WHERE role = 'warehouse'`,
      // 判定は列名で照合するので、products にも name があることを踏まえて置く。
      // 人ではなく商品を答えてしまった誤答（docs/case-format.md#判定に使う列名の衝突）。
      商品名を答えてしまった: `SELECT name FROM products WHERE code = 'SX-400'`,
    });
  });
});

// ============================================================================
// 最終回答
// ============================================================================
describe('最終回答', () => {
  const METHOD = '商品を持ち出し、架空の破損廃棄を計上して帳簿を合わせた';

  it('正解が受理される', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, { culprit: '相沢 亮', method: METHOD }),
    ).toBe(true);
  });

  it('おとりの人物では受理されない', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, { culprit: '大野 恵', method: METHOD }),
    ).toBe(false);
  });

  it('CASE 001 の手口をなぞった回答では受理されない', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, {
        culprit: '相沢 亮',
        method: '他人のアカウントで記録を作った',
      }),
    ).toBe(false);
  });

  it('手口だけ合っていても犯人が違えば受理されない', () => {
    expect(
      evaluateFinalAnswer(c.solution.finalAnswer, { culprit: '篠原 美和', method: METHOD }),
    ).toBe(false);
  });
});

// ============================================================================
// データの不変条件（docs/cases/case-002.md §5）
//
// 正解例が通ることだけを見ていても、seed.sql が微妙に壊れたことには
// 気づけない。判定が成立する前提そのものをここで検算する。
// ============================================================================
describe('seed.sql の不変条件', () => {
  const nums = (sql: string): number[][] => c.run(sql).rows.map((row) => row.map((v) => Number(v)));

  it('棚卸しで帳簿と実地が食い違うのは SX-400 の 2026-06-16 だけ', () => {
    const rows = c.run(`
      SELECT p.code, s.counted_at,
             (SELECT SUM(CASE WHEN m.kind = 'in' THEN m.quantity ELSE -m.quantity END)
              FROM movements m
              WHERE m.product_id = s.product_id AND m.occurred_at <= s.counted_at)
             - s.counted_quantity AS diff
      FROM stocktakes s JOIN products p ON p.id = s.product_id
      WHERE diff <> 0`).rows;

    expect(rows.map((r) => [String(r[0]), String(r[1]), Number(r[2])])).toEqual([
      ['SX-400', '2026-06-16', 12],
    ]);
  });

  it('累積在庫がマイナスになるのは SX-400 の2時点だけ', () => {
    const rows = c.run(`${LEDGER}
      SELECT p.code, l.occurred_at, l.book_qty FROM ledger l
      JOIN products p ON p.id = l.product_id
      WHERE l.book_qty < 0 ORDER BY l.occurred_at`).rows;

    expect(rows.map((r) => [String(r[0]), String(r[1]), Number(r[2])])).toEqual([
      ['SX-400', '2025-10-20 19:05:00', -2],
      ['SX-400', '2026-01-20 19:50:00', -3],
    ]);
  });

  it('created_at > occurred_at になるのは相沢の3件だけ', () => {
    const rows = c.run(`
      SELECT m.id, s.name FROM movements m JOIN staff s ON s.id = m.recorded_by
      WHERE m.created_at > m.occurred_at ORDER BY m.id`).rows;

    expect(rows.map((r) => [Number(r[0]), String(r[1])])).toEqual([
      [105, '相沢 亮'],
      [107, '相沢 亮'],
      [111, '相沢 亮'],
    ]);
  });

  it('正規の記録は created_at と occurred_at が完全に一致する', () => {
    // ここが1秒でもずれると、obj-06 が正規の記録まで拾ってしまう。
    const [row] = nums(`SELECT COUNT(*) FROM movements
      WHERE created_at <> occurred_at AND id NOT IN (105, 107, 111)`);
    expect(row?.[0]).toBe(0);
  });

  it('棚卸し日と同日の movement は無い', () => {
    // 「棚卸しの前か後か」で解釈が割れ、obj-03 の正解が2通りになるため。
    const [row] = nums(`SELECT COUNT(*) FROM movements
      WHERE substr(occurred_at, 1, 10) IN (SELECT counted_at FROM stocktakes)`);
    expect(row?.[0]).toBe(0);
  });

  it('承認のない廃棄はちょうど4件（うち1件はおとり）', () => {
    const rows = c.run(`
      SELECT m.id, s.name FROM movements m
      LEFT JOIN disposal_approvals a ON a.movement_id = m.id
      JOIN staff s ON s.id = m.recorded_by
      WHERE m.kind = 'disposal' AND a.id IS NULL ORDER BY m.id`).rows;

    expect(rows.map((r) => [Number(r[0]), String(r[1])])).toEqual([
      [105, '相沢 亮'],
      [107, '相沢 亮'],
      [111, '相沢 亮'],
      [308, '大野 恵'],
    ]);
  });

  it('SX-400 の廃棄率が突出している（他商品の10倍以上）', () => {
    const rows = nums(`
      SELECT p.id,
             CAST(1000 * SUM(CASE WHEN m.kind = 'disposal' THEN m.quantity ELSE 0 END)
                  / SUM(CASE WHEN m.kind = 'in' THEN m.quantity ELSE 0 END) AS INTEGER)
      FROM movements m JOIN products p ON p.id = m.product_id
      GROUP BY p.id ORDER BY 2 DESC`);

    const top = rows[0];
    const second = rows[1];
    expect(top?.[0]).toBe(1); // SX-400
    expect(top?.[1]).toBeGreaterThan((second?.[1] ?? 0) * 10);
  });

  it('quantity はすべて正の数（符号は kind が決める）', () => {
    const [row] = nums(`SELECT COUNT(*) FROM movements WHERE quantity <= 0`);
    expect(row?.[0]).toBe(0);
  });
});
