/**
 * 事件簿（CASE一覧）。
 *
 * 索引は `sync-cases.mjs` が各CASEの metadata.json / story.json から生成する。
 * 一覧を出すためだけに全CASEの本体を読むのは無駄なので、必要な項目だけを持つ。
 */
import { CaseDataError } from './caseLoader.ts';
import { loadProgress } from './save.ts';

export interface CaseSummary {
  id: string;
  title: string;
  subtitle: string;
  difficulty: number;
  estimatedMinutes: [number, number];
  sqlConcepts: string[];
  version: number;
  objectiveCount: number;
}

/** 事件簿に出す進捗。CASE本体を読まずに localStorage だけで決まる。 */
export type CaseStatus =
  | { kind: 'untouched' }
  | { kind: 'in-progress'; completed: number }
  | { kind: 'solved'; completed: number };

export function caseStatus(summary: CaseSummary): CaseStatus {
  const restored = loadProgress(summary.id, summary.version);
  if (restored.kind !== 'loaded') return { kind: 'untouched' };

  const completed = restored.progress.completedObjectives.length;
  if (restored.progress.clearedAt !== null) return { kind: 'solved', completed };
  if (completed === 0) return { kind: 'untouched' };
  return { kind: 'in-progress', completed };
}

export async function loadCaseIndex(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaseSummary[]> {
  const url = `${baseUrl}cases/index.json`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new CaseDataError(url, `事件簿を取得できませんでした（HTTP ${String(response.status)}）`);
  }

  const raw: unknown = await response.json();
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as { cases?: unknown }).cases)
  ) {
    throw new CaseDataError(url, 'cases 配列がありません');
  }

  return (raw as { cases: unknown[] }).cases.map((item, index) =>
    parseSummary(item, `${url}.cases[${String(index)}]`),
  );
}

function parseSummary(raw: unknown, path: string): CaseSummary {
  if (typeof raw !== 'object' || raw === null) {
    throw new CaseDataError(path, 'オブジェクトではありません');
  }
  const record = raw as Record<string, unknown>;

  const text = (key: string): string => {
    const value = record[key];
    if (typeof value !== 'string')
      throw new CaseDataError(`${path}.${key}`, '文字列ではありません');
    return value;
  };
  const num = (key: string): number => {
    const value = record[key];
    if (typeof value !== 'number') throw new CaseDataError(`${path}.${key}`, '数値ではありません');
    return value;
  };

  const minutes = record['estimatedMinutes'];
  if (!Array.isArray(minutes) || minutes.length !== 2) {
    throw new CaseDataError(`${path}.estimatedMinutes`, '[最小, 最大] の2要素にしてください');
  }

  const concepts = record['sqlConcepts'];
  if (!Array.isArray(concepts) || !concepts.every((c) => typeof c === 'string')) {
    throw new CaseDataError(`${path}.sqlConcepts`, '文字列の配列にしてください');
  }

  return {
    id: text('id'),
    title: text('title'),
    subtitle: text('subtitle'),
    difficulty: num('difficulty'),
    estimatedMinutes: [Number(minutes[0]), Number(minutes[1])],
    sqlConcepts: concepts,
    version: num('version'),
    objectiveCount: num('objectiveCount'),
  };
}
