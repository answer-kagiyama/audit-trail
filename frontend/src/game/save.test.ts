import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, loadProgress, saveKey, saveProgress } from './save.ts';
import { initialProgress } from './progression.ts';
import type { ProgressState } from './progression.ts';

/** node 環境には localStorage が無いので、最小限の実装を差し込む。 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  /** setItem を失敗させて、容量超過などを再現する。 */
  failOnWrite = false;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
}

let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CASE_ID = 'case-001';
const VERSION = 1;

function sample(): ProgressState {
  return {
    ...initialProgress(1_700_000_000_000),
    completedObjectives: ['obj-01', 'obj-02'],
    evidence: ['ev-01', 'ev-02'],
    storyBeats: ['beat-01'],
    revealedHints: { 'obj-03': 2 },
    queryCount: 12,
  };
}

describe('保存と復元', () => {
  it('保存した進捗をそのまま復元できる', () => {
    const progress = sample();
    saveProgress(CASE_ID, VERSION, progress);

    const result = loadProgress(CASE_ID, VERSION);
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.progress).toEqual(progress);
  });

  it('保存が無ければ empty', () => {
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'empty' });
  });

  it('CASE ごとに独立している', () => {
    saveProgress(CASE_ID, VERSION, sample());
    expect(loadProgress('case-002', VERSION).kind).toBe('empty');
  });

  it('キーは docs で決めた形式に従う', () => {
    expect(saveKey('case-001')).toBe('audit-trail:progress:v1:case-001');
  });
});

describe('セーブを捨てる場合', () => {
  it('CASE の version が上がっていたら捨てる', () => {
    saveProgress(CASE_ID, 1, sample());
    // CASEデータを更新して version 2 になった、という状況。
    expect(loadProgress(CASE_ID, 2)).toEqual({ kind: 'discarded', reason: 'case-updated' });
    // 捨てたセーブは残さない。次回は empty になる。
    expect(loadProgress(CASE_ID, 2).kind).toBe('empty');
  });

  it('JSON として壊れていたら捨てる', () => {
    store.setItem(saveKey(CASE_ID), '{ this is not json');
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'discarded', reason: 'corrupt' });
    expect(loadProgress(CASE_ID, VERSION).kind).toBe('empty');
  });

  it('形は JSON でも中身が進捗でなければ捨てる', () => {
    store.setItem(saveKey(CASE_ID), JSON.stringify({ hello: 'world' }));
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'discarded', reason: 'corrupt' });
  });

  it('進捗の一部が欠けていたら捨てる（中途半端に復元しない）', () => {
    store.setItem(
      saveKey(CASE_ID),
      JSON.stringify({
        saveFormat: 1,
        caseVersion: VERSION,
        progress: { completedObjectives: ['obj-01'] },
      }),
    );
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'discarded', reason: 'corrupt' });
  });

  it('型が違う値が混ざっていたら捨てる', () => {
    store.setItem(
      saveKey(CASE_ID),
      JSON.stringify({
        saveFormat: 1,
        caseVersion: VERSION,
        progress: { ...sample(), completedObjectives: [1, 2, 3] },
      }),
    );
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'discarded', reason: 'corrupt' });
  });

  it('セーブ形式そのものが変わっていたら捨てる', () => {
    store.setItem(
      saveKey(CASE_ID),
      JSON.stringify({ saveFormat: 99, caseVersion: VERSION, progress: sample() }),
    );
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'discarded', reason: 'format-changed' });
  });

  it('クリア済み（clearedAt が数値）も復元できる', () => {
    const cleared = { ...sample(), clearedAt: 1_700_000_100_000 };
    saveProgress(CASE_ID, VERSION, cleared);
    const result = loadProgress(CASE_ID, VERSION);
    expect(result.kind === 'loaded' && result.progress.clearedAt).toBe(1_700_000_100_000);
  });
});

describe('リセット', () => {
  it('消すと empty になる', () => {
    saveProgress(CASE_ID, VERSION, sample());
    clearProgress(CASE_ID);
    expect(loadProgress(CASE_ID, VERSION).kind).toBe('empty');
  });
});

describe('localStorage が使えない環境', () => {
  it('localStorage が無くても落ちない', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => {
      saveProgress(CASE_ID, VERSION, sample());
    }).not.toThrow();
    expect(loadProgress(CASE_ID, VERSION)).toEqual({ kind: 'empty' });
    expect(() => {
      clearProgress(CASE_ID);
    }).not.toThrow();
  });

  it('書き込みに失敗しても落ちない（容量超過など）', () => {
    store.failOnWrite = true;
    expect(() => {
      saveProgress(CASE_ID, VERSION, sample());
    }).not.toThrow();
    // 保存できていないので復元は empty。プレイは続けられる。
    expect(loadProgress(CASE_ID, VERSION).kind).toBe('empty');
  });
});
