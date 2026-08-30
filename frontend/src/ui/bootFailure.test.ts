import { describe, expect, it } from 'vitest';
import { CaseDataError } from '../game/caseLoader.ts';
import { DISCARD_NOTICE, describeBootFailure } from './bootFailure.ts';

describe('describeBootFailure', () => {
  it('CASEデータの不正は、どのファイルのどこが悪いかを出す', () => {
    const text = describeBootFailure(
      new CaseDataError('story.objectives[0].id', 'id がありません'),
    );
    expect(text).toContain('事件データが不正です');
    expect(text).toContain('story.objectives[0].id');
    expect(text).toContain('id がありません');
  });

  it('WebAssembly の失敗は、ブラウザ側の問題として案内する', () => {
    const text = describeBootFailure(new Error('WebAssembly.instantiate failed'));
    expect(text).toContain('WebAssembly に対応していない');
    // 元のメッセージも残す。報告してもらったときに切り分けられなくなるので。
    expect(text).toContain('WebAssembly.instantiate failed');
  });

  it('取得の失敗は、通信の問題として案内する', () => {
    for (const message of [
      'Failed to fetch',
      'HTTP 404',
      'NetworkError when attempting to fetch',
    ]) {
      expect(describeBootFailure(new Error(message))).toContain('通信状況を確認して');
    }
  });

  it('見当のつかない失敗は、そのまま出す（握りつぶさない）', () => {
    expect(describeBootFailure(new Error('なにかがおかしい'))).toBe('なにかがおかしい');
  });

  it('Error でないものを投げられても文字列にする', () => {
    expect(describeBootFailure('落ちた')).toBe('落ちた');
    expect(describeBootFailure(undefined)).toBe('undefined');
  });
});

describe('DISCARD_NOTICE', () => {
  // 網羅は `Record<DiscardReason, string>` が保証する。ここで見るのは中身が
  // 空でないことだけ——型は「キーがある」までしか言ってくれない。
  it('どの理由にも本文がある', () => {
    for (const notice of Object.values(DISCARD_NOTICE)) {
      expect(notice.length).toBeGreaterThan(0);
    }
  });
});
