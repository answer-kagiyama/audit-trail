import type { SqlValue } from '../../engine/types.ts';

export interface FormattedCell {
  text: string;
  /** NULL は空文字と見分けがつかないと捜査が破綻するので、別扱いにする。 */
  isNull: boolean;
  /** 数値は右寄せにして桁を揃える。 */
  isNumeric: boolean;
}

export function formatCell(value: SqlValue): FormattedCell {
  if (value === null) return { text: 'NULL', isNull: true, isNumeric: false };
  if (typeof value === 'number') {
    return { text: formatNumber(value), isNull: false, isNumeric: true };
  }
  if (typeof value === 'boolean') {
    // SQLite に真偽型はないが、契約上は来うる。SQLite の見え方に揃える。
    return { text: value ? '1' : '0', isNull: false, isNumeric: true };
  }
  if (value instanceof Uint8Array) {
    return { text: `<BLOB ${String(value.byteLength)} bytes>`, isNull: false, isNumeric: false };
  }
  // 空文字は NULL と区別できるよう、そうと分かる形で見せる。
  if (value === '') return { text: '(空文字)', isNull: false, isNumeric: false };
  return { text: value, isNull: false, isNumeric: false };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // 金額の桁を読み違えないよう区切るが、ID を壊さないため整数4桁までは素のまま。
  if (Number.isInteger(value) && Math.abs(value) < 10_000) return String(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 10 });
}
