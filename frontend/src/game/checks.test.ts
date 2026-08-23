import { describe, expect, it } from 'vitest';
import { evaluateCheck, evaluateChecks, evaluateFinalAnswer } from './checks.ts';
import type { Check, FinalAnswerSpec } from './checks.ts';
import type { QueryResult, SqlValue } from '../engine/types.ts';

function result(columns: string[], rows: SqlValue[][]): QueryResult {
  return { columns, rows, rowCount: rows.length, truncated: false, elapsedMs: 1 };
}

describe('containsRows', () => {
  const check: Check = {
    type: 'containsRows',
    columns: ['id', 'amount'],
    rows: [[4821, 1000000]],
  };

  it('期待する行を含んでいれば通る', () => {
    expect(evaluateCheck(check, result(['id', 'amount'], [[4821, 1000000]])).passed).toBe(true);
  });

  it('余分な列があってもよい', () => {
    const actual = result(['id', 'employee_id', 'amount', 'memo'], [[4821, 7, 1000000, null]]);
    expect(evaluateCheck(check, actual).passed).toBe(true);
  });

  it('余分な行があってもよい', () => {
    const actual = result(
      ['id', 'amount'],
      [
        [4712, 1250000],
        [4821, 1000000],
        [4788, 1500000],
      ],
    );
    expect(evaluateCheck(check, actual).passed).toBe(true);
  });

  it('行の順序は問わない', () => {
    const actual = result(
      ['id', 'amount'],
      [
        [4788, 1500000],
        [4821, 1000000],
      ],
    );
    expect(evaluateCheck(check, actual).passed).toBe(true);
  });

  it('列名の大小文字は無視する', () => {
    expect(evaluateCheck(check, result(['ID', 'AMOUNT'], [[4821, 1000000]])).passed).toBe(true);
  });

  it('期待する行が無ければ落ちる', () => {
    expect(evaluateCheck(check, result(['id', 'amount'], [[4712, 1250000]])).passed).toBe(false);
  });

  it('必要な列が無ければ落ちる', () => {
    const outcome = evaluateCheck(check, result(['id'], [[4821]]));
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('amount');
  });

  it('数値と数字文字列の揺れを吸収する', () => {
    expect(evaluateCheck(check, result(['id', 'amount'], [['4821', '1000000']])).passed).toBe(true);
  });

  it('maxRows を超える結果は落ちる（全件ダンプで通してしまわない）', () => {
    const many = Array.from({ length: 30 }, (_, i) => [4800 + i, 1000] as SqlValue[]);
    many.push([4821, 1000000]);
    const limited: Check = { ...check, options: { maxRows: 20 } };
    const outcome = evaluateCheck(limited, result(['id', 'amount'], many));
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('絞り込めていません');
  });

  it('maxRows 以内なら通る', () => {
    const limited: Check = { ...check, options: { maxRows: 20 } };
    expect(evaluateCheck(limited, result(['id', 'amount'], [[4821, 1000000]])).passed).toBe(true);
  });
});

describe('resultSet', () => {
  const check: Check = {
    type: 'resultSet',
    columns: ['name'],
    rows: [['山田 咲'], ['田中 誠']],
  };

  it('行の多重集合が一致すれば通る（順序は問わない）', () => {
    expect(evaluateCheck(check, result(['name'], [['田中 誠'], ['山田 咲']])).passed).toBe(true);
  });

  it('余分な行があれば落ちる', () => {
    const actual = result(['name'], [['山田 咲'], ['田中 誠'], ['佐藤 健一']]);
    expect(evaluateCheck(check, actual).passed).toBe(false);
  });

  it('余分な列があれば落ちる', () => {
    const actual = result(
      ['name', 'department'],
      [
        ['山田 咲', '経理部'],
        ['田中 誠', '情報システム部'],
      ],
    );
    expect(evaluateCheck(check, actual).passed).toBe(false);
  });

  it('重複行の数まで一致させる', () => {
    const dup: Check = { type: 'resultSet', columns: ['name'], rows: [['山田 咲'], ['山田 咲']] };
    expect(evaluateCheck(dup, result(['name'], [['山田 咲']])).passed).toBe(false);
    expect(evaluateCheck(dup, result(['name'], [['山田 咲'], ['山田 咲']])).passed).toBe(true);
  });

  it('orderedRows: true なら行順も問う', () => {
    const ordered: Check = { ...check, options: { orderedRows: true } };
    expect(evaluateCheck(ordered, result(['name'], [['山田 咲'], ['田中 誠']])).passed).toBe(true);
    expect(evaluateCheck(ordered, result(['name'], [['田中 誠'], ['山田 咲']])).passed).toBe(false);
  });

  it('orderedColumns: true なら列の並びも問う', () => {
    const two: Check = {
      type: 'resultSet',
      columns: ['name', 'amount'],
      rows: [['山田 咲', 1000000]],
      options: { orderedColumns: true },
    };
    expect(evaluateCheck(two, result(['name', 'amount'], [['山田 咲', 1000000]])).passed).toBe(
      true,
    );
    expect(evaluateCheck(two, result(['amount', 'name'], [[1000000, '山田 咲']])).passed).toBe(
      false,
    );
  });
});

describe('columnValues', () => {
  const check: Check = {
    type: 'columnValues',
    column: 'name',
    values: ['田中 誠'],
    options: { exact: true },
  };

  it('値の集合が一致すれば通る', () => {
    expect(evaluateCheck(check, result(['name'], [['田中 誠']])).passed).toBe(true);
  });

  it('他の列があってもよい', () => {
    const actual = result(['name', 'occurred_at'], [['田中 誠', '2026-03-14 01:47:03']]);
    expect(evaluateCheck(check, actual).passed).toBe(true);
  });

  it('exact: true では余分な値があると落ちる', () => {
    expect(evaluateCheck(check, result(['name'], [['田中 誠'], ['山田 咲']])).passed).toBe(false);
  });

  it('exact: false では包含だけ見る', () => {
    const loose: Check = { ...check, options: { exact: false } };
    expect(evaluateCheck(loose, result(['name'], [['田中 誠'], ['山田 咲']])).passed).toBe(true);
  });

  it('重複した値は1種として数える', () => {
    const actual = result(['name'], [['田中 誠'], ['田中 誠'], ['田中 誠']]);
    expect(evaluateCheck(check, actual).passed).toBe(true);
  });

  it('列が無ければ落ちる', () => {
    expect(evaluateCheck(check, result(['id'], [[12]])).passed).toBe(false);
  });
});

describe('evaluateChecks', () => {
  it('checks 配列は AND（すべて満たしてはじめて達成）', () => {
    const a: Check = { type: 'containsRows', columns: ['id'], rows: [[1]] };
    const b: Check = { type: 'containsRows', columns: ['id'], rows: [[2]] };
    expect(evaluateChecks([a, b], result(['id'], [[1], [2]])).passed).toBe(true);
    expect(evaluateChecks([a, b], result(['id'], [[1]])).passed).toBe(false);
  });

  it('空の checks は通る', () => {
    expect(evaluateChecks([], result(['id'], [])).passed).toBe(true);
  });
});

describe('evaluateFinalAnswer', () => {
  const spec: FinalAnswerSpec = {
    fields: [
      {
        id: 'culprit',
        label: '犯人',
        type: 'select',
        options: ['田中 誠', '山田 咲'],
        correct: '田中 誠',
      },
      { id: 'method', label: '手口', type: 'select', options: ['A', 'B'], correct: 'B' },
    ],
    requireAll: true,
  };

  it('すべて正解なら受理する', () => {
    expect(evaluateFinalAnswer(spec, { culprit: '田中 誠', method: 'B' })).toBe(true);
  });

  it('一つでも違えば拒否する', () => {
    expect(evaluateFinalAnswer(spec, { culprit: '田中 誠', method: 'A' })).toBe(false);
    expect(evaluateFinalAnswer(spec, { culprit: '山田 咲', method: 'B' })).toBe(false);
  });

  it('未回答は拒否する', () => {
    expect(evaluateFinalAnswer(spec, { culprit: '田中 誠' })).toBe(false);
    expect(evaluateFinalAnswer(spec, {})).toBe(false);
  });

  it('requireAll: false なら一つ合っていれば受理する', () => {
    const any: FinalAnswerSpec = { ...spec, requireAll: false };
    expect(evaluateFinalAnswer(any, { culprit: '田中 誠', method: 'A' })).toBe(true);
  });
});
