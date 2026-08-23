import { describe, expect, it } from 'vitest';
import { formatCell } from './formatCell.ts';

describe('formatCell', () => {
  it('NULL は空文字と区別できる形で返す', () => {
    expect(formatCell(null)).toEqual({ text: 'NULL', isNull: true, isNumeric: false });
    expect(formatCell('')).toEqual({ text: '(空文字)', isNull: false, isNumeric: false });
  });

  it('4桁までの整数は桁区切りしない（IDを壊さない）', () => {
    expect(formatCell(4821).text).toBe('4821');
    expect(formatCell(7).text).toBe('7');
  });

  it('大きい数は桁区切りする（金額の読み違いを防ぐ）', () => {
    expect(formatCell(1000000).text).toBe('1,000,000');
  });

  it('数値は右寄せの対象になる', () => {
    expect(formatCell(1000000).isNumeric).toBe(true);
    expect(formatCell('1000000').isNumeric).toBe(false);
  });

  it('小数を丸めない', () => {
    expect(formatCell(0.125).text).toBe('0.125');
  });

  it('真偽値は SQLite の見え方に揃える', () => {
    expect(formatCell(true).text).toBe('1');
    expect(formatCell(false).text).toBe('0');
  });

  it('BLOB はバイト数だけ見せる', () => {
    expect(formatCell(new Uint8Array([1, 2, 3])).text).toBe('<BLOB 3 bytes>');
  });

  it('文字列はそのまま', () => {
    expect(formatCell('山田 咲').text).toBe('山田 咲');
  });
});
