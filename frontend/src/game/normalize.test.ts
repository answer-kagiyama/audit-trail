import { describe, expect, it } from 'vitest';
import { normalizeValue, rowKey, valuesEqual } from './normalize.ts';

/**
 * docs/case-format.md §5.3「値の正規化ルール」の表の全行に対応するテスト。
 * 表を変えたらここも変わる。
 */
describe('正規化ルール（case-format.md §5.3）', () => {
  it('NULL は null のまま。空文字とは区別する', () => {
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue('')).toBe('');
    expect(valuesEqual(null, '')).toBe(false);
    expect(valuesEqual(null, null)).toBe(true);
  });

  it('数値は数値として比較する。1000000 と 1000000.0 は等しい', () => {
    expect(valuesEqual(1000000, 1000000.0)).toBe(true);
  });

  it('浮動小数は絶対誤差 1e-9 以内なら等しい', () => {
    expect(valuesEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(valuesEqual(1.0, 1.0000000001)).toBe(true);
    // 1e-9 をわずかでも超えれば別物として扱う。
    expect(valuesEqual(1.0, 1.00000001)).toBe(false);
    expect(valuesEqual(1.0, 1.0001)).toBe(false);
  });

  it('数値と数字文字列は等しい（SQLite の型の緩さを吸収する）', () => {
    expect(valuesEqual(1000000, '1000000')).toBe(true);
    expect(valuesEqual('42', 42)).toBe(true);
    expect(valuesEqual(-3.5, '-3.5')).toBe(true);
  });

  it('数字に見えない文字列は数値化しない', () => {
    expect(normalizeValue('10.0.4.112')).toBe('10.0.4.112');
    expect(normalizeValue('2026-03-14')).toBe('2026-03-14');
    expect(normalizeValue('1e5')).toBe('1e5');
    expect(valuesEqual('1e5', 100000)).toBe(false);
  });

  it('文字列は前後の空白を落とす', () => {
    expect(normalizeValue('  山田 咲  ')).toBe('山田 咲');
    expect(valuesEqual(' success ', 'success')).toBe(true);
  });

  it('文字列の内側の空白は保つ（氏名の区切りが消えてはいけない）', () => {
    expect(normalizeValue('山田 咲')).toBe('山田 咲');
    expect(valuesEqual('山田 咲', '山田咲')).toBe(false);
  });

  it('既定では大小文字を区別する', () => {
    expect(valuesEqual('Success', 'success')).toBe(false);
  });

  it('caseInsensitive: true なら大小文字を無視する', () => {
    expect(valuesEqual('Success', 'success', { caseInsensitive: true })).toBe(true);
  });

  it('真偽値は 1 / 0 に正規化する', () => {
    expect(normalizeValue(true)).toBe(1);
    expect(normalizeValue(false)).toBe(0);
    expect(valuesEqual(true, 1)).toBe(true);
    expect(valuesEqual(false, '0')).toBe(true);
  });

  it('BLOB は通常の文字列と一致しない', () => {
    const blob = new Uint8Array([1, 2, 3]);
    expect(valuesEqual(blob, 'blob:3')).toBe(false);
    expect(valuesEqual(blob, new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('日時は文字列として比較する（パースしない）', () => {
    expect(valuesEqual('2026-03-14 02:14:33', '2026-03-14 02:14:33')).toBe(true);
    // 表記が違えば別物。CASEデータ側で表記を統一する責任を持つ。
    expect(valuesEqual('2026-03-14 02:14:33', '2026-03-14T02:14:33')).toBe(false);
  });
});

describe('rowKey', () => {
  it('型が違えば別のキーになる', () => {
    expect(rowKey([normalizeValue(null)])).not.toBe(rowKey([normalizeValue('')]));
  });

  it('-0 と 0 は同じキー', () => {
    expect(rowKey([-0])).toBe(rowKey([0]));
  });

  it('列の並びが違えば別のキー', () => {
    expect(rowKey(['a', 'b'])).not.toBe(rowKey(['b', 'a']));
  });

  it('文字列が区切り記号を含んでいても取り違えない', () => {
    expect(rowKey([' str:x', 'y'])).not.toBe(rowKey(['', ' str:x str:y']));
  });
});
