import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStatus, loadCaseIndex } from './caseIndex.ts';
import type { CaseSummary } from './caseIndex.ts';
import { CaseDataError } from './caseLoader.ts';
import { initialProgress } from './progression.ts';
import type { ProgressState } from './progression.ts';
import { saveProgress } from './save.ts';

/** node 環境には localStorage が無いので、最小限の実装を差し込む。 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

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
    this.map.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SUMMARY = {
  id: 'case-001',
  title: '消えた100万円',
  subtitle: '深夜の不正送金事件',
  difficulty: 1,
  estimatedMinutes: [30, 60],
  sqlConcepts: ['SELECT', 'JOIN'],
  version: 2,
  objectiveCount: 7,
};

/** loadCaseIndex が使うぶんだけの Response を返す、最小の fetch。 */
function fetchReturning(body: unknown, ok = true): typeof fetch {
  return (() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 404,
      json: () => Promise.resolve(body),
    })) as unknown as typeof fetch;
}

describe('事件簿の読み込み', () => {
  it('正しい索引を読める', async () => {
    const cases = await loadCaseIndex('/', fetchReturning({ cases: [SUMMARY] }));
    expect(cases).toEqual([SUMMARY]);
  });

  it('CASE が0件でも読める（事件簿は空で出す）', async () => {
    await expect(loadCaseIndex('/', fetchReturning({ cases: [] }))).resolves.toEqual([]);
  });

  it('取得できなければ、どのURLで失敗したかを言う', async () => {
    const error = await loadCaseIndex('/', fetchReturning({}, false)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CaseDataError);
    expect((error as CaseDataError).path).toBe('/cases/index.json');
  });

  it('cases 配列が無ければ弾く', async () => {
    await expect(loadCaseIndex('/', fetchReturning({}))).rejects.toBeInstanceOf(CaseDataError);
  });

  it('壊れている項目は、何番目のどの項目かを指して弾く', async () => {
    const broken = { ...SUMMARY, difficulty: '1' };
    const error = await loadCaseIndex('/', fetchReturning({ cases: [broken] })).catch(
      (e: unknown) => e,
    );
    expect((error as CaseDataError).path).toBe('/cases/index.json.cases[0].difficulty');
  });

  it('estimatedMinutes が2要素でなければ弾く', async () => {
    const broken = { ...SUMMARY, estimatedMinutes: [30] };
    const error = await loadCaseIndex('/', fetchReturning({ cases: [broken] })).catch(
      (e: unknown) => e,
    );
    expect((error as CaseDataError).path).toBe('/cases/index.json.cases[0].estimatedMinutes');
  });

  it('base が付いていれば索引もその下から探す', async () => {
    const fetchImpl = vi.fn(fetchReturning({ cases: [] }));
    await loadCaseIndex('/where/', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/where/cases/index.json');
  });
});

describe('事件簿に出す進捗', () => {
  const summary = SUMMARY as CaseSummary;

  function save(progress: ProgressState): void {
    saveProgress(summary.id, summary.version, progress);
  }

  it('遊んでいなければ未着手', () => {
    expect(caseStatus(summary)).toEqual({ kind: 'untouched' });
  });

  it('開いただけで何も達成していなければ未着手のまま', () => {
    save(initialProgress(1_700_000_000_000));
    expect(caseStatus(summary)).toEqual({ kind: 'untouched' });
  });

  it('達成した数を出す', () => {
    save({ ...initialProgress(1), completedObjectives: ['obj-01', 'obj-02'] });
    expect(caseStatus(summary)).toEqual({ kind: 'in-progress', completed: 2 });
  });

  it('解決済みなら解決済みと出す', () => {
    save({
      ...initialProgress(1),
      completedObjectives: ['obj-01'],
      clearedAt: 1_700_000_000_000,
    });
    expect(caseStatus(summary)).toEqual({ kind: 'solved', completed: 1 });
  });

  it('CASE が更新されていれば、古い進捗は無かったことにする', () => {
    save({ ...initialProgress(1), completedObjectives: ['obj-01'] });
    expect(caseStatus({ ...summary, version: summary.version + 1 })).toEqual({ kind: 'untouched' });
  });
});
