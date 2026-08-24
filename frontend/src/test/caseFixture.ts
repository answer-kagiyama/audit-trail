/**
 * cases/ 配下の CASE を Node のテストから読むためのヘルパー。
 *
 * ファイルの読み込みは Node の fs だが、**パースと検証は本番と同じ
 * caseLoader の parse* を通す**。これにより、CASE 001 が実際に
 * ローダーの検証を通ることもテストのたびに確かめられる。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseHints,
  parseMetadata,
  parseSchema,
  parseSolution,
  parseStory,
} from '../game/caseLoader.ts';
import type {
  CaseData,
  CaseMetadata,
  HintsDoc,
  SchemaDoc,
  SolutionDoc,
  StoryDoc,
} from '../game/caseTypes.ts';
import { SqlJsCore } from '../engine/sqlJsCore.ts';
import type { QueryResult } from '../engine/types.ts';

const require = createRequire(import.meta.url);
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(frontendRoot, '..');

export interface LoadedCase {
  dir: string;
  caseData: CaseData;
  metadata: CaseMetadata;
  schema: SchemaDoc;
  story: StoryDoc;
  solution: SolutionDoc;
  hints: HintsDoc;
  /** SQLを実行して結果を返す。CASE DB は読み取り専用。 */
  run: (sql: string) => QueryResult;
  dispose: () => void;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/**
 * cases/ にあるCASEを全部数え上げる。
 *
 * 構造検証のテストは「いま存在するCASE全部」に掛けたい。ここを手書きの
 * 配列にすると、CASEを足した人が更新を忘れて検証から漏れる——それを
 * 防ぐために、ディレクトリを正とする。
 */
export function allCaseIds(): string[] {
  return readdirSync(resolve(repoRoot, 'cases'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** テストの実行時間を無駄にしないよう、CASE ごとに一度だけ読む。 */
const cache = new Map<string, LoadedCase>();

export async function loadCase(caseId: string): Promise<LoadedCase> {
  const cached = cache.get(caseId);
  if (cached) return cached;

  const dir = resolve(repoRoot, 'cases', caseId);
  const metadata = parseMetadata(readJson(resolve(dir, 'metadata.json')));

  const bytes = readFileSync(resolve(dir, metadata.files.database));
  const core = new SqlJsCore({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  await core.init();
  core.loadDatabase(new Uint8Array(bytes));

  const story = parseStory(readJson(resolve(dir, metadata.files.story)));
  const caseData: CaseData = {
    metadata,
    schema: parseSchema(readJson(resolve(dir, metadata.files.schema))),
    story,
    solution: parseSolution(readJson(resolve(dir, metadata.files.solution)), story),
    hints: parseHints(readJson(resolve(dir, metadata.files.hints)), story),
    database: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };

  const loaded: LoadedCase = {
    dir,
    caseData,
    metadata: caseData.metadata,
    schema: caseData.schema,
    story: caseData.story,
    solution: caseData.solution,
    hints: caseData.hints,
    // 検証テストでは打ち切りたくないので上限を大きく取る。
    run: (sql: string) => core.execute(sql, 100_000),
    dispose: () => {
      core.dispose();
    },
  };

  cache.set(caseId, loaded);
  return loaded;
}
