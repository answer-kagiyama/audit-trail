/**
 * cases/ 配下の CASE を Node のテストから読むためのヘルパー。
 *
 * アプリのローダー（Issue #22）はまだ無いが、CASE の検証は
 * ローダーを待たずにできる。JSON を直接読んで判定エンジンに渡す。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Check, FinalAnswerSpec } from '../game/checks.ts';
import type { SchemaDoc } from '../game/caseTypes.ts';
import { SqlJsCore } from '../engine/sqlJsCore.ts';
import type { QueryResult } from '../engine/types.ts';

const require = createRequire(import.meta.url);
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(frontendRoot, '..');

export interface CaseMetadata {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  difficulty: number;
  estimatedMinutes: [number, number];
  sqlConcepts: string[];
  dialect: string;
  files: Record<string, string>;
}

export interface ObjectiveDoc {
  id: string;
  title: string;
  brief: string;
  prerequisites: string[];
  rewards: { evidence: string[]; storyBeats: string[] };
}

export interface StoryDoc {
  prologue: { title: string; body: string };
  objectives: ObjectiveDoc[];
  evidence: { id: string; title: string; body: string }[];
  storyBeats: { id: string; body: string }[];
  epilogue: { title: string; body: string };
}

export interface SolutionDoc {
  checks: Record<string, Check[]>;
  finalAnswer: FinalAnswerSpec;
}

export type HintsDoc = Record<string, { level: number; body: string }[]>;

export interface LoadedCase {
  dir: string;
  metadata: CaseMetadata;
  schema: SchemaDoc;
  story: StoryDoc;
  solution: SolutionDoc;
  hints: HintsDoc;
  /** SQLを実行して結果を返す。CASE DB は読み取り専用。 */
  run: (sql: string) => QueryResult;
  dispose: () => void;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** テストの実行時間を無駄にしないよう、CASE ごとに一度だけ読む。 */
const cache = new Map<string, LoadedCase>();

export async function loadCase(caseId: string): Promise<LoadedCase> {
  const cached = cache.get(caseId);
  if (cached) return cached;

  const dir = resolve(repoRoot, 'cases', caseId);
  const metadata = readJson<CaseMetadata>(resolve(dir, 'metadata.json'));

  const core = new SqlJsCore({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  await core.init();
  core.loadDatabase(
    new Uint8Array(readFileSync(resolve(dir, metadata.files.database ?? 'database.sqlite'))),
  );

  const loaded: LoadedCase = {
    dir,
    metadata,
    schema: readJson<SchemaDoc>(resolve(dir, metadata.files.schema ?? 'schema.json')),
    story: readJson<StoryDoc>(resolve(dir, metadata.files.story ?? 'story.json')),
    solution: readJson<SolutionDoc>(resolve(dir, metadata.files.solution ?? 'solution.json')),
    hints: readJson<HintsDoc>(resolve(dir, metadata.files.hints ?? 'hints.json')),
    // 検証テストでは打ち切りたくないので上限を大きく取る。
    run: (sql: string) => core.execute(sql, 100_000),
    dispose: () => {
      core.dispose();
    },
  };

  cache.set(caseId, loaded);
  return loaded;
}
