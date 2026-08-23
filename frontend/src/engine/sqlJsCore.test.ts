import { describe, expect, it, beforeAll } from 'vitest';
import type { SqlJsCore } from './sqlJsCore.ts';
import { SqlExecutionError } from './types.ts';
import { createLoadedCore } from '../test/nodeSqlJs.ts';

describe('SqlJsCore', () => {
  let core: SqlJsCore;
  beforeAll(async () => {
    core = await createLoadedCore();
  });

  it('静的な .sqlite を読み込んで SELECT できる', () => {
    const result = core.execute('SELECT name, department FROM employees WHERE id = 7', 500);
    expect(result.columns).toEqual(['name', 'department']);
    expect(result.rows).toEqual([['山田 咲', '経理部']]);
    expect(result.rowCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('JOIN が使える', () => {
    const result = core.execute(
      `SELECT e.name, t.amount
         FROM transactions t
         JOIN employees e ON e.id = t.employee_id
        WHERE t.amount >= 1000000`,
      500,
    );
    expect(result.rows).toEqual([['山田 咲', 1000000]]);
  });

  it('CTE と Window Function が使える（難易度カーブの上限を確認する）', () => {
    const result = core.execute(
      `WITH ranked AS (
         SELECT id, amount, ROW_NUMBER() OVER (ORDER BY amount DESC) AS rn
           FROM transactions
       )
       SELECT id, rn FROM ranked WHERE rn = 1`,
      500,
    );
    expect(result.rows).toEqual([[4821, 1]]);
  });

  it('NULL は null のまま返る（空文字と区別する）', () => {
    const result = core.execute('SELECT note FROM employees WHERE id = 1', 500);
    expect(result.rows).toEqual([[null]]);
  });

  it('0件の結果でも列名は返る', () => {
    const result = core.execute('SELECT name FROM employees WHERE id = -1', 500);
    expect(result.columns).toEqual(['name']);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('maxRows で切り捨てても rowCount は総行数を返す', () => {
    const result = core.execute('SELECT id FROM employees ORDER BY id', 2);
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(4);
    expect(result.truncated).toBe(true);
  });

  it('存在しないテーブルは SqlExecutionError になり raw メッセージを保持する', () => {
    try {
      core.execute('SELECT * FROM employee', 500);
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SqlExecutionError);
      expect((e as SqlExecutionError).kind).toBe('unknown');
      expect((e as SqlExecutionError).rawMessage).toContain('no such table');
    }
  });

  it('構文エラーも SqlExecutionError になる', () => {
    expect(() => core.execute('SELEC * FROM employees', 500)).toThrow(SqlExecutionError);
  });

  it('PRAGMA query_only により書き込みが拒否される（多層防御）', () => {
    expect(() =>
      core.execute("INSERT INTO employees VALUES (99,'x','y','active',NULL)", 500),
    ).toThrow(SqlExecutionError);
    const after = core.execute('SELECT COUNT(*) AS c FROM employees', 500);
    expect(after.rows).toEqual([[4]]);
  });
});
