/**
 * 正解判定。
 *
 * **SQL文字列は一切見ない。実行結果だけを見る。**
 * 同じ答えに複数の書き方で到達できることがこのゲームの価値そのものであり、
 * SQL文字列の正規化は原理的に破綻する（docs/adr/0004-answer-checking.md）。
 *
 * 純関数。React も WASM も知らないので、Node のテストで高速に回せる。
 */
import type { QueryResult, SqlValue } from '../engine/types.ts';
import { normalizeValue, rowKey } from './normalize.ts';

export interface CheckOptions {
  caseInsensitive?: boolean;
  /**
   * 結果の行数の上限。
   *
   * containsRows は「期待する行を含むこと」しか要求しないので、
   * これが無いと `SELECT * FROM access_logs` のような全件ダンプでも通ってしまう。
   * 「探し当てた」ことを判定に含めるための制約。
   */
  maxRows?: number;
  /** resultSet で列の順序も問うか。既定 false。 */
  orderedColumns?: boolean;
  /** resultSet で行の順序も問うか。既定 false。 */
  orderedRows?: boolean;
  /** columnValues で集合一致を要求するか。false なら包含。既定 true。 */
  exact?: boolean;
}

export type Check =
  | { type: 'containsRows'; columns: string[]; rows: SqlValue[][]; options?: CheckOptions }
  | { type: 'resultSet'; columns: string[]; rows: SqlValue[][]; options?: CheckOptions }
  | { type: 'columnValues'; column: string; values: SqlValue[]; options?: CheckOptions };

export interface CheckOutcome {
  passed: boolean;
  /** 落ちた理由。CASE作成時のデバッグ用で、プレイヤーには見せない。 */
  reason?: string;
}

export function evaluateCheck(check: Check, result: QueryResult): CheckOutcome {
  const options = check.options ?? {};

  if (options.maxRows !== undefined && result.rows.length > options.maxRows) {
    return {
      passed: false,
      reason: `結果が ${String(result.rows.length)} 行あります（上限 ${String(options.maxRows)} 行）。絞り込めていません。`,
    };
  }

  switch (check.type) {
    case 'containsRows':
      return evaluateContainsRows(check.columns, check.rows, result, options);
    case 'resultSet':
      return evaluateResultSet(check.columns, check.rows, result, options);
    case 'columnValues':
      return evaluateColumnValues(check.column, check.values, result, options);
  }
}

/** checks 配列は AND。すべて満たしてはじめて達成。 */
export function evaluateChecks(checks: readonly Check[], result: QueryResult): CheckOutcome {
  for (const check of checks) {
    const outcome = evaluateCheck(check, result);
    if (!outcome.passed) return outcome;
  }
  return { passed: true };
}

// --- 各判定タイプ -----------------------------------------------------------

function evaluateContainsRows(
  columns: readonly string[],
  expected: readonly SqlValue[][],
  result: QueryResult,
  options: CheckOptions,
): CheckOutcome {
  const indices = resolveColumns(columns, result.columns);
  if (indices === undefined) {
    return {
      passed: false,
      reason: `列が見つかりません: ${missingColumns(columns, result.columns).join(', ')}`,
    };
  }

  const actual = new Set(
    result.rows.map((row) => rowKey(pick(row, indices).map((v) => normalizeValue(v, options)))),
  );

  for (const row of expected) {
    const key = rowKey(row.map((v) => normalizeValue(v, options)));
    if (!actual.has(key)) {
      return { passed: false, reason: `期待した行が含まれていません: ${JSON.stringify(row)}` };
    }
  }
  return { passed: true };
}

function evaluateResultSet(
  columns: readonly string[],
  expected: readonly SqlValue[][],
  result: QueryResult,
  options: CheckOptions,
): CheckOutcome {
  if (options.orderedColumns === true) {
    const same =
      columns.length === result.columns.length &&
      columns.every((name, index) => equalsColumnName(name, result.columns[index]));
    if (!same) {
      return { passed: false, reason: `列の並びが一致しません: ${result.columns.join(', ')}` };
    }
  } else if (columns.length !== result.columns.length) {
    return {
      passed: false,
      reason: `列数が一致しません（期待 ${String(columns.length)} / 実際 ${String(result.columns.length)}）`,
    };
  }

  const indices = resolveColumns(columns, result.columns);
  if (indices === undefined) {
    return {
      passed: false,
      reason: `列が見つかりません: ${missingColumns(columns, result.columns).join(', ')}`,
    };
  }

  const actualRows = result.rows.map((row) =>
    pick(row, indices).map((v) => normalizeValue(v, options)),
  );
  const expectedRows = expected.map((row) => row.map((v) => normalizeValue(v, options)));

  if (actualRows.length !== expectedRows.length) {
    return {
      passed: false,
      reason: `行数が一致しません（期待 ${String(expectedRows.length)} / 実際 ${String(actualRows.length)}）`,
    };
  }

  if (options.orderedRows === true) {
    for (let i = 0; i < expectedRows.length; i += 1) {
      if (rowKey(expectedRows[i] ?? []) !== rowKey(actualRows[i] ?? [])) {
        return { passed: false, reason: `${String(i + 1)} 行目が一致しません` };
      }
    }
    return { passed: true };
  }

  // 行順は問わないが、重複の数までは一致させる（多重集合の比較）。
  const counts = new Map<string, number>();
  for (const row of actualRows) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of expectedRows) {
    const key = rowKey(row);
    const remaining = counts.get(key) ?? 0;
    if (remaining === 0) {
      return { passed: false, reason: `期待した行がありません: ${JSON.stringify(row)}` };
    }
    counts.set(key, remaining - 1);
  }
  return { passed: true };
}

function evaluateColumnValues(
  column: string,
  expected: readonly SqlValue[],
  result: QueryResult,
  options: CheckOptions,
): CheckOutcome {
  const index = result.columns.findIndex((name) => equalsColumnName(name, column));
  if (index === -1) return { passed: false, reason: `列が見つかりません: ${column}` };

  const actual = new Set(
    result.rows.map((row) => rowKey([normalizeValue(row[index] ?? null, options)])),
  );
  const wanted = new Set(expected.map((value) => rowKey([normalizeValue(value, options)])));

  for (const key of wanted) {
    if (!actual.has(key)) {
      return { passed: false, reason: `期待した値が含まれていません: ${column}` };
    }
  }

  if (options.exact !== false && actual.size !== wanted.size) {
    return {
      passed: false,
      reason: `値の集合が一致しません（期待 ${String(wanted.size)} 種 / 実際 ${String(actual.size)} 種）`,
    };
  }
  return { passed: true };
}

// --- 最終回答 ---------------------------------------------------------------

export interface FinalAnswerField {
  id: string;
  label: string;
  type: 'select';
  options: string[];
  correct: string;
}

export interface FinalAnswerSpec {
  fields: FinalAnswerField[];
  requireAll: boolean;
}

export function evaluateFinalAnswer(
  spec: FinalAnswerSpec,
  answers: Readonly<Record<string, string>>,
): boolean {
  const results = spec.fields.map((field) => answers[field.id] === field.correct);
  return spec.requireAll ? results.every(Boolean) : results.some(Boolean);
}

// --- 補助 -------------------------------------------------------------------

/** 列名の照合は大小文字を無視する（case-format.md §5.3）。 */
function equalsColumnName(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function resolveColumns(
  wanted: readonly string[],
  actual: readonly string[],
): number[] | undefined {
  const indices: number[] = [];
  for (const name of wanted) {
    const index = actual.findIndex((candidate) => equalsColumnName(candidate, name));
    if (index === -1) return undefined;
    indices.push(index);
  }
  return indices;
}

function missingColumns(wanted: readonly string[], actual: readonly string[]): string[] {
  return wanted.filter((name) => !actual.some((candidate) => equalsColumnName(candidate, name)));
}

function pick(row: readonly SqlValue[], indices: readonly number[]): SqlValue[] {
  return indices.map((index) => row[index] ?? null);
}
